-- "Send me a test" for each kind of push (Jonathan, 20 October).
--
-- Settings -> Notifications gains a row per kind of push the household can
-- receive -- a dose, a missed dose, a refill, Undas and a remembrance day,
-- the money recap, the week ahead, a plan reminder, a tree story, the
-- helper's "Added to the list", "Nakarating na ako", an SOS and "Are you
-- okay?" -- each sending one push to the current person's own devices,
-- built with the real sender's words, deep link and icon and prefixed
-- "Test: ". So "nothing arrived" has an answer per kind, and the first
-- Undas push (29 October) can be seen on a phone beforehand.
--
-- THE WORDS, ONCE
--
-- Most of these kinds are worded in the database, inside the due_*()
-- functions the five-minute tick calls. A test that re-typed those words in
-- the app would drift from them the first time either changed. So each
-- kind's words move into a small function of their own (push_words_*), the
-- due_*() functions are re-created to call them -- otherwise unchanged, line
-- for line, from their latest versions (20261020090300, 20261014200000,
-- 20261020160000, 20261019233000, 20261020090400, 20261019090001) -- and
-- sample_push() builds a test from the same functions with sample data and
-- the caller's own first name. The probes that pin each kind's wording
-- (reminders-*.mjs, missed-dose-alerts.mjs, medicine-supply.mjs,
-- remembrance.mjs, money-recap-push.mjs) are the proof that nothing moved.
--
-- The kinds the app words itself (a tree story, the helper line, Nakarating,
-- an SOS, "Are you okay?") are tested from the same TypeScript builders the
-- real senders use (lib/push-words.ts, lib/member-card.ts).
--
-- WHO, AND HOW OFTEN
--
-- A grown-up (parent or adult), for themself only: the app delivers to the
-- caller's own push_subscriptions rows, which row-level security already
-- limits to their own. A child, kid view included, is refused by
-- push_test_allowed(), which also holds the rate: five tests a minute per
-- person, counted in push_tests (its own table, written by that function
-- alone). A user action, not the cron path: nothing here reads the cron
-- secret or writes reminder_sends.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- 1. The words -------------------------------------------------------------------

create or replace function public.push_words_dose(p_first text, p_name text, p_dose text, p_time text, p_member uuid)
returns table (title text, body text, url text)
language sql
immutable
set search_path = ''
as $$
  select 'Time for ' || p_first || '''s ' || p_name,
         coalesce(p_dose || ' · ', '') || p_time || '. Tap to tick it.',
         '/family/members/' || p_member || '?view=health&seg=medicines';
$$;

create or replace function public.push_words_plan_soon(p_title text, p_location text)
returns table (title text, body text, url text)
language sql
immutable
set search_path = ''
as $$
  select 'In 30 minutes: ' || p_title,
         coalesce('At ' || nullif(p_location, '') || '. Time to get going.', 'Time to get going.'),
         '/planner';
$$;

create or replace function public.push_words_missed_dose(p_first text, p_sex text, p_name text, p_time time, p_delay integer, p_member uuid)
returns table (title text, body text, url text)
language sql
immutable
set search_path = ''
as $$
  select case p_sex
           when 'female' then p_first || ' hasn''t taken her ' || to_char(p_time, 'FMHH12:MI AM') || ' ' || p_name
           when 'male' then p_first || ' hasn''t taken his ' || to_char(p_time, 'FMHH12:MI AM') || ' ' || p_name
           else p_first || '''s ' || to_char(p_time, 'FMHH12:MI AM') || ' ' || p_name || ' isn''t ticked'
         end,
         case p_delay
           when 30 then 'Not ticked half an hour after it was due. '
           when 120 then 'Not ticked two hours after it was due. '
           else 'Not ticked an hour after it was due. '
         end || 'Tap to check.',
         '/family/members/' || p_member || '?view=health&seg=medicines';
$$;

-- p_outcome: 'added' (to the list), 'already' (on it), or 'hidden' (a
-- medicine not shown to everyone, never named on the shared list).
create or replace function public.push_words_refill(p_first text, p_name text, p_days_left numeric, p_outcome text, p_member uuid)
returns table (title text, body text, url text)
language sql
immutable
set search_path = ''
as $$
  select p_first || '''s ' || p_name || case
           when p_days_left <= 0 then ' has run out'
           when p_days_left < 1 then ' runs out today'
           when floor(greatest(p_days_left, 0)) = 1 then ' runs out in about 1 day'
           else ' runs out in about ' || floor(greatest(p_days_left, 0)) || ' days'
         end,
         case p_outcome
           when 'added' then 'Added to the list.'
           when 'already' then 'It''s already on the list.'
           else 'Not added to the list, as this medicine isn''t shown to everyone.'
         end,
         '/family/members/' || p_member || '?view=health&seg=medicines';
$$;

-- Three days before Undas: up to three names, and how many more.
create or replace function public.push_words_undas(p_today date, p_names text[], p_total bigint)
returns table (title text, body text, url text)
language sql
immutable
set search_path = ''
as $$
  select 'Undas is on ' || to_char(make_date(extract(year from p_today)::int, 11, 1), 'FMDay'),
         'Remembering ' || array_to_string(p_names, ', ')
           || case when p_total > 3 then ' and ' || (p_total - 3) || ' more' else '' end
           || '. Time to plan the visit: candles and flowers.',
         '/today';
$$;

create or replace function public.push_words_remembrance_day(p_name text, p_died_on date, p_today date)
returns table (title text, body text, url text)
language sql
immutable
set search_path = ''
as $$
  select 'Remembering ' || p_name,
         case
           when p_today = p_died_on + 39 then 'Today is the 40th day since their passing.'
           when extract(year from p_today) - extract(year from p_died_on) = 1 then 'One year today since their passing: the babang-luksa.'
           else (extract(year from p_today) - extract(year from p_died_on))::int || ' years today since their passing.'
         end,
         '/today';
$$;

create or replace function public.push_words_money_recap(p_month_start date)
returns table (title text, body text, url text)
language sql
immutable
set search_path = ''
as $$
  select 'Your ' || trim(to_char(p_month_start, 'FMMonth')) || ' money recap',
         'Spending against budget, bills, savings and net worth, in one page.',
         '/wealth/recap?month=' || to_char(p_month_start, 'YYYY-MM');
$$;

create or replace function public.push_words_week_ahead(p_lines text)
returns table (title text, body text, url text)
language sql
immutable
set search_path = ''
as $$
  select 'The week ahead', left(p_lines, 180), '/today/week';
$$;

revoke all on function public.push_words_dose(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.push_words_plan_soon(text, text) from public, anon, authenticated;
revoke all on function public.push_words_missed_dose(text, text, text, time, integer, uuid) from public, anon, authenticated;
revoke all on function public.push_words_refill(text, text, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.push_words_undas(date, text[], bigint) from public, anon, authenticated;
revoke all on function public.push_words_remembrance_day(text, date, date) from public, anon, authenticated;
revoke all on function public.push_words_money_recap(date) from public, anon, authenticated;
revoke all on function public.push_words_week_ahead(text) from public, anon, authenticated;

-- 2. The senders, re-created to use them -------------------------------------------

-- As 20261020090300 wrote it; the dose and plan words come from above.
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

  -- A refill's key names its supply count, not a day; purging it would send
  -- "has run out" again every 40 days until someone recounts.
  delete from reminder_sends where sent_at < p_now - interval '40 days' and key not like 'refill:%';

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
           w.title, w.body, w.url
    from health_medicines med
    join zones z on z.family_id = med.family_id
    join members pm on pm.id = med.member_id
    cross join lateral unnest(med.times) as t(time)
    cross join lateral (values (z.today), (z.today - 1)) as d(day)
    cross join lateral push_words_dose(split_part(pm.full_name, ' ', 1), med.name, med.dose, t.time, med.member_id) w
    where med.start_date <= d.day and (med.end_date is null or med.end_date >= d.day)
      -- Instants, not wall clocks: on a spring-forward day a dose at 02:30
      -- never appears on the wall clock, so it was never sent.
      and ((d.day + t.time::time) at time zone z.tz) <= p_now
      and ((d.day + t.time::time) at time zone z.tz) > p_now - interval '15 minutes'
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
      and a.status not in ('done', 'completed', 'cancelled', 'skipped')
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
           w.title, w.body, w.url
    from soon_plans p
    cross join lateral push_words_plan_soon(p.title, p.location) w
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

-- As 20261014200000 wrote it; the words come from above.
create or replace function public.due_missed_dose_alerts(p_secret text, p_now timestamptz default now())
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
    select hc.family_id, hc.tz, hc.today from public.household_clock(p_now) hc
  ),
  candidates as (
    select 'missed:' || med.id || ':' || d.day || ':' || t.time as key,
           med.family_id,
           al.notify_member_id as receiver,
           w.title, w.body, w.url
    from public.health_medicine_alerts al
    join public.health_medicines med on med.id = al.medicine_id
    join zones z on z.family_id = med.family_id
    join public.members pm on pm.id = med.member_id
    cross join lateral unnest(med.times) as t(time)
    cross join lateral (values (z.today), (z.today - 1)) as d(day)
    cross join lateral (select (d.day + t.time::time) at time zone z.tz as dose_at) x
    cross join lateral public.push_words_missed_dose(split_part(pm.full_name, ' ', 1), pm.sex, med.name, t.time::time, al.delay_minutes, med.member_id) w
    where pm.status = 'active'
      and med.start_date <= d.day and (med.end_date is null or med.end_date >= d.day)
      and x.dose_at >= al.active_since
      and x.dose_at + make_interval(mins => al.delay_minutes) <= p_now
      and x.dose_at + make_interval(mins => al.delay_minutes) > p_now - interval '3 hours'
      and not exists (
        select 1 from public.health_medicine_doses hd
        where hd.medicine_id = med.id and hd.dose_date = d.day and hd.dose_time = t.time
      )
      -- Still someone who may be told: checked again here, not only when it
      -- was set, because a role, a login or the medicine's visibility can
      -- change afterwards.
      and exists (
        select 1 from public.members r
        where r.id = al.notify_member_id
          and r.family_id = med.family_id
          and r.status = 'active'
          and r.role in ('parent', 'adult')
          and r.auth_user_id is not null
          and r.id <> med.member_id
          and (med.visibility = 'family' or r.id = med.created_by or (med.visibility = 'parents' and r.role = 'parent'))
      )
  ),
  fresh as (
    insert into public.reminder_sends as rs (key)
    select c.key from candidates c
    on conflict do nothing
    returning rs.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh f on f.key = c.key
  join public.push_subscriptions s on s.family_id = c.family_id and s.member_id = c.receiver
  join public.members m on m.id = s.member_id
  where coalesce((m.notification_prefs ->> 'health')::boolean, true);
end;
$$;

revoke all on function public.due_missed_dose_alerts(text, timestamptz) from public;
grant execute on function public.due_missed_dose_alerts(text, timestamptz) to anon, authenticated;

-- As 20261020160000 wrote it; the words come from above.
create or replace function public.due_refill_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  expected text := public.kin_vault_secret('kin_cron_secret');
  r record;
  v_key text;
  v_item uuid;
  v_outcome text;
  v_title text;
  v_body text;
  v_url text;
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  for r in
    select med.id as medicine_id, med.family_id, med.member_id, med.name, med.visibility, med.created_by,
           split_part(pm.full_name, ' ', 1) as first_name,
           s.counted_at, s.list_item_id,
           public.medicine_on_hand(med.id) / (s.per_dose * cardinality(med.times)) as days_left
    from public.health_medicine_supply s
    join public.health_medicines med on med.id = s.medicine_id
    join public.members pm on pm.id = med.member_id
    join public.household_clock(p_now) z on z.family_id = med.family_id
    where z.local_now::time >= time '09:00' and z.local_now::time < time '21:00'
      and pm.status = 'active'
      and cardinality(med.times) > 0
      and (med.end_date is null or med.end_date >= z.today)
      and public.medicine_on_hand(med.id) <= 7 * s.per_dose * cardinality(med.times)
  loop
    insert into public.reminder_sends as rs (key)
    values ('refill:' || r.medicine_id || ':' || to_char(r.counted_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS'))
    on conflict do nothing
    returning rs.key into v_key;
    continue when v_key is null;

    -- Not shown to everyone: never named on the shared list.
    -- On the list already? This cycle's own item still open, or any open
    -- item named for the medicine.
    if r.visibility <> 'family' then
      v_item := null;
      v_outcome := 'hidden';
    elsif not exists (
      select 1 from public.buy_items b
      where b.family_id = r.family_id and not b.checked and not b.cleared
        and (b.id = r.list_item_id or b.medicine_id = r.medicine_id or left(lower(btrim(b.name)), length(btrim(r.name))) = lower(btrim(r.name)))
    ) then
      insert into public.buy_items (family_id, name, section, source, medicine_id)
      values (r.family_id, left(r.name || ' · for ' || r.first_name || ', refill', 150), 'Personal Care', 'house', r.medicine_id)
      returning id into v_item;
      update public.health_medicine_supply set list_item_id = v_item where medicine_id = r.medicine_id;
      v_outcome := 'added';
    else
      v_item := null;
      v_outcome := 'already';
    end if;

    select w.title, w.body, w.url into v_title, v_body, v_url
    from public.push_words_refill(r.first_name, r.name, r.days_left, v_outcome, r.member_id) w;

    return query
    select v_key, sub.member_id, sub.endpoint, sub.p256dh, sub.auth,
           v_title,
           v_body,
           v_url
    from public.members m
    join public.push_subscriptions sub on sub.member_id = m.id and sub.family_id = r.family_id
    where m.family_id = r.family_id
      and m.status = 'active'
      and m.role in ('parent', 'adult')
      and (r.visibility = 'family' or m.id = r.member_id or m.id = r.created_by or (r.visibility = 'parents' and m.role = 'parent'))
      and coalesce((m.notification_prefs ->> 'health')::boolean, true);
  end loop;
end;
$$;

revoke all on function public.due_refill_reminders(text, timestamptz) from public;
grant execute on function public.due_refill_reminders(text, timestamptz) to anon, authenticated;

-- As 20261019233000 wrote it; the words come from above.
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
  undas_households as (
    -- Three days before 1 November: one push per household and year,
    -- naming up to three of the people it remembers.
    select d.family_id, d.today,
           array_agg(d.name order by d.died_on) filter (where d.rn <= 3) as names,
           count(*) as total
    from (select d.*, row_number() over (partition by d.family_id order by d.died_on) as rn from departed d) d
    where to_char(d.today, 'MM-DD') = '10-29'
    group by d.family_id, d.today
  ),
  undas as (
    select u.family_id,
           'undas:' || u.family_id || ':' || extract(year from u.today)::int as base_key,
           w.title, w.body, w.url
    from undas_households u
    cross join lateral public.push_words_undas(u.today, u.names, u.total) w
  ),
  days as (
    -- Each person's day today, if it is one: the 40th day, the first year,
    -- or a later anniversary.
    select d.family_id,
           'remembrance:' || d.id || ':' || d.today as base_key,
           w.title, w.body, w.url
    from departed d
    cross join lateral public.push_words_remembrance_day(d.name, d.died_on, d.today) w
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
    select u.family_id, u.base_key, u.title, u.body, u.url from undas u
    union all
    select y.family_id, y.base_key, y.title, y.body, y.url from days y
  ),
  candidates as (
    select o.base_key || ':' || m.id as key, o.family_id, m.id as member_id, o.title, o.body, o.url
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

revoke all on function public.due_remembrance_reminders(text, timestamptz) from public;
grant execute on function public.due_remembrance_reminders(text, timestamptz) to anon, authenticated;

-- As 20261020090400 wrote it; the words come from above.
create or replace function public.due_money_recap_reminders(p_secret text, p_now timestamptz default now())
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
    select hc.family_id, hc.tz,
           (date_trunc('month', hc.today) - interval '1 month')::date as month_start,
           date_trunc('month', hc.today)::date as month_end
    from household_clock(p_now) hc
    where extract(day from hc.today) = 1
      and hc.local_now::time >= time '08:00' and hc.local_now::time < time '22:00'
  ),
  households as (
    select z.family_id, z.month_start
    from zones z
    where family_has_plus(z.family_id)
      and exists (
        select 1 from wealth_transactions t
        where t.family_id = z.family_id
          and t.status = 'confirmed'
          and (t.occurred_at at time zone z.tz)::date >= z.month_start
          and (t.occurred_at at time zone z.tz)::date < z.month_end
      )
  ),
  candidates as (
    select 'recap:' || m.id || ':' || to_char(h.month_start, 'YYYY-MM') as key,
           h.family_id,
           m.id as recipient,
           w.title, w.body, w.url
    from households h
    join members m on m.family_id = h.family_id
    cross join lateral push_words_money_recap(h.month_start) w
    where m.status = 'active' and m.role in ('parent', 'adult')
      and coalesce((m.notification_prefs ->> 'money_recap')::boolean, true)
      -- Only someone with a device spends the month's key; a grown-up who
      -- turns push on later on the 1st still hears it, as Undas does.
      and exists (select 1 from push_subscriptions s where s.member_id = m.id and s.family_id = m.family_id)
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
  join push_subscriptions s on s.family_id = c.family_id and s.member_id = c.recipient;
end;
$$;

revoke all on function public.due_money_recap_reminders(text, timestamptz) from public;
grant execute on function public.due_money_recap_reminders(text, timestamptz) to anon, authenticated;

-- As 20261019090001 wrote it; the words come from above.
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
           x.title, x.body, x.url
    from weeks w
    join zones z on z.family_id = w.family_id
    cross join lateral push_words_week_ahead(w.lines) x
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

-- 3. The test: who may, how often, and the sample -----------------------------------

create table if not exists public.push_tests (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now()
);

create index if not exists push_tests_member_idx on public.push_tests (member_id, sent_at desc);

alter table public.push_tests enable row level security;
revoke all on table public.push_tests from anon, authenticated;

-- The caller as an active grown-up of their household, or null.
create or replace function public.push_test_caller()
returns public.members
language sql
stable
security definer
set search_path = ''
as $$
  select m.*
  from public.members m
  where auth.uid() is not null
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('parent', 'adult')
    and m.family_id = public.current_family_id()
  limit 1;
$$;

revoke all on function public.push_test_caller() from public, anon, authenticated;

-- Records one test and says whether it may go: a grown-up, five a minute.
create or replace function public.push_test_allowed(p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me public.members := public.push_test_caller();
begin
  if v_me.id is null then
    raise exception 'Only a grown-up can send a test' using errcode = '42501';
  end if;
  if (select count(*) from public.push_tests t where t.member_id = v_me.id and t.sent_at > now() - interval '1 minute') >= 5 then
    raise exception 'A few a minute: wait a moment before the next test' using errcode = '54000';
  end if;
  delete from public.push_tests t where t.member_id = v_me.id and t.sent_at < now() - interval '1 day';
  insert into public.push_tests (member_id, kind) values (v_me.id, left(coalesce(p_kind, ''), 40));
  return true;
end;
$$;

revoke all on function public.push_test_allowed(text) from public, anon;
grant execute on function public.push_test_allowed(text) to authenticated;

-- The sample for a kind worded here: the real words with sample data and the
-- caller's own first name, sex and household day. The app adds "Test: ".
create or replace function public.sample_push(p_kind text)
returns table (title text, body text, url text, tag text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me public.members := public.push_test_caller();
  v_first text;
  v_today date;
begin
  if v_me.id is null then
    raise exception 'Only a grown-up can send a test' using errcode = '42501';
  end if;
  v_first := split_part(v_me.full_name, ' ', 1);
  select hc.today into v_today from public.household_clock(now()) hc where hc.family_id = v_me.family_id;
  v_today := coalesce(v_today, current_date);

  return query
  select w.title, w.body, w.url, 'test:' || p_kind
  from (
    select * from public.push_words_dose(v_first, 'Losartan', '50 mg', '08:00', v_me.id) where p_kind = 'dose'
    union all
    select * from public.push_words_missed_dose(v_first, v_me.sex, 'Losartan', time '08:00', 60, v_me.id) where p_kind = 'missed_dose'
    union all
    select * from public.push_words_refill(v_first, 'Losartan', 5, 'added', v_me.id) where p_kind = 'refill'
    union all
    select * from public.push_words_undas(v_today, array['Lolo Pedro', 'Lola Remedios'], 2) where p_kind = 'undas'
    union all
    select * from public.push_words_remembrance_day('Lola Remedios', v_today - 39, v_today) where p_kind = 'remembrance'
    union all
    select * from public.push_words_money_recap((date_trunc('month', v_today) - interval '1 month')::date) where p_kind = 'money_recap'
    union all
    select * from public.push_words_week_ahead('School pick-up Mon, Meralco due Wed, Lola''s birthday Sat') where p_kind = 'week_ahead'
    union all
    select * from public.push_words_plan_soon('School pick-up', 'Ateneo Grade School') where p_kind = 'plan'
  ) w;
end;
$$;

revoke all on function public.sample_push(text) from public, anon;
grant execute on function public.sample_push(text) to authenticated;
