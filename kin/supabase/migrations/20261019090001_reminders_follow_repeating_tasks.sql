-- The reminder pushes follow repeating tasks (Janine, 15 October).
--
-- 20261014120000 gave a Planner task chosen weekdays (repeat_days) and an
-- end (repeat_until); the Planner, Today, the brief and the calendars follow
-- them, but the two pushes that read activities still looked only at a
-- task's first start_at. Now:
--   due_reminders             "In 30 minutes: Gym" on every day the rule
--                             falls, at its usual time on the household's
--                             clock -- not on a day already ticked Done or
--                             Skip on Today (today_marks), and never after
--                             the end date. One-off plans are unchanged.
--   due_week_ahead_reminders  a repeating plan is one line with its days
--                             that week ("Gym Mon/Wed/Fri"); one-offs are
--                             unchanged.
-- Both are their latest versions (20261007140000_reminders_follow_household_zone)
-- replaced whole with only those parts changed; grants restated as they were.
--
-- activity_occurs_on() is lib/activity-repeat.ts's occursOn in SQL, so the
-- pushes and the screens agree: a row with no days is weekly on its first
-- day's weekday, as every row saved before 14 October is.

create or replace function public.activity_occurs_on(p_repeat text, p_days smallint[], p_until date, p_first date, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_day >= p_first and case
    when coalesce(p_repeat, 'once') not in ('weekly', 'monthly', 'yearly') then p_day = p_first
    when p_until is not null and p_day > p_until then false
    when p_repeat = 'weekly' then
      extract(dow from p_day)::int = any (coalesce(nullif(p_days, '{}'::smallint[]), array[extract(dow from p_first)::smallint])::int[])
    when p_repeat = 'monthly' then extract(day from p_day) = extract(day from p_first)
    else to_char(p_day, 'MM-DD') = to_char(p_first, 'MM-DD')
  end
$$;

-- Internal to the due_*() functions, which run as their owner.
revoke all on function public.activity_occurs_on(text, smallint[], date, date, date) from public, anon, authenticated;

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
    select hc.family_id, hc.tz, hc.local_now, hc.today from household_clock(p_now) hc
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
  -- Plans starting in the next 35 minutes. A one-off at its start_at, as
  -- before; a repeating one (20261014120000) on each day its rule falls, at
  -- its first day's clock time in the household's zone, unless that day was
  -- already marked done or skipped on Today. Its key carries the
  -- occurrence's instant, so each day is sent once -- and its first day's
  -- key is the same as before, so nothing already sent goes again.
  soon_plans as (
    select a.id, a.family_id, a.title, a.location, a.applies_to_whole_family, a.start_at as at
    from activities a
    where coalesce(a.repeat, 'once') not in ('weekly', 'monthly', 'yearly')
      and a.start_at > p_now and a.start_at <= p_now + interval '35 minutes'
      and a.status not in ('done', 'cancelled', 'skipped')
    union all
    select a.id, a.family_id, a.title, a.location, a.applies_to_whole_family, o.at
    from activities a
    join zones z on z.family_id = a.family_id
    cross join lateral (values (z.today), (z.today + 1)) as d(day)
    cross join lateral (select ((d.day + (a.start_at at time zone z.tz)::time) at time zone z.tz) as at) o
    where a.repeat in ('weekly', 'monthly', 'yearly')
      and a.start_at <= p_now + interval '35 minutes'
      and (a.repeat_until is null or a.repeat_until >= z.today)
      and activity_occurs_on(a.repeat, a.repeat_days, a.repeat_until, (a.start_at at time zone z.tz)::date, d.day)
      and o.at > p_now and o.at <= p_now + interval '35 minutes'
      and not exists (select 1 from today_marks tm
                      where tm.family_id = a.family_id and tm.item_key = 'activity-' || a.id and tm.day = d.day)
  ),
  soon as (
    -- Whoever the plan is for; everyone when it is for the whole family or
    -- nobody in particular; and, when it is for a child, the grown-ups too --
    -- the same rule Today uses (lib/for-me.ts).
    select 'soon:' || p.id || ':' || p.at as key,
           p.family_id, 'events'::text as kind,
           case when p.applies_to_whole_family or not exists (select 1 from activity_members am where am.activity_id = p.id)
             then array(select m.id from members m where m.family_id = p.family_id and m.status = 'active')
             else array(
               select am.member_id from activity_members am join members m on m.id = am.member_id where am.activity_id = p.id and m.status = 'active'
               union
               select g.id from grownups g
               where g.family_id = p.family_id
                 and exists (select 1 from activity_members am join members c on c.id = am.member_id
                             where am.activity_id = p.id and c.role in ('child_managed', 'child_self'))
             )
           end as recipients,
           'In 30 minutes: ' || p.title as title,
           coalesce('At ' || nullif(p.location, '') || '. Time to get going.', 'Time to get going.') as body,
           '/planner' as url
    from soon_plans p
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
           array(select am.member_id from activity_members am where am.activity_id = a.id) as tagged,
           null::text as days
    from activities a
    join zones z on z.family_id = a.family_id
    where coalesce(a.repeat, 'once') not in ('weekly', 'monthly', 'yearly')
      and (a.start_at at time zone z.tz)::date between z.week_start and z.week_end
      and a.status not in ('completed', 'cancelled', 'done', 'skipped')
    union all
    -- Repeating plans (20261014120000): one line each, on the days of the
    -- week its rule falls -- "Gym Mon/Wed/Fri" -- rather than a line a day.
    select a.family_id, min(d.day), a.title,
           a.applies_to_whole_family,
           array(select am.member_id from activity_members am where am.activity_id = a.id),
           string_agg(to_char(d.day, 'Dy'), '/' order by d.day)
    from activities a
    join zones z on z.family_id = a.family_id
    cross join lateral generate_series(z.week_start, z.week_end, interval '1 day') as g(ts)
    cross join lateral (select g.ts::date as day) d
    where a.repeat in ('weekly', 'monthly', 'yearly')
      and activity_occurs_on(a.repeat, a.repeat_days, a.repeat_until, (a.start_at at time zone z.tz)::date, d.day)
    group by a.id, a.family_id, a.title, a.applies_to_whole_family
    union all
    -- Bills to pay: the household's, so every grown-up's.
    select b.family_id, b.due_date, b.name || ' due', true, '{}'::uuid[], null
    from bills b
    join zones z on z.family_id = b.family_id
    where b.status <> 'paid' and b.paid_at is null
      and b.due_date between z.week_start and z.week_end
    union all
    -- Dated events that happen once, with who they are for.
    select e.family_id, e.event_date, e.title,
           e.applies_to_whole_family,
           array(select em.member_id from event_members em where em.event_id = e.id), null
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
           true, '{}'::uuid[], null
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
    select g.id as member_id, t.family_id, t.on_day, t.label, t.days
    from things t
    join grownups g on g.family_id = t.family_id
    where t.whole
       or cardinality(t.tagged) = 0
       or g.id = any (t.tagged)
       or exists (select 1 from members c where c.id = any (t.tagged) and c.role in ('child_managed', 'child_self'))
  ),
  ranked as (
    select t.member_id, t.family_id, t.label || ' ' || coalesce(t.days, to_char(t.on_day, 'Dy')) as line,
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
