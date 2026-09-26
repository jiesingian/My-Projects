-- Reminders that arrive by themselves (26 September): a medicine dose at its
-- time, a bill the day before and on the day, a birthday in the morning, and
-- a heads-up half an hour before a timed plan starts.
--
-- HOW IT RUNS
--
-- Every five minutes pg_cron (inside this database, free, no extra plan)
-- calls kin_fire_reminders(), which posts to Kin's /api/cron/reminders with a
-- shared secret. That route asks due_reminders() -- handing the secret back
-- -- what is due, and sends the pushes. The database never holds the push
-- signing key, and Kin's server never holds the service-role key for this:
-- the secret is the only credential, checked on both sides.
--
-- The secret and the route's address live in Supabase Vault, as
-- kin_cron_secret and kin_cron_url; the same secret goes in Vercel as
-- CRON_SECRET. Until they exist nothing happens: the job runs, finds no
-- address, and stops. Setting them is Jonathan's (a secret).
--
-- WHO GETS WHAT
--
-- due_reminders() works out, in Manila time, what is due since the last few
-- minutes and has not been sent before (reminder_sends remembers each one),
-- and returns one row per device to notify:
--   * a dose (health_medicines.times) not yet ticked: the person, if they
--     have a login, and the household's grown-ups if the person is a child;
--     a 'private' medicine only to whoever wrote it and the person, a
--     'parents' one only to parents. Their "health" switch.
--   * an unpaid bill due tomorrow or today, from 09:00: the grown-ups.
--     Their "bills" switch.
--   * a birthday today, from 08:00: everyone. Their "events" switch.
--   * a timed plan (activities) starting within 35 minutes: whoever it is
--     for, or everyone for the whole family. Their "events" switch.
-- Anyone who switched a kind off in Settings, Notifications, gets none of it.

create table if not exists public.reminder_sends (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.reminder_sends enable row level security;
revoke all on public.reminder_sends from anon, authenticated;

-- The Vault secret by name, or null when Vault or the secret is missing.
create or replace function public.kin_vault_secret(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v using p_name;
  return nullif(v, '');
end;
$$;
revoke all on function public.kin_vault_secret(text) from public, anon, authenticated;

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
    select 'soon:' || a.id || ':' || a.start_at as key,
           a.family_id, 'events'::text as kind,
           case when a.applies_to_whole_family or not exists (select 1 from activity_members am where am.activity_id = a.id)
             then array(select m.id from members m where m.family_id = a.family_id and m.status = 'active')
             else array(select am.member_id from activity_members am join members m on m.id = am.member_id where am.activity_id = a.id and m.status = 'active')
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

-- A device the push service says is gone.
create or replace function public.cron_forget_endpoint(p_secret text, p_endpoint text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  expected text := kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;
  delete from push_subscriptions where endpoint = p_endpoint;
end;
$$;

revoke all on function public.due_reminders(text, timestamptz) from public;
revoke all on function public.cron_forget_endpoint(text, text) from public;
grant execute on function public.due_reminders(text, timestamptz) to anon, authenticated;
grant execute on function public.cron_forget_endpoint(text, text) to anon, authenticated;

-- ── the five-minute tick ───────────────────────────────────────────────────

-- Posts to Kin's reminders route, if Vault holds its address and the secret.
-- pg_net sends it after this returns; the answer is not waited for.
create or replace function public.kin_fire_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u text := kin_vault_secret('kin_cron_url');
  s text := kin_vault_secret('kin_cron_secret');
begin
  if u is null or s is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := jsonb_build_object(''Authorization'', ''Bearer '' || $2, ''Content-Type'', ''application/json''), timeout_milliseconds := 20000)'
    using u, s;
end;
$$;
revoke all on function public.kin_fire_reminders() from public, anon, authenticated;

-- pg_cron and pg_net are Supabase-supported extensions. If this database
-- cannot have them, say so and carry on: nothing else here depends on them.
do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net unavailable here: %', sqlerrm;
  end;
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable here: %', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    execute $c$ select cron.schedule('kin-reminders', '*/5 * * * *', 'select public.kin_fire_reminders()') $c$;
  end if;
end
$$;
