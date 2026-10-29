-- Alarms that never run out (Jonathan, 29 October). The Kin iPhone app is
-- given two weeks of alarms each time Kin opens (lib/alarms.ts), so a phone
-- where Kin isn't opened for two weeks would go quiet. Instead the
-- five-minute reminder job sends each of the app's phones a silent push
-- (lib/apns.ts, apnsWakeRequest) that wakes the app to fetch api/alarms and
-- set them again:
--
-- - once a day, from 03:00 in the household's own zone, per device;
-- - within five minutes of a change that moves an alarm: a medicine, or a
--   plan, check-up or bill someone picked to ring (alarm_picks), or a pick
--   itself. Every phone of the household is woken; each re-reads its own
--   member's list through row-level security, so nobody learns anything new.
--
-- A change only marks its household in alarm_wake_queue (one row per
-- household, however many edits), so ten edits in a minute are one wake.
-- Every write path is covered, whichever action, page or sync made it.
-- Nothing is sent until the APNS_* keys exist: the route does not ask
-- before then (api/cron/reminders).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.alarm_wake_queue (
  family_id uuid primary key references public.families(id) on delete cascade,
  changed_at timestamptz not null default now()
);

-- Only the definer functions below touch it.
alter table public.alarm_wake_queue enable row level security;
revoke all on public.alarm_wake_queue from public, anon, authenticated;

create or replace function public.alarm_wake_mark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record := coalesce(new, old);
  fam uuid;
begin
  fam := (to_jsonb(r) ->> 'family_id')::uuid;
  if fam is null then
    return null;
  end if;
  -- A plan, check-up or bill rings only once someone picked it, so the
  -- rest of the household's planner and bills never wake a phone.
  if tg_table_name in ('activities', 'health_appointments', 'bills') and not exists (
    select 1 from public.alarm_picks p
    where p.item_id = (to_jsonb(r) ->> 'id')::uuid
      and p.kind = case tg_table_name when 'activities' then 'activity' when 'health_appointments' then 'appointment' else 'bill' end
  ) then
    return null;
  end if;
  -- A household being deleted takes its medicines and plans with it: no
  -- family left to wake.
  insert into public.alarm_wake_queue (family_id)
  select fam where exists (select 1 from public.families f where f.id = fam)
  on conflict (family_id) do update set changed_at = excluded.changed_at;
  return null;
end;
$$;

revoke all on function public.alarm_wake_mark() from public, anon, authenticated;

-- health_appointments predates the migrations folder, so each table is
-- looked up before its trigger is made.
do $$
declare
  t text;
begin
  foreach t in array array['health_medicines', 'activities', 'health_appointments', 'bills', 'alarm_picks'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists alarm_wake_mark on public.%I', t);
      execute format('create trigger alarm_wake_mark after insert or update or delete on public.%I for each row execute function public.alarm_wake_mark()', t);
    end if;
  end loop;
end;
$$;

-- The app's phones to wake now: the Kin app's alert token only (lib/apns.ts:
-- p256dh 'kin-native', auth 'alert'; the VoIP token must only ever ring),
-- each once. `reason` is 'daily' or 'changed'. Asked only by the reminder
-- route, with the cron secret, like every due_*().
create or replace function public.due_alarm_wakes(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, reason text)
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
  with devices as (
    select s.id, s.member_id, s.family_id, s.endpoint, s.p256dh, s.auth
    from push_subscriptions s
    join members m on m.id = s.member_id and m.family_id = s.family_id and m.status = 'active'
    where s.p256dh = 'kin-native' and s.auth = 'alert'
  ),
  changed as (
    delete from alarm_wake_queue q
    where q.changed_at <= p_now
    returning q.family_id
  ),
  daily as (
    select 'alarm-wake:' || d.id || ':' || hc.today as key, d.id
    from devices d
    join household_clock(p_now) hc on hc.family_id = d.family_id
    where hc.local_now::time >= time '03:00'
  ),
  fresh as (
    insert into reminder_sends (key)
    select k.key from daily k
    on conflict do nothing
    returning reminder_sends.key
  ),
  picked as (
    select k.key, k.id, 'daily'::text as reason
    from daily k join fresh f on f.key = k.key
    union all
    select 'alarm-wake-changed:' || d.id, d.id, 'changed'
    from devices d join changed c on c.family_id = d.family_id
  )
  select distinct on (d.id) p.key, d.member_id, d.endpoint, d.p256dh, d.auth, p.reason
  from picked p
  join devices d on d.id = p.id
  order by d.id, p.reason;
end;
$$;

revoke all on function public.due_alarm_wakes(text, timestamptz) from public;
grant execute on function public.due_alarm_wakes(text, timestamptz) to anon, authenticated;
