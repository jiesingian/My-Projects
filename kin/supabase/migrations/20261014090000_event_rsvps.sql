-- Who's coming (Janine, 14 October): on an event, each person it is for
-- answers Going, Maybe or Can't go, and the event shows the answers and who
-- has not answered yet.
--
-- Who is asked: the people the event is for -- its event_members, or the
-- whole household when it is a "Whole family" event (or names nobody, which
-- the Planner reads the same way). A grown-up (parent or adult) may answer
-- for a managed child, who has no login; everyone else answers only for
-- themselves, a child_self included.
--
-- Only one-off events and trips. A birthday or anniversary repeats every
-- year, and one row per person could not say which year it answers for.
--
-- Answers can be given and changed until the event's last day has gone (in
-- the household's own time zone, household_clock's rule); after that they
-- are read-only.
--
-- Who sees an answer: exactly whoever sees its event. Every policy asks the
-- events table under its own policies (event_rsvp_allowed is security
-- invoker), as asset_items asks assets (20261012190000), so an answer can
-- never be seen where its event is not.
--
-- due_rsvp_reminders(): two days before the event, from 09:00, a push to each
-- person asked who has not answered, on the same five-minute tick, ledger
-- (reminder_sends) and "Events and schedules" switch as the other event
-- pushes (pattern: 20261007170000_bill_reminder_days).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  answer text not null,
  answered_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id),
  constraint event_rsvps_answer_check check (answer in ('going', 'maybe', 'no'))
);

create index if not exists event_rsvps_family_idx on public.event_rsvps (family_id);
create index if not exists event_rsvps_member_idx on public.event_rsvps (member_id);
create index if not exists event_rsvps_answered_by_idx on public.event_rsvps (answered_by);

-- Today in the caller's own household's time zone. Definer only to reach
-- safe_time_zone(), which is internal to the reminder functions.
create or replace function public.household_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone public.safe_time_zone(f.time_zone))::date
  from public.families f
  where f.id = public.current_family_id()
$$;

revoke all on function public.household_today() from public, anon;
grant execute on function public.household_today() to authenticated;

-- May the caller answer for p_member on p_event, now? Security invoker on
-- purpose: events, event_members and members answer under their own
-- policies, so this can never reach an event the caller cannot see.
create or replace function public.event_rsvp_allowed(p_event uuid, p_member uuid, p_family uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_family = public.current_family_id()
    and exists (
      select 1 from public.events e
      where e.id = p_event
        and e.family_id = p_family
        and not coalesce(e.recurs_yearly, false)
        -- Open until the last day has gone. An end before the start (bad
        -- data) falls back to the start, as lib/planner-done does.
        and greatest(e.event_date, coalesce(e.end_date, e.event_date)) >= public.household_today()
        and (
          e.applies_to_whole_family
          or not exists (select 1 from public.event_members em where em.event_id = e.id)
          or exists (select 1 from public.event_members em where em.event_id = e.id and em.member_id = p_member)
        )
    )
    and exists (
      select 1 from public.members m
      where m.id = p_member
        and m.family_id = p_family
        and m.status = 'active'
        and (
          m.id = public.current_member_id()
          or (m.role = 'child_managed' and public.current_member_role() in ('parent', 'adult'))
        )
    )
$$;

revoke all on function public.event_rsvp_allowed(uuid, uuid, uuid) from public, anon;
grant execute on function public.event_rsvp_allowed(uuid, uuid, uuid) to authenticated;

alter table public.event_rsvps enable row level security;

drop policy if exists event_rsvps_select on public.event_rsvps;
create policy event_rsvps_select on public.event_rsvps
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.events e where e.id = event_id and e.family_id = event_rsvps.family_id)
  );

drop policy if exists event_rsvps_insert on public.event_rsvps;
create policy event_rsvps_insert on public.event_rsvps
  for insert to authenticated
  with check (
    answered_by = (select public.current_member_id())
    and public.event_rsvp_allowed(event_id, member_id, family_id)
  );

drop policy if exists event_rsvps_update on public.event_rsvps;
create policy event_rsvps_update on public.event_rsvps
  for update to authenticated
  using (public.event_rsvp_allowed(event_id, member_id, family_id))
  with check (
    answered_by = (select public.current_member_id())
    and public.event_rsvp_allowed(event_id, member_id, family_id)
  );

drop policy if exists event_rsvps_delete on public.event_rsvps;
create policy event_rsvps_delete on public.event_rsvps
  for delete to authenticated
  using (public.event_rsvp_allowed(event_id, member_id, family_id));

grant select, insert, update, delete on public.event_rsvps to authenticated;

-- The reminder ---------------------------------------------------------------

create or replace function public.due_rsvp_reminders(p_secret text, p_now timestamptz default now())
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
    select hc.family_id, hc.local_now, hc.today from public.household_clock(p_now) hc
  ),
  asked as (
    -- Each person a one-off event two days away is for, who has not answered.
    select e.id as event_id, e.family_id, e.title as event_title, e.event_date, m.id as member_id
    from public.events e
    join zones z on z.family_id = e.family_id
    join public.members m on m.family_id = e.family_id and m.status = 'active'
    where not coalesce(e.recurs_yearly, false)
      and e.event_date = z.today + 2
      and z.local_now::time >= time '09:00'
      and (
        e.applies_to_whole_family
        or not exists (select 1 from public.event_members em where em.event_id = e.id)
        or exists (select 1 from public.event_members em where em.event_id = e.id and em.member_id = m.id)
      )
      and not exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.member_id = m.id)
  ),
  candidates as (
    select 'rsvp:' || a.event_id || ':' || a.member_id as key,
           a.family_id,
           a.member_id,
           ('Are you coming to ' || a.event_title || '?') as title,
           to_char(a.event_date, 'FMDay FMDD Mon') || '. Tap to answer Going, Maybe or Can''t go.' as body,
           '/planner/add?type=event&id=' || a.event_id as url
    from asked a
    -- Only people with a device to reach; nothing is written to the ledger
    -- for anyone else, so a phone added later still gets it.
    where exists (select 1 from public.push_subscriptions s where s.member_id = a.member_id)
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
revoke all on function public.due_rsvp_reminders(text, timestamptz) from public;
grant execute on function public.due_rsvp_reminders(text, timestamptz) to anon, authenticated;
