-- Tell someone when a dose is missed (approved 14 October; Medisafe calls it
-- a Medfriend).
--
-- On a medicine with set times, a grown-up can name one grown-up of the
-- household -- someone with a login, so there is a phone to reach -- and how
-- long after the dose time to wait: 30 minutes, an hour (the default) or two
-- hours. If the dose has not been ticked Taken by then, that person gets one
-- push: "Lola hasn't taken her 8:00 AM Losartan". Off unless someone turns it
-- on. Kin has no "skipped" tick, so Taken is the only thing that stops it.
--
-- WHAT IS KEPT
--
-- One row per medicine in health_medicine_alerts: who is told, the delay,
-- and active_since -- the moment it was turned on. A dose whose time is
-- before active_since is never reported, so turning it on at noon does not
-- send a push about the 8:00 dose that morning. A trigger sets active_since
-- itself on insert and keeps it on update, so nobody can date it back.
-- Changing who is told or the delay keeps it; turning it off deletes the row.
--
-- WHO CAN DO WHAT
--
--   * set, change, turn off: a grown-up (parent or adult) of the household
--     who can see the medicine. A child cannot, even one with a login.
--   * who is told: an active grown-up of the same household with a login,
--     not the person taking the medicine, and someone who could see the
--     medicine anyway -- a 'parents' medicine only to a parent, a 'private'
--     one only to whoever wrote it. Nothing about a medicine reaches somebody
--     its visibility leaves out. medicine_alert_receiver_ok() says this once,
--     for the policies and for the five-minute job.
--   * see it: whoever can see the medicine. The card says who is told, so it
--     never feels like hidden watching.
--   * Kin Plus, like the medicine itself: a new row goes through
--     require_kin_plus. Turning it off is always allowed.
--
-- WHEN IT IS SENT
--
-- due_missed_dose_alerts() is asked by /api/cron/reminders every five
-- minutes, beside due_reminders(). For each alert it walks today's and
-- yesterday's doses in the household's own clock (household_clock), and a
-- dose is due when its time plus the delay has passed, within the last three
-- hours (later than that the news is stale), it is still not ticked, and it
-- was scheduled after the alert was turned on. reminder_sends remembers each
-- 'missed:<medicine>:<day>:<time>', so one dose is reported once. The
-- receiver's Health switch in Settings, Notifications is respected.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.health_medicine_alerts (
  medicine_id uuid primary key references public.health_medicines(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  notify_member_id uuid not null references public.members(id) on delete cascade,
  delay_minutes integer not null default 60 check (delay_minutes in (30, 60, 120)),
  active_since timestamptz not null default now(),
  set_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists health_medicine_alerts_family_idx on public.health_medicine_alerts (family_id);
create index if not exists health_medicine_alerts_notify_idx on public.health_medicine_alerts (notify_member_id);
create index if not exists health_medicine_alerts_set_by_idx on public.health_medicine_alerts (set_by);

-- May this person be told about this medicine? Caller-scoped: the medicine
-- must be in the caller's own household, so it answers nothing about anyone
-- else's. Security definer so the policies can read members and the medicine
-- whatever the caller's own visibility.
create or replace function public.medicine_alert_receiver_ok(p_medicine uuid, p_receiver uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.health_medicines med
    join public.members r on r.id = p_receiver
    where med.id = p_medicine
      and med.family_id = (select public.current_family_id())
      and r.family_id = med.family_id
      and r.status = 'active'
      and r.role in ('parent', 'adult')
      and r.auth_user_id is not null
      and r.id <> med.member_id
      and (med.visibility = 'family' or r.id = med.created_by or (med.visibility = 'parents' and r.role = 'parent'))
  );
$$;

revoke execute on function public.medicine_alert_receiver_ok(uuid, uuid) from public, anon;
grant execute on function public.medicine_alert_receiver_ok(uuid, uuid) to authenticated;

-- active_since is the server's: now() on insert, unchanged on update. The
-- medicine and household a row belongs to never move.
create or replace function public.health_medicine_alerts_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.active_since := now();
  else
    if new.medicine_id is distinct from old.medicine_id or new.family_id is distinct from old.family_id then
      raise exception 'an alert stays on its own medicine';
    end if;
    new.active_since := old.active_since;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.health_medicine_alerts_stamp() from public, anon, authenticated;

drop trigger if exists health_medicine_alerts_stamp on public.health_medicine_alerts;
create trigger health_medicine_alerts_stamp
  before insert or update on public.health_medicine_alerts
  for each row execute function public.health_medicine_alerts_stamp();

drop trigger if exists require_kin_plus on public.health_medicine_alerts;
create trigger require_kin_plus
  before insert on public.health_medicine_alerts
  for each row execute function public.require_kin_plus('Medicines');

alter table public.health_medicine_alerts enable row level security;

-- Seen by whoever can see the medicine (its own policy decides, asked under
-- the caller's RLS).
drop policy if exists health_medicine_alerts_select on public.health_medicine_alerts;
create policy health_medicine_alerts_select on public.health_medicine_alerts for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.health_medicines m where m.id = medicine_id)
  );

drop policy if exists health_medicine_alerts_insert on public.health_medicine_alerts;
create policy health_medicine_alerts_insert on public.health_medicine_alerts for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and set_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.health_medicines m where m.id = medicine_id and m.family_id = (select public.current_family_id()))
    and public.medicine_alert_receiver_ok(medicine_id, notify_member_id)
  );

drop policy if exists health_medicine_alerts_update on public.health_medicine_alerts;
create policy health_medicine_alerts_update on public.health_medicine_alerts for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.health_medicines m where m.id = medicine_id)
  )
  with check (
    family_id = (select public.current_family_id())
    and set_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and public.medicine_alert_receiver_ok(medicine_id, notify_member_id)
  );

drop policy if exists health_medicine_alerts_delete on public.health_medicine_alerts;
create policy health_medicine_alerts_delete on public.health_medicine_alerts for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.health_medicines m where m.id = medicine_id)
  );

-- The five-minute job's part. Same shape and secret as due_reminders();
-- granted to anon because the route calls with the anon key and the secret
-- is the credential.
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
           case pm.sex
             when 'female' then split_part(pm.full_name, ' ', 1) || ' hasn''t taken her ' || to_char(t.time::time, 'FMHH12:MI AM') || ' ' || med.name
             when 'male' then split_part(pm.full_name, ' ', 1) || ' hasn''t taken his ' || to_char(t.time::time, 'FMHH12:MI AM') || ' ' || med.name
             else split_part(pm.full_name, ' ', 1) || '''s ' || to_char(t.time::time, 'FMHH12:MI AM') || ' ' || med.name || ' isn''t ticked'
           end as title,
           case al.delay_minutes
             when 30 then 'Not ticked half an hour after it was due. '
             when 120 then 'Not ticked two hours after it was due. '
             else 'Not ticked an hour after it was due. '
           end || 'Tap to check.' as body,
           '/family/members/' || med.member_id || '?view=health&seg=medicines' as url
    from public.health_medicine_alerts al
    join public.health_medicines med on med.id = al.medicine_id
    join zones z on z.family_id = med.family_id
    join public.members pm on pm.id = med.member_id
    cross join lateral unnest(med.times) as t(time)
    cross join lateral (values (z.today), (z.today - 1)) as d(day)
    cross join lateral (select (d.day + t.time::time) at time zone z.tz as dose_at) x
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
