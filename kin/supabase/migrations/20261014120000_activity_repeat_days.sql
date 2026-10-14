-- Which days a weekly task repeats on, and when a repeating one stops
-- (Janine, 14 October): "if a user chooses Weekly, there should be options
-- for which days of the week it repeats, and a Start date and an End date
-- (optional)."
--
-- `activities` is the Planner's one-off "task" (add-planner-form.tsx). Its
-- start is start_at, as before; these two columns are the rest of the rule:
--   repeat_days  -- 0 = Sunday ... 6 = Saturday, for repeat = 'weekly' only.
--                   NULL is every row saved before today, and means what it
--                   always meant: weekly on start_at's own weekday.
--   repeat_until -- the household day of the last occurrence, inclusive.
--                   NULL is "never", again what every existing row means.
-- The rule is expanded in one place, lib/activity-repeat.ts, and tested in
-- e2e/activity-repeat.logic.spec.ts. Routines already had both (byweekday,
-- end_date) and are untouched.
--
-- No RLS change: the columns sit on a row the existing policies already
-- cover.

alter table public.activities add column if not exists repeat_days smallint[];
alter table public.activities add column if not exists repeat_until date;

-- Days only on a weekly rule, at least one, each a real weekday.
alter table public.activities drop constraint if exists activities_repeat_days_shape;
alter table public.activities add constraint activities_repeat_days_shape check (
  repeat_days is null
  or (repeat = 'weekly'
      and cardinality(repeat_days) between 1 and 7
      and repeat_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
);

-- An end only on something that repeats, and not before it starts. start_at
-- is an instant and the household's zone is not on the row, so the floor is
-- its UTC date less a day: every zone's local date is within one day of UTC's,
-- so this never refuses a real end date (the action checks the exact one in
-- the household's zone and says so in words).
alter table public.activities drop constraint if exists activities_repeat_until_after_start;
alter table public.activities add constraint activities_repeat_until_after_start check (
  repeat_until is null
  or (repeat <> 'once' and repeat_until >= (start_at at time zone 'UTC')::date - 1)
);

-- The spoken brief: the latest today_brief (20260928130000_today_brief_chores_low)
-- whole, with the two new columns on each activity and the household's zone,
-- so lib/brief picks today's occurrences on the right days and clock.
create or replace function public.today_brief(p_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select m.id, m.family_id, m.full_name, m.role
    from members m
    where p_hash ~ '^[A-Za-z0-9_-]{43}$'
      and m.brief_hash = p_hash
      and m.status in ('active', 'managed')
    limit 1
  ),
  items as (
    select a.title, a.start_at as starts_at, a.end_at as ends_at, null::date as all_day, null::date as all_day_end,
           false as yearly, a.repeat, a.location, a.repeat_days, a.repeat_until
    from activities a
    join me on a.family_id = me.family_id
    where (a.applies_to_whole_family
           or exists (select 1 from activity_members am where am.activity_id = a.id and am.member_id = me.id))
      and (a.repeat <> 'once' or a.start_at > now() - interval '2 days')
      and (a.repeat_until is null or a.repeat_until >= current_date - 2)
    union all
    select e.title, null, null, e.event_date, e.end_date, e.recurs_yearly, null, null, null, null
    from events e
    join me on e.family_id = me.family_id
    where (e.applies_to_whole_family
           or exists (select 1 from event_members em where em.event_id = e.id and em.member_id = me.id))
      and (e.recurs_yearly or coalesce(e.end_date, e.event_date) >= current_date - 2)
  )
  select jsonb_build_object(
    'name', me.full_name,
    'tz', (select public.safe_time_zone(f.time_zone) from families f where f.id = me.family_id),
    'items', coalesce((select jsonb_agg(to_jsonb(items)) from items), '[]'::jsonb),
    -- Chores and other routines: the rule, who it is assigned to in rota
    -- order, and whether this member has already marked today's done or
    -- skipped. The app works out which fall today and whose turn it is.
    'routines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', r.title, 'kind', r.kind, 'freq', r.freq, 'repeat_interval', r.repeat_interval,
        'byweekday', r.byweekday, 'bymonthday', r.bymonthday, 'start_date', r.start_date, 'end_date', r.end_date,
        'time_of_day', r.time_of_day, 'location', r.location, 'whole_family', r.applies_to_whole_family,
        'rotate', r.rotate_assignee,
        'members', coalesce((select jsonb_agg(rm.member_id order by rm.position) from routine_members rm where rm.routine_id = r.id), '[]'::jsonb),
        'logged', coalesce((select jsonb_agg(distinct rl.occurrence_date) from routine_log rl
                            where rl.routine_id = r.id and rl.status in ('done', 'skipped')
                              and rl.occurrence_date >= current_date - 1 and rl.occurrence_date <= current_date + 1), '[]'::jsonb)
      ))
      from routines r
      where r.family_id = me.family_id and not r.paused
        and (r.end_date is null or r.end_date >= current_date - 1)
    ), '[]'::jsonb),
    'me', me.id,
    -- What the pantry says is running low and is not yet on the open
    -- shopping list: grown-ups only, the same people the 9 AM push goes to.
    'low', case when me.role in ('parent', 'adult') then coalesce((
      select jsonb_agg(p.name order by p.name)
      from pantry_items p
      where p.family_id = me.family_id and p.running_low
        and not exists (
          select 1 from buy_items b
          where b.family_id = p.family_id and not b.checked and not b.cleared
            and lower(btrim(b.name)) = lower(btrim(p.name)))
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from me
$$;

-- The calendar link (Apple Calendar, Outlook): 20260924120000_calendar_feed
-- with three more columns, so the feed's RRULE can carry BYDAY and UNTIL.
-- A function's result columns cannot change in place, hence drop and create;
-- the grants are restated below exactly as they were.
drop function if exists public.calendar_feed(text);
create function public.calendar_feed(feed_hash text)
returns table (
  uid text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day date,
  all_day_end date,
  yearly boolean,
  repeat text,
  location text,
  notes text,
  repeat_days smallint[],
  repeat_until date,
  time_zone text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select m.id, m.family_id, public.safe_time_zone(f.time_zone) as tz
    from members m
    join families f on f.id = m.family_id
    where feed_hash ~ '^[A-Za-z0-9_-]{43}$'
      and m.calendar_feed_hash = feed_hash
      and m.status in ('active', 'managed')
    limit 1
  )
  select 'a-' || a.id, a.title, a.start_at, a.end_at, null::date, null::date, false, a.repeat, a.location, a.notes,
         a.repeat_days, a.repeat_until, me.tz
  from activities a
  join me on a.family_id = me.family_id
  where (a.applies_to_whole_family
         or exists (select 1 from activity_members am where am.activity_id = a.id and am.member_id = me.id))
    and (a.repeat <> 'once' or a.start_at > now() - interval '60 days')
  union all
  select 'e-' || e.id, e.title, null, null, e.event_date, e.end_date, e.recurs_yearly, null, null, e.sub_note,
         null, null, me.tz
  from events e
  join me on e.family_id = me.family_id
  where (e.applies_to_whole_family
         or exists (select 1 from event_members em where em.event_id = e.id and em.member_id = me.id))
    and (e.recurs_yearly or coalesce(e.end_date, e.event_date) > current_date - 60)
$$;

revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
