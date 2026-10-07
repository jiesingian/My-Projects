-- Reminders follow each household's own time zone (roadmap item 9,
-- follow-up to 20261007110000_household_time_zone).
--
-- The five-minute reminder functions worked out "now" once, in Manila, for
-- every household: a dose at its time, a bill from 09:00, a birthday from
-- 08:00, the week ahead on Sunday from 19:00, quiet hours outside 09:00-21:00.
-- Each now asks household_clock() for every household's own local time and
-- checks those hours per household. A household that never changed its zone
-- is in Manila, so nothing moves for it.
--
-- safe_time_zone() falls back to Manila for a zone name Postgres does not
-- know (the shape check on families.time_zone cannot ask), so one bad row
-- can never stop the tick for everyone.
--
-- Each function below is its latest version replaced whole, with only its
-- clock changed (and its early "not the right hour" return turned into a
-- per-household filter):
--   due_reminders              20260929012000_reminders_for_me
--   due_week_ahead_reminders   20260930170000_week_ahead_opens_digest
--   due_pantry_reminders       20260928100000_pantry_running_low
--   due_trial_reminders        20260929140000_trial_seven_days
--   due_goal_reward_reminders  20260929003000_goal_reward_assurance
-- due_scheduled_messages works on instants and needs nothing.

create or replace function public.safe_time_zone(p_zone text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  perform now() at time zone p_zone;
  return p_zone;
exception when others then
  return 'Asia/Manila';
end;
$$;

create or replace function public.household_clock(p_now timestamptz)
returns table (family_id uuid, tz text, local_now timestamp, today date)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, z.tz, p_now at time zone z.tz, (p_now at time zone z.tz)::date
  from public.families f
  cross join lateral (select public.safe_time_zone(f.time_zone) as tz) z
$$;

-- Internal to the due_*() functions, which run as their owner.
revoke all on function public.safe_time_zone(text) from public, anon, authenticated;
revoke all on function public.household_clock(timestamptz) from public, anon, authenticated;

create or replace function public.due_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  expected text := kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  delete from reminder_sends where sent_at < p_now - interval '40 days';

  return query
  with zones as (
    select hc.family_id, hc.local_now, hc.today from household_clock(p_now) hc
  ),
  grownups as (
    select m.id, m.family_id, m.role from members m where m.status = 'active' and m.role in ('parent', 'adult')
  ),
  doses as (
    select 'dose:' || med.id || ':' || d.day || ':' || t.time as key,
           med.family_id, 'health'::text as kind,
           array(
             select x from (
               select med.member_id as x from members pm where pm.id = med.member_id and pm.status = 'active'
               union
               select g.id from grownups g
               join members pm on pm.id = med.member_id
               where g.family_id = med.family_id and pm.role in ('child_managed', 'child_self')
                 and (med.visibility = 'family' or (med.visibility = 'parents' and g.role = 'parent') or g.id = med.created_by)
             ) r
           ) as recipients,
           'Time for ' || split_part(pm.full_name, ' ', 1) || '''s ' || med.name as title,
           coalesce(med.dose || ' · ', '') || t.time || '. Tap to tick it.' as body,
           '/family/members/' || med.member_id || '?view=health&seg=medicines' as url
    from health_medicines med
    join zones z on z.family_id = med.family_id
    join members pm on pm.id = med.member_id
    cross join lateral unnest(med.times) as t(time)
    cross join lateral (values (z.today), (z.today - 1)) as d(day)
    where med.start_date <= d.day and (med.end_date is null or med.end_date >= d.day)
      and (d.day + t.time::time) <= z.local_now
      and (d.day + t.time::time) > z.local_now - interval '15 minutes'
      and not exists (select 1 from health_medicine_doses hd where hd.medicine_id = med.id and hd.dose_date = d.day and hd.dose_time = t.time)
  ),
  bills_due as (
    select 'bill:' || b.id || ':' || b.due_date || ':' || case when b.due_date = z.today then 'today' else 'eve' end as key,
           b.family_id, 'bills'::text as kind,
           array(select g.id from grownups g where g.family_id = b.family_id) as recipients,
           case when b.due_date = z.today then b.name || ' is due today' else b.name || ' is due tomorrow' end as title,
           'Tap to pay or mark it paid.' as body,
           '/wealth' as url
    from bills b
    join zones z on z.family_id = b.family_id
    where b.status <> 'paid' and b.paid_at is null
      and b.due_date in (z.today, z.today + 1)
      and z.local_now::time >= time '09:00'
  ),
  birthdays as (
    select 'bday:' || e.id || ':' || extract(year from z.today) as key,
           e.family_id, 'events'::text as kind,
           array(select m.id from members m where m.family_id = e.family_id and m.status = 'active') as recipients,
           e.title as title,
           'Today. Say happy birthday!' as body,
           '/planner?seg=events' as url
    from events e
    join zones z on z.family_id = e.family_id
    where e.kind = 'birthday'
      and (e.event_date = z.today or (e.recurs_yearly and extract(month from e.event_date) = extract(month from z.today) and extract(day from e.event_date) = extract(day from z.today)))
      and z.local_now::time >= time '08:00'
  ),
  soon as (
    -- Whoever the plan is for; everyone when it is for the whole family or
    -- nobody in particular; and, when it is for a child, the grown-ups too --
    -- the same rule Today uses (lib/for-me.ts).
    select 'soon:' || a.id || ':' || a.start_at as key,
           a.family_id, 'events'::text as kind,
           case when a.applies_to_whole_family or not exists (select 1 from activity_members am where am.activity_id = a.id)
             then array(select m.id from members m where m.family_id = a.family_id and m.status = 'active')
             else array(
               select am.member_id from activity_members am join members m on m.id = am.member_id where am.activity_id = a.id and m.status = 'active'
               union
               select g.id from grownups g
               where g.family_id = a.family_id
                 and exists (select 1 from activity_members am join members c on c.id = am.member_id
                             where am.activity_id = a.id and c.role in ('child_managed', 'child_self'))
             )
           end as recipients,
           'In 30 minutes: ' || a.title as title,
           coalesce('At ' || nullif(a.location, '') || '. Time to get going.', 'Time to get going.') as body,
           '/planner' as url
    from activities a
    where a.start_at > p_now and a.start_at <= p_now + interval '35 minutes'
      and a.status not in ('done', 'cancelled', 'skipped')
  ),
  candidates as (
    select * from doses union all select * from bills_due union all select * from birthdays union all select * from soon
  ),
  fresh as (
    insert into reminder_sends (key)
    select c.key from candidates c where cardinality(c.recipients) > 0
    on conflict do nothing
    returning reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh f on f.key = c.key
  join push_subscriptions s on s.family_id = c.family_id and s.member_id = any (c.recipients)
  join members m on m.id = s.member_id
  where m.status = 'active' and coalesce((m.notification_prefs ->> c.kind)::boolean, true);
end;
$$;

revoke all on function public.due_reminders(text, timestamptz) from public;
grant execute on function public.due_reminders(text, timestamptz) to anon, authenticated;

create or replace function public.due_week_ahead_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  expected text := kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  return query
  with zones as (
    -- Households where it is Sunday (isodow 7), from 19:00 to before 22:00,
    -- in their own time zone.
    select hc.family_id, hc.tz, hc.today, hc.today + 1 as week_start, hc.today + 7 as week_end
    from household_clock(p_now) hc
    where extract(isodow from hc.today) = 7 and hc.local_now::time >= time '19:00' and hc.local_now::time < time '22:00'
  ),
  grownups as (
    select m.id, m.family_id from members m where m.status = 'active' and m.role in ('parent', 'adult')
  ),
  things as (
    -- One-off plans, with who they are for.
    select a.family_id, (a.start_at at time zone z.tz)::date as on_day, a.title as label,
           a.applies_to_whole_family as whole,
           array(select am.member_id from activity_members am where am.activity_id = a.id) as tagged
    from activities a
    join zones z on z.family_id = a.family_id
    where (a.start_at at time zone z.tz)::date between z.week_start and z.week_end
      and a.status not in ('completed', 'cancelled', 'done', 'skipped')
    union all
    -- Bills to pay: the household's, so every grown-up's.
    select b.family_id, b.due_date, b.name || ' due', true, '{}'::uuid[]
    from bills b
    join zones z on z.family_id = b.family_id
    where b.status <> 'paid' and b.paid_at is null
      and b.due_date between z.week_start and z.week_end
    union all
    -- Dated events that happen once, with who they are for.
    select e.family_id, e.event_date, e.title,
           e.applies_to_whole_family,
           array(select em.member_id from event_members em where em.event_id = e.id)
    from events e
    join zones z on z.family_id = e.family_id
    where not e.recurs_yearly
      and e.event_date between z.week_start and z.week_end
    union all
    -- Birthdays and anniversaries, on this year's date: everyone's to
    -- remember. A 29 February one is kept on the 28th in a year without one.
    select e.family_id, d.day,
           case when e.kind = 'birthday' and e.title !~* 'birthday|bday|kaarawan' then e.title || '''s birthday'
                when e.kind = 'anniversary' and e.title !~* 'anniversary' then e.title || '''s anniversary'
                else e.title end,
           true, '{}'::uuid[]
    from events e
    join zones z on z.family_id = e.family_id
    cross join lateral generate_series(z.week_start, z.week_end, interval '1 day') as g(ts)
    cross join lateral (select g.ts::date as day) d
    where e.recurs_yearly
      and (
        to_char(e.event_date, 'MM-DD') = to_char(d.day, 'MM-DD')
        or (to_char(e.event_date, 'MM-DD') = '02-29' and to_char(d.day, 'MM-DD') = '02-28'
            and to_char(d.day + 1, 'MM-DD') = '03-01')
      )
  ),
  -- Each grown-up's own week: what is for the whole family, for nobody in
  -- particular, for them, or for one of the children -- never another
  -- grown-up's own plans (lib/for-me.ts, the same rule Today uses).
  mine as (
    select g.id as member_id, t.family_id, t.on_day, t.label
    from things t
    join grownups g on g.family_id = t.family_id
    where t.whole
       or cardinality(t.tagged) = 0
       or g.id = any (t.tagged)
       or exists (select 1 from members c where c.id = any (t.tagged) and c.role in ('child_managed', 'child_self'))
  ),
  ranked as (
    select t.member_id, t.family_id, t.label || ' ' || to_char(t.on_day, 'Dy') as line,
           row_number() over (partition by t.member_id order by t.on_day, t.label) as n,
           count(*) over (partition by t.member_id) as total
    from mine t
  ),
  weeks as (
    select r.member_id, r.family_id,
           string_agg(r.line, ', ' order by r.n) filter (where r.n <= 5)
             || case when max(r.total) > 5 then ', +' || (max(r.total) - 5) || ' more' else '' end as lines
    from ranked r
    group by r.member_id, r.family_id
  ),
  candidates as (
    select 'week:' || w.member_id || ':' || z.today as key,
           w.family_id,
           array[w.member_id] as recipients,
           'The week ahead' as title,
           left(w.lines, 180) as body,
           '/today/week' as url
    from weeks w
    join zones z on z.family_id = w.family_id
  ),
  fresh as (
    insert into reminder_sends (key)
    select c.key from candidates c
    on conflict do nothing
    returning reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh f on f.key = c.key
  join push_subscriptions s on s.family_id = c.family_id and s.member_id = any (c.recipients)
  join members m on m.id = s.member_id
  where m.status = 'active' and coalesce((m.notification_prefs ->> 'week_ahead')::boolean, true);
end;
$$;

revoke all on function public.due_week_ahead_reminders(text, timestamptz) from public;
grant execute on function public.due_week_ahead_reminders(text, timestamptz) to anon, authenticated;

create or replace function public.due_pantry_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  expected text := kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  return query
  with zones as (
    -- Households where it is 09:00 or later, in their own time zone.
    select hc.family_id, hc.today from household_clock(p_now) hc where hc.local_now::time >= time '09:00'
  ),
  low as (
    select p.family_id, string_agg(p.name, ', ' order by p.name) as names, count(*) as n
    from pantry_items p
    join zones z on z.family_id = p.family_id
    where p.running_low
      and not exists (
        select 1 from buy_items b
        where b.family_id = p.family_id and not b.checked and not b.cleared
          and lower(btrim(b.name)) = lower(btrim(p.name))
      )
    group by p.family_id
  ),
  candidates as (
    select 'pantry:' || l.family_id || ':' || z.today as key,
           l.family_id,
           array(select m.id from members m where m.family_id = l.family_id and m.status = 'active' and m.role in ('parent', 'adult')) as recipients,
           case when l.n = 1 then 'Running low: ' || l.names else 'Running low on ' || l.n || ' things' end as title,
           left(l.names, 140) || '. Tap to add them to the list.' as body,
           '/household?seg=buy' as url
    from low l
    join zones z on z.family_id = l.family_id
  ),
  fresh as (
    insert into reminder_sends (key)
    select c.key from candidates c where cardinality(c.recipients) > 0
    on conflict do nothing
    returning reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh f on f.key = c.key
  join push_subscriptions s on s.family_id = c.family_id and s.member_id = any (c.recipients)
  join members m on m.id = s.member_id
  where m.status = 'active' and coalesce((m.notification_prefs ->> 'shopping')::boolean, true);
end;
$$;

revoke all on function public.due_pantry_reminders(text, timestamptz) from public;
grant execute on function public.due_pantry_reminders(text, timestamptz) to anon, authenticated;

create or replace function public.due_trial_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  expected text := kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  return query
  with zones as (
    -- Households where it is 09:00 to before 21:00, in their own time zone.
    select hc.family_id from household_clock(p_now) hc
    where hc.local_now::time >= time '09:00' and hc.local_now::time < time '21:00'
  ),
  candidates as (
    select 'trial:' || f.id || ':3days' as key,
           f.id as family_id,
           'Kin Plus: 3 days left of your trial' as title,
           'After that ' || f.name || ' moves to Kin Free. Your calendar, lists and chat stay. See what Plus keeps.' as body,
           '/subscribe' as url
    from families f
    join zones z on z.family_id = f.id
    where f.access_status = 'trialing'
      and f.access_expires_at > p_now + interval '1 day'
      and f.access_expires_at <= p_now + interval '3 days'
    union all
    select 'trial:' || f.id || ':lastday',
           f.id,
           'Last day of your Kin Plus trial',
           'Tomorrow ' || f.name || ' moves to Kin Free. Nothing you added is lost. Plus is ₱149 a month for the whole family.',
           '/subscribe'
    from families f
    join zones z on z.family_id = f.id
    where f.access_status = 'trialing'
      and f.access_expires_at > p_now
      and f.access_expires_at <= p_now + interval '1 day'
    union all
    select 'trial:' || f.id || ':ended',
           f.id,
           'You''re on Kin Free now',
           'Everything ' || f.name || ' added is still here. Calendar, lists, chat and calls stay free. Plus is ₱149 a month.',
           '/subscribe'
    from families f
    join zones z on z.family_id = f.id
    where f.access_status = 'trialing'
      and f.access_expires_at <= p_now
      and f.access_expires_at > p_now - interval '2 days'
  ),
  fresh as (
    insert into reminder_sends (key)
    select c.key from candidates c
    on conflict do nothing
    returning reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh fr on fr.key = c.key
  join members m on m.family_id = c.family_id and m.is_organiser and m.status = 'active'
  join push_subscriptions s on s.member_id = m.id;
end;
$$;

revoke all on function public.due_trial_reminders(text, timestamptz) from public;
grant execute on function public.due_trial_reminders(text, timestamptz) to anon, authenticated;

create or replace function public.due_goal_reward_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  expected text := kin_vault_secret('kin_cron_secret');
  slot bigint := floor(extract(epoch from p_now) / 300)::bigint;
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  return query
  with zones as (
    -- Households where it is 09:00 to before 21:00, in their own time zone.
    select hc.family_id from household_clock(p_now) hc
    where hc.local_now::time >= time '09:00' and hc.local_now::time < time '21:00'
  ),
  rewards as (
    select r.goal_id, r.title as reward, r.status, r.giver_member_id, r.claimed_at, r.given_at, r.due_at,
           g.title as goal, g.family_id, g.owner_member_id,
           coalesce(split_part(o.full_name, ' ', 1), 'Everyone') as receiver
    from planner_goal_rewards r
    join planner_goals g on g.id = r.goal_id
    join zones z on z.family_id = g.family_id
    left join members o on o.id = g.owner_member_id
    where r.status in ('claimed', 'given')
  ),
  candidates as (
    -- The claim: a day starts.
    select 'goalreward:claimed:' || w.goal_id || ':' || floor(extract(epoch from w.claimed_at))::bigint as key,
           array[w.giver_member_id] as recipients,
           w.receiver || ' reached "' || left(w.goal, 60) || '"' as title,
           'You promised ' || left(w.reward, 80) || '. You have a day to give it, then Kin reminds you every 5 minutes.' as body,
           '/planner?seg=goals' as url
    from rewards w
    where w.status = 'claimed' and w.claimed_at is not null
    union all
    -- Given: the receiver confirms.
    select 'goalreward:given:' || w.goal_id || ':' || floor(extract(epoch from w.given_at))::bigint,
           case when w.owner_member_id is not null then array[w.owner_member_id]
                else array(select m.id from members m where m.family_id = w.family_id and m.status = 'active' and m.id <> w.giver_member_id) end,
           'Did you get ' || left(w.reward, 60) || '?',
           'Confirm it on Today, or say not yet.',
           '/today'
    from rewards w
    where w.status = 'given' and w.given_at is not null
    union all
    -- Overdue: every five minutes until it is settled.
    select 'goalreward:due:' || w.goal_id || ':' || slot,
           array[w.giver_member_id],
           case when w.status = 'claimed' then 'You still owe ' || left(w.reward, 60)
                else left(w.reward, 60) || ' is not confirmed yet' end,
           case when w.status = 'claimed' then w.receiver || ' reached "' || left(w.goal, 60) || '". Give it, then mark it given on Today.'
                else 'Ask ' || w.receiver || ' to confirm they got it. Kin keeps reminding you until they do.' end,
           '/today'
    from rewards w
    where w.due_at is not null and w.due_at <= p_now
  ),
  fresh as (
    insert into reminder_sends (key)
    select c.key from candidates c
    on conflict do nothing
    returning reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh fr on fr.key = c.key
  join push_subscriptions s on s.member_id = any(c.recipients);
end;
$$;

revoke all on function public.due_goal_reward_reminders(text, timestamptz) from public;
grant execute on function public.due_goal_reward_reminders(text, timestamptz) to anon, authenticated;
