-- A medicine reminder comes back until the dose is ticked (Jonathan, 22
-- October: "the notification in medicine is not making the user really get
-- notified ... like an alarm clock").
--
-- Every phone that has saved a device in production is an iPhone, and a web
-- app's notification on an iPhone cannot ring like an alarm: no full screen,
-- no alarm sound, no vibration pattern, silent on silent and in a Focus. What
-- a web app can do is not let one banner be the whole reminder. So:
--
-- * due_dose_repeats(): the dose reminder again 5 and 10 minutes after the
--   dose time, while it is still not ticked. Same people as the first one
--   (the person taking it, and for a child the grown-ups the medicine is
--   shared with), same "Medicine" switch, same household clock. Its own key
--   per repeat ('dose-again:<medicine>:<day>:<time>:<n>'), so each goes once,
--   even with the cron running every five minutes and a retry after it.
-- * The first reminder is unchanged (due_reminders, 20261020210000). The
--   grown-up's missed-dose alert (due_missed_dose_alerts) is unchanged and
--   still comes after the medicine's own delay.
--
-- A repeat only goes while the dose is untaken and the time is no more than
-- 14 minutes past: once ticked -- on the notification's own alarm screen,
-- Today or Health -- nothing more is sent.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create or replace function public.due_dose_repeats(p_secret text, p_now timestamptz default now())
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
    select hc.family_id, hc.tz, hc.today from household_clock(p_now) hc
  ),
  grownups as (
    select m.id, m.family_id, m.role from members m where m.status = 'active' and m.role in ('parent', 'adult')
  ),
  due as (
    select med.id as medicine_id, med.family_id, med.member_id, med.name, med.dose, med.visibility, med.created_by,
           d.day, t.time,
           -- 1 at 5-9 minutes past the dose time, 2 at 10-14.
           floor(extract(epoch from p_now - ((d.day + t.time::time) at time zone z.tz)) / 300)::int as n
    from health_medicines med
    join zones z on z.family_id = med.family_id
    cross join lateral unnest(med.times) as t(time)
    cross join lateral (values (z.today), (z.today - 1)) as d(day)
    where med.start_date <= d.day and (med.end_date is null or med.end_date >= d.day)
      and ((d.day + t.time::time) at time zone z.tz) <= p_now - interval '5 minutes'
      and ((d.day + t.time::time) at time zone z.tz) > p_now - interval '15 minutes'
      and not exists (select 1 from health_medicine_doses hd where hd.medicine_id = med.id and hd.dose_date = d.day and hd.dose_time = t.time)
  ),
  candidates as (
    select 'dose-again:' || x.medicine_id || ':' || x.day || ':' || x.time || ':' || x.n as key,
           x.family_id, 'health'::text as kind,
           array(
             select r from (
               select x.member_id as r from members pm where pm.id = x.member_id and pm.status = 'active'
               union
               select g.id from grownups g
               join members pm on pm.id = x.member_id
               where g.family_id = x.family_id and pm.role in ('child_managed', 'child_self')
                 and (x.visibility = 'family' or (x.visibility = 'parents' and g.role = 'parent') or g.id = x.created_by)
             ) rr
           ) as recipients,
           'Still time for ' || w.title_rest as title, w.body, w.url
    from due x
    join members pm on pm.id = x.member_id
    cross join lateral (
      select substr(pw.title, length('Time for ') + 1) as title_rest, pw.body, pw.url
      from push_words_dose(split_part(pm.full_name, ' ', 1), x.name, x.dose, x.time, x.member_id) pw
    ) w
    where x.n in (1, 2)
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

-- As due_reminders: callable with the anon key, and useless without the secret.
revoke all on function public.due_dose_repeats(text, timestamptz) from public;
grant execute on function public.due_dose_repeats(text, timestamptz) to anon, authenticated;
