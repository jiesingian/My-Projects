-- Alarms that never run out, on Android too (29 October). due_alarm_wakes
-- (20261029200000) picked only the Kin iPhone app's alert tokens, so an
-- Android phone kept the two weeks of alarms it got the last time Kin was
-- opened. It now also picks the Android app's Firebase token (lib/fcm.ts:
-- p256dh 'kin-native', auth 'fcm'). The reminder route sends it a data
-- message `sync: alarms`, and KinMessagingService fetches api/alarms with the
-- web view's own session cookies and sets them again, as the iPhone does.
--
-- Same rules as before: once a day from 03:00 in the household's zone per
-- device, and within five minutes of a change that moves an alarm. Nothing is
-- sent to a phone until its keys exist (APNS_* for an iPhone, FCM_* for an
-- Android phone); the route skips the other kind.
--
-- Only the device filter changed; same signature, so create or replace keeps
-- the grants. No begin/commit: migrate.mjs wraps this file.

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
    where s.p256dh = 'kin-native' and s.auth in ('alert', 'fcm')
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
