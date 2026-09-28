-- Reminders only for what is yours (28 September). Jonathan: "it is ok to
-- have visibility on other members' activities ... but unnecessary to get
-- notified by their activities. If this activities are important for the
-- whole family, the activity should be tagged as for the whole family."
--
-- The rule, the same one Today now uses (src/lib/for-me.ts): something is
-- yours when it is for the whole family, for nobody in particular, for you
-- -- or, for a grown-up, for one of the children, whom grown-ups look after.
-- Another grown-up's own plans are theirs alone.
--
-- Two pushes change:
--
--   * "In 30 minutes" (due_reminders, soon): it already went only to whoever
--     a plan is for. A plan for a child now also reaches the grown-ups --
--     before, a plan for a child with no login of their own reached nobody.
--   * "The week ahead" (due_week_ahead_reminders): one summary per grown-up
--     instead of one per household, built from their own week, so one
--     parent's no longer lists the other's own appointments. Bills and
--     birthdays stay on everyone's. The ledger key is now per member
--     (week:<member>:<day>).
--
-- Doses, bills, birthdays, the pantry and the rest are unchanged. Both
-- functions are replaced whole, with their grants restated.

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
  local_now timestamp := p_now at time zone 'Asia/Manila';
  today date := (p_now at time zone 'Asia/Manila')::date;
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  delete from reminder_sends where sent_at < p_now - interval '40 days';

  return query
  with grownups as (
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
    join members pm on pm.id = med.member_id
    cross join lateral unnest(med.times) as t(time)
    cross join lateral (values (today), (today - 1)) as d(day)
    where med.start_date <= d.day and (med.end_date is null or med.end_date >= d.day)
      and (d.day + t.time::time) <= local_now
      and (d.day + t.time::time) > local_now - interval '15 minutes'
      and not exists (select 1 from health_medicine_doses hd where hd.medicine_id = med.id and hd.dose_date = d.day and hd.dose_time = t.time)
  ),
  bills_due as (
    select 'bill:' || b.id || ':' || b.due_date || ':' || case when b.due_date = today then 'today' else 'eve' end as key,
           b.family_id, 'bills'::text as kind,
           array(select g.id from grownups g where g.family_id = b.family_id) as recipients,
           case when b.due_date = today then b.name || ' is due today' else b.name || ' is due tomorrow' end as title,
           'Tap to pay or mark it paid.' as body,
           '/wealth' as url
    from bills b
    where b.status <> 'paid' and b.paid_at is null
      and b.due_date in (today, today + 1)
      and local_now::time >= time '09:00'
  ),
  birthdays as (
    select 'bday:' || e.id || ':' || extract(year from today) as key,
           e.family_id, 'events'::text as kind,
           array(select m.id from members m where m.family_id = e.family_id and m.status = 'active') as recipients,
           e.title as title,
           'Today. Say happy birthday!' as body,
           '/planner?seg=events' as url
    from events e
    where e.kind = 'birthday'
      and (e.event_date = today or (e.recurs_yearly and extract(month from e.event_date) = extract(month from today) and extract(day from e.event_date) = extract(day from today)))
      and local_now::time >= time '08:00'
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
  local_now timestamp := p_now at time zone 'Asia/Manila';
  today date := (p_now at time zone 'Asia/Manila')::date;
  week_start date := today + 1;
  week_end date := today + 7;
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;
  -- Sundays (isodow 7), from 19:00 to before 22:00.
  if extract(isodow from today) <> 7 or local_now::time < time '19:00' or local_now::time >= time '22:00' then
    return;
  end if;

  return query
  with grownups as (
    select m.id, m.family_id from members m where m.status = 'active' and m.role in ('parent', 'adult')
  ),
  things as (
    -- One-off plans, with who they are for.
    select a.family_id, (a.start_at at time zone 'Asia/Manila')::date as on_day, a.title as label,
           a.applies_to_whole_family as whole,
           array(select am.member_id from activity_members am where am.activity_id = a.id) as tagged
    from activities a
    where (a.start_at at time zone 'Asia/Manila')::date between week_start and week_end
      and a.status not in ('completed', 'cancelled', 'done', 'skipped')
    union all
    -- Bills to pay: the household's, so every grown-up's.
    select b.family_id, b.due_date, b.name || ' due', true, '{}'::uuid[]
    from bills b
    where b.status <> 'paid' and b.paid_at is null
      and b.due_date between week_start and week_end
    union all
    -- Dated events that happen once, with who they are for.
    select e.family_id, e.event_date, e.title,
           e.applies_to_whole_family,
           array(select em.member_id from event_members em where em.event_id = e.id)
    from events e
    where not e.recurs_yearly
      and e.event_date between week_start and week_end
    union all
    -- Birthdays and anniversaries, on this year's date: everyone's to
    -- remember. A 29 February one is kept on the 28th in a year without one.
    select e.family_id, d.day,
           case when e.kind = 'birthday' and e.title !~* 'birthday|bday|kaarawan' then e.title || '''s birthday'
                when e.kind = 'anniversary' and e.title !~* 'anniversary' then e.title || '''s anniversary'
                else e.title end,
           true, '{}'::uuid[]
    from events e
    cross join lateral generate_series(week_start, week_end, interval '1 day') as g(ts)
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
    select 'week:' || w.member_id || ':' || today as key,
           w.family_id,
           array[w.member_id] as recipients,
           'The week ahead' as title,
           left(w.lines, 180) as body,
           '/planner' as url
    from weeks w
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

revoke all on function public.due_reminders(text, timestamptz) from public;
grant execute on function public.due_reminders(text, timestamptz) to anon, authenticated;
revoke all on function public.due_week_ahead_reminders(text, timestamptz) from public;
grant execute on function public.due_week_ahead_reminders(text, timestamptz) to anon, authenticated;
