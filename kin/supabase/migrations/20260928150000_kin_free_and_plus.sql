-- Kin Free and Kin Plus, with a 14-day trial (approved by Jonathan, 28 September).
--
-- Until now a household was either let in or locked out. New households
-- could only be opened with a hand-issued access code, a code's trial fell
-- back to 14 days, and when a trial lapsed every page redirected to a plan
-- screen that could not take a payment -- a dead end with the family's own
-- records behind it.
--
-- From here:
--
--  * Every new household starts a 14-day Kin Plus trial on its own. No code,
--    no card. The column default does it, so create_family and anything else
--    that opens a household get the same trial without being rewritten.
--  * When the trial ends the household drops to Kin Free. It is never locked
--    out: calendar, chores, lists, chat, calls, journal, the tree and the
--    relatives' feed stay free for good.
--  * Kin Plus is money (Wealth), the vault, medicines, the illness log,
--    vitals and Apple Health, unlimited Kin AI and flyer scans, and 50 GB of
--    photo storage instead of 1 GB.
--  * What a household already added stays readable after a downgrade. Only
--    NEW entries in a Plus area need Plus, which is why the guard below is a
--    BEFORE INSERT trigger and not a change to the read policies.
--
-- access_status keeps its values. "Has Plus" means comped, active, past_due
-- (a failed card is a card, not a decision), or trialing with time left.
-- Anything else -- a lapsed trial, 'expired' -- is Kin Free.

-- 1. The trial, by default ----------------------------------------------------

alter table public.families
  alter column access_expires_at set default (now() + interval '14 days');

-- Households left over from before billing existed: trialing, no end date and
-- no source. readAccess used to treat "no end date" as "never ends", which
-- is the endless trial the go-live audit found. On 28 September these were
-- only QA households ("ZZ QA Testbed 2" in production, "Dev Sample Household"
-- in dev); both real households are comped by code. They become comped so
-- the end-to-end suite, which writes to Wealth and the vault, keeps working,
-- and from here on "trialing with no end date" is not Plus.
do $$
begin
  perform set_config('kin.privileged', 'on', true);
  update public.families
     set access_status = 'comped'
   where access_status = 'trialing'
     and access_expires_at is null
     and access_source is null;
  perform set_config('kin.privileged', 'off', true);
end $$;

-- 2. Who has Plus -------------------------------------------------------------

create or replace function public.family_has_plus(p_family uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from families f
    where f.id = p_family
      and (
        f.access_status in ('comped', 'active', 'past_due')
        or (f.access_status = 'trialing' and f.access_expires_at is not null and f.access_expires_at > now())
      )
  );
$$;

-- Internal: only the guard and use_kin_ai() below call it (both security
-- definer). Supabase grants EXECUTE on new functions to anon and
-- authenticated by default, so it is taken away explicitly -- otherwise anyone
-- holding a household's id could ask whether it pays.
revoke execute on function public.family_has_plus(uuid) from public, anon, authenticated;

-- 3. The guard on Plus areas ---------------------------------------------------
--
-- Refuses a new row in a Plus area for a household on Kin Free. Only a
-- signed-in member is refused: the server's own work (no auth.uid(), e.g. the
-- reminder job or an Apple Health import already linked) and privileged
-- functions pass, the same way guard_family_access_columns lets them.
--
-- The message starts with "kin_plus_required" so the app can recognise it
-- (db-errors.ts) and say something a person can act on.

create or replace function public.require_kin_plus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('kin.privileged', true), 'off') = 'on' then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if not public.family_has_plus(new.family_id) then
    raise exception 'kin_plus_required: % is part of Kin Plus', tg_argv[0]
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.require_kin_plus() from public, anon, authenticated;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('accounts', 'Wealth'), ('assets', 'Wealth'), ('liabilities', 'Wealth'),
      ('bills', 'Wealth'), ('budget_allocations', 'Wealth'), ('budget_periods', 'Wealth'),
      ('goals', 'Wealth'), ('income_schedules', 'Wealth'), ('wealth_targets', 'Wealth'),
      ('wealth_transactions', 'Wealth'),
      ('doc_entries', 'The vault'), ('doc_files', 'The vault'), ('doc_folders', 'The vault'),
      ('family_vault_items', 'The vault'),
      ('health_medicines', 'Medicines'), ('health_medicine_doses', 'Medicines'),
      ('health_illness_logs', 'The illness log'), ('health_vitals', 'Vitals'),
      ('health_import_tokens', 'Apple Health'), ('omron_links', 'Omron')
    ) as v(tbl, area)
  loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('drop trigger if exists require_kin_plus on public.%I', t.tbl);
      execute format(
        'create trigger require_kin_plus before insert on public.%I for each row execute function public.require_kin_plus(%L)',
        t.tbl, t.area
      );
    end if;
  end loop;
end $$;

-- 4. Kin AI and flyer scans: five a month on Free ----------------------------
--
-- Every question to Kin AI and every flyer scan costs real money, so Free
-- gets five a month to try it and Plus is unlimited (fair use). One counter
-- per household per month (Manila time), bumped under a row lock so two
-- phones asking at once cannot both take the last one.

create table if not exists public.ai_usage (
  family_id uuid not null references public.families(id) on delete cascade,
  month date not null,
  uses integer not null default 0,
  primary key (family_id, month)
);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage: household reads its own" on public.ai_usage;
create policy "ai_usage: household reads its own" on public.ai_usage
  for select to authenticated
  using (family_id in (select m.family_id from members m where m.auth_user_id = (select auth.uid()) and m.status = 'active'));
-- No insert or update policy: only use_kin_ai() below writes here.

create or replace function public.use_kin_ai()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_family uuid;
  v_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date;
  v_uses integer;
  v_limit constant integer := 5;
begin
  select m.family_id into v_family
  from members m
  where m.auth_user_id = auth.uid() and m.status = 'active'
  limit 1;
  if v_family is null then
    raise exception 'not a member of a household';
  end if;

  insert into ai_usage (family_id, month) values (v_family, v_month)
  on conflict (family_id, month) do nothing;

  select uses into v_uses from ai_usage
  where family_id = v_family and month = v_month
  for update;

  if public.family_has_plus(v_family) then
    update ai_usage set uses = uses + 1 where family_id = v_family and month = v_month;
    return jsonb_build_object('ok', true, 'plus', true, 'left', null);
  end if;

  if v_uses >= v_limit then
    return jsonb_build_object('ok', false, 'plus', false, 'left', 0);
  end if;

  update ai_usage set uses = uses + 1 where family_id = v_family and month = v_month;
  return jsonb_build_object('ok', true, 'plus', false, 'left', v_limit - v_uses - 1);
end;
$$;

revoke execute on function public.use_kin_ai() from public, anon;
grant execute on function public.use_kin_ai() to authenticated;

-- 5. Photo storage: 1 GB on Free, 50 GB on Plus ------------------------------
--
-- What the caller's household has in Kin's own storage. Files kept on the
-- household's Google Drive are theirs and do not count. Every bucket keeps a
-- household's files under a folder named for its family_id, which is what
-- the storage policies already rely on.

create or replace function public.family_storage_bytes()
returns bigint
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
  from storage.objects o
  where (storage.foldername(o.name))[1] = (
    select m.family_id::text from public.members m
    where m.auth_user_id = auth.uid() and m.status = 'active'
    limit 1
  );
$$;

revoke execute on function public.family_storage_bytes() from public, anon;
grant execute on function public.family_storage_bytes() to authenticated;

-- 6. Telling the organizer before the trial ends ------------------------------
--
-- On the reminder job that already exists (20260926140000_reminders.sql), as
-- a function of its own like due_pantry_reminders: the same five-minute tick,
-- shared secret and once-only ledger. Two pushes, to the organizer only --
-- the one person who can choose a plan: three days before the trial ends,
-- and once it has ended. From 09:00 Manila, never in the night.

create or replace function public.due_trial_reminders(p_secret text, p_now timestamptz default now())
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
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;
  if local_now::time < time '09:00' or local_now::time >= time '21:00' then
    return;
  end if;

  return query
  with candidates as (
    select 'trial:' || f.id || ':3days' as key,
           f.id as family_id,
           'Kin Plus: 3 days left of your trial' as title,
           'After that ' || f.name || ' moves to Kin Free. Your calendar, lists and chat stay. See what Plus keeps.' as body,
           '/subscribe' as url
    from families f
    where f.access_status = 'trialing'
      and f.access_expires_at > p_now
      and f.access_expires_at <= p_now + interval '3 days'
    union all
    select 'trial:' || f.id || ':ended',
           f.id,
           'Your Kin Plus trial has ended',
           f.name || ' is on Kin Free now. Everything you added is still here. Plus is ₱149 a month.',
           '/subscribe'
    from families f
    where f.access_status = 'trialing'
      and f.access_expires_at <= p_now
      and f.access_expires_at > p_now - interval '2 days'
  ),
  fresh as (
    insert into reminder_sends (key)
    select c.key from candidates c
    on conflict do nothing
    returning reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh fr on fr.key = c.key
  join members m on m.family_id = c.family_id and m.is_organiser and m.status = 'active'
  join push_subscriptions s on s.member_id = m.id;
end;
$$;

revoke all on function public.due_trial_reminders(text, timestamptz) from public;
grant execute on function public.due_trial_reminders(text, timestamptz) to anon, authenticated;
