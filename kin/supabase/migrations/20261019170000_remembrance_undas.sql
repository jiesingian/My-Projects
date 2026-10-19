-- Undas and babang-luksa: remembering relatives on the tree who have passed
-- =========================================================================
--
-- family_tree_people.died_on: the date of passing, for a relative on the
-- tree. Optional, like dob, and never in the future or before their birth.
-- Edited the way dob is (any member of the household, the existing
-- family_tree_people policies); nothing new to read or write across
-- households.
--
-- families.remember_the_departed: the household's switch for all of it (on
-- unless turned off, as share_with_relatives is). Off: no reminders, nothing
-- on Today or Coming up, no candle on the tree.
--
-- due_remembrance_reminders(): a push to each grown-up with a device, from
-- 09:00 in the household's own zone, on the same five-minute tick, ledger
-- (reminder_sends) and "Events and schedules" switch as the other event
-- pushes (pattern: 20261014090000_event_rsvps):
--   * 29 October, three days before Undas, when the tree has anyone with a
--     date of passing: time to plan the visit;
--   * the morning of a death anniversary, the 40th day (the day of passing
--     counted as the first, as the pasiyam is) and the first year
--     (babang-luksa). A 29 February anniversary falls on 28 February in
--     other years.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.family_tree_people add column if not exists died_on date;

alter table public.family_tree_people drop constraint if exists family_tree_people_died_after_birth;
alter table public.family_tree_people add constraint family_tree_people_died_after_birth
  check (died_on is null or dob is null or died_on >= dob);

alter table public.families add column if not exists remember_the_departed boolean not null default true;

create or replace function public.due_remembrance_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  expected text := public.kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  return query
  with zones as (
    select hc.family_id, hc.local_now, hc.today
    from public.household_clock(p_now) hc
    join public.families f on f.id = hc.family_id
    where f.remember_the_departed
      and hc.local_now::time >= time '09:00'
  ),
  departed as (
    select p.id, p.family_id, coalesce(m.full_name, p.full_name, 'Someone dear') as name, p.died_on, z.today
    from public.family_tree_people p
    join zones z on z.family_id = p.family_id
    left join public.members m on m.id = p.member_id
    where p.died_on is not null and p.died_on <= z.today
  ),
  undas as (
    -- Three days before 1 November: one push per household and year,
    -- naming up to three of the people it remembers.
    select d.family_id,
           'undas:' || d.family_id || ':' || extract(year from d.today)::int as base_key,
           'Undas is on ' || to_char(make_date(extract(year from d.today)::int, 11, 1), 'FMDay') as title,
           'Remembering ' || string_agg(d.name, ', ' order by d.died_on) filter (where d.rn <= 3)
             || case when count(*) > 3 then ' and ' || (count(*) - 3) || ' more' else '' end
             || '. Time to plan the visit: candles and flowers.' as body
    from (select d.*, row_number() over (partition by d.family_id order by d.died_on) as rn from departed d) d
    where to_char(d.today, 'MM-DD') = '10-29'
    group by d.family_id, d.today
  ),
  days as (
    -- Each person's day today, if it is one: the 40th day, the first year,
    -- or a later anniversary.
    select d.family_id,
           'remembrance:' || d.id || ':' || d.today as base_key,
           'Remembering ' || d.name as title,
           case
             when d.today = d.died_on + 39 then 'Today is the 40th day since their passing.'
             when extract(year from d.today) - extract(year from d.died_on) = 1 then 'One year today since their passing: the babang-luksa.'
             else (extract(year from d.today) - extract(year from d.died_on))::int || ' years today since their passing.'
           end as body
    from departed d
    where d.today = d.died_on + 39
      or (
        d.today > d.died_on
        and (
          to_char(d.today, 'MM-DD') = to_char(d.died_on, 'MM-DD')
          or (
            to_char(d.died_on, 'MM-DD') = '02-29'
            and to_char(d.today, 'MM-DD') = '02-28'
            and extract(day from (make_date(extract(year from d.today)::int, 3, 1) - 1)) = 28
          )
        )
      )
  ),
  occasions as (
    select u.family_id, u.base_key, u.title, u.body from undas u
    union all
    select y.family_id, y.base_key, y.title, y.body from days y
  ),
  candidates as (
    select o.base_key || ':' || m.id as key, o.family_id, m.id as member_id, o.title, o.body, '/today' as url
    from occasions o
    join public.members m on m.family_id = o.family_id and m.status = 'active' and m.role in ('parent', 'adult')
    where exists (select 1 from public.push_subscriptions s where s.member_id = m.id)
  ),
  fresh as (
    insert into public.reminder_sends (key)
    select c.key from candidates c
    on conflict do nothing
    returning public.reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh f on f.key = c.key
  join public.push_subscriptions s on s.family_id = c.family_id and s.member_id = c.member_id
  join public.members m on m.id = s.member_id
  where coalesce((m.notification_prefs ->> 'events')::boolean, true);
end;
$$;

-- Like every due_*() function: the cron route calls it with the anon key and
-- the secret is the guard, so anon keeps execute; without the secret it
-- returns nothing.
revoke all on function public.due_remembrance_reminders(text, timestamptz) from public;
grant execute on function public.due_remembrance_reminders(text, timestamptz) to anon, authenticated;
