-- Kin's own offers: days of Kin Plus for trying what makes Kin stick
-- ===================================================================
--
-- Approved by Jonathan, 28 September. Kin offers a household, now and then,
-- a small task that shows it a part of Kin it has not used -- fill in your
-- profile, add the emergency card, log water for three days, set a goal --
-- with days of Kin Plus as the reward. Each offer is temporary and can be
-- taken or skipped.
--
--  * One at a time, and at most one new offer a day. None in a household's
--    first week. Which one is chosen depends on what the household has not
--    used yet, so it follows their usage; among those, it varies by day.
--  * Taken: finish it within 7 days and the days are earned. Skipped: that
--    offer does not come back for 30 days. Each feature offer is earned once
--    per household, and feature offers earn at most 30 days a year.
--  * Kin checks completion from the data itself (check_kin_offers), the way
--    the Goals rings fill, rather than trusting a tap.
--  * Inviting another family is worth more, and more again if they pay:
--    7 days when a family names this one as the one who invited it, and 30
--    more when that family subscribes to Kin Plus (Jonathan: "they should
--    proceed with premium subscription to earn more days compared to just
--    registering"). Referral days are outside the 30-a-year cap.
--
-- Where the days go (Jonathan: yes to both): a household on Kin Plus with an
-- end date (trialing) has it pushed back; a household on Kin Free gets a
-- taste -- Plus from now for those days; a household paying, or given Plus
-- by a code, banks them in plus_credit_days for when billing can use them.
--
-- This moves what a household is entitled to, so it runs only inside the
-- security-definer functions below, with kin.privileged set -- the same way
-- guard_family_access_columns() already lets such functions through -- and
-- every award is written once to kin_plus_awards.

-- 1. The household's side ----------------------------------------------------------

alter table public.families
  add column if not exists plus_credit_days integer not null default 0;
alter table public.families
  add column if not exists referred_by uuid references public.families(id) on delete set null;
-- The code another family types to say who invited them. Not invite_code:
-- that one lets a person JOIN this household, and must not be shared widely.
alter table public.families
  add column if not exists referral_code text not null default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

create unique index if not exists families_referral_code_key on public.families (referral_code);
create index if not exists families_referred_by_idx on public.families (referred_by);

-- The same guard, now over these three as well: a member cannot bank their own
-- days, name a referrer after the fact, or choose their code.
create or replace function public.guard_family_access_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('kin.privileged', true), 'off') = 'on' then
    return new;
  end if;
  if new.access_status is distinct from old.access_status
     or new.access_source is distinct from old.access_source
     or new.access_expires_at is distinct from old.access_expires_at
     or new.billing_customer_id is distinct from old.billing_customer_id
     or new.billing_subscription_id is distinct from old.billing_subscription_id
     or new.plus_credit_days is distinct from old.plus_credit_days
     or new.referred_by is distinct from old.referred_by
     or new.referral_code is distinct from old.referral_code then
    raise exception 'access and billing fields cannot be set directly';
  end if;
  return new;
end;
$$;

-- 2. Offers and awards ------------------------------------------------------------

create table if not exists public.household_offers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  code text not null,
  days integer not null,
  status text not null default 'offered',
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  answered_at timestamptz,
  completed_at timestamptz,
  answered_by uuid references public.members(id) on delete set null,
  constraint household_offers_status_check check (status in ('offered', 'accepted', 'skipped', 'completed', 'expired')),
  constraint household_offers_days_sane check (days between 1 and 60)
);

create index if not exists household_offers_family_id_idx on public.household_offers (family_id, offered_at desc);
create index if not exists household_offers_answered_by_idx on public.household_offers (answered_by);
-- One live offer per household.
create unique index if not exists household_offers_one_live
  on public.household_offers (family_id) where status in ('offered', 'accepted');

create table if not exists public.kin_plus_awards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  reason text not null,
  -- The family that earned it for them, for referral awards.
  source_family uuid references public.families(id) on delete set null,
  days integer not null,
  created_at timestamptz not null default now(),
  constraint kin_plus_awards_days_sane check (days between 1 and 60)
);

-- Each award once: a feature offer once per household, each referral step
-- once per referred family.
create unique index if not exists kin_plus_awards_once
  on public.kin_plus_awards (family_id, reason, coalesce(source_family, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists kin_plus_awards_source_family_idx on public.kin_plus_awards (source_family);

alter table public.household_offers enable row level security;
alter table public.kin_plus_awards enable row level security;

-- Read-only to the household. Every write goes through the functions below.
drop policy if exists household_offers_select on public.household_offers;
create policy household_offers_select on public.household_offers
  for select to authenticated
  using (family_id = (select public.current_family_id()));

drop policy if exists kin_plus_awards_select on public.kin_plus_awards;
create policy kin_plus_awards_select on public.kin_plus_awards
  for select to authenticated
  using (family_id = (select public.current_family_id()));

-- 3. Where the days go -------------------------------------------------------------

create or replace function public.grant_plus_days(p_family uuid, p_days integer, p_reason text, p_source uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.families%rowtype;
  -- Put back what was there, not 'off': this is also called from inside
  -- privileged work (the referral trigger fires on billing's own update),
  -- and switching it off there would refuse that work's next statement.
  v_was text := coalesce(current_setting('kin.privileged', true), 'off');
begin
  insert into kin_plus_awards (family_id, reason, source_family, days)
  values (p_family, p_reason, p_source, p_days)
  on conflict do nothing;
  if not found then
    return 0;
  end if;

  select * into f from families where id = p_family for update;
  perform set_config('kin.privileged', 'on', true);
  if f.access_status = 'trialing' and f.access_expires_at is not null and f.access_expires_at > now() then
    update families set access_expires_at = access_expires_at + make_interval(days => p_days) where id = p_family;
  elsif f.access_status in ('active', 'past_due', 'comped') then
    update families set plus_credit_days = plus_credit_days + p_days where id = p_family;
  else
    -- On Kin Free: a taste of Plus, from now.
    update families set access_status = 'trialing', access_expires_at = now() + make_interval(days => p_days) where id = p_family;
  end if;
  perform set_config('kin.privileged', v_was, true);
  return p_days;
end;
$$;

revoke execute on function public.grant_plus_days(uuid, integer, text, uuid) from public, anon, authenticated;

-- 4. The offers, and whether each is done -------------------------------------------

create or replace function public.kin_offer_catalog()
returns table (code text, days integer, plus_only boolean)
language sql
immutable
as $$
  values
    ('profile', 1, false),
    ('emergency', 2, false),
    ('grownup', 3, false),
    ('water3', 1, false),
    ('calendar', 2, false),
    ('goal', 1, false),
    ('ai', 1, false),
    ('vault', 3, true),
    ('refer', 7, false)
$$;

create or replace function public.kin_offer_done(p_family uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_code
    when 'profile' then exists (select 1 from members m where m.family_id = p_family and m.status = 'active' and m.auth_user_id is not null and m.dob is not null and m.mobile is not null and m.avatar_url is not null)
    when 'emergency' then exists (select 1 from emergency_contacts e where e.family_id = p_family)
    when 'grownup' then (select count(*) from members m where m.family_id = p_family and m.status = 'active' and m.role in ('parent', 'adult') and m.auth_user_id is not null) >= 2
    when 'water3' then (select count(distinct l.log_date) from liquid_intake_log l where l.family_id = p_family and l.glasses > 0) >= 3
    when 'calendar' then exists (select 1 from calendar_tokens t join members m on m.id = t.member_id where m.family_id = p_family)
    when 'goal' then exists (select 1 from planner_goals g where g.family_id = p_family)
    when 'ai' then exists (select 1 from ai_usage u where u.family_id = p_family and u.uses > 0)
    when 'vault' then exists (select 1 from doc_entries d where d.family_id = p_family) or exists (select 1 from family_vault_items v where v.family_id = p_family)
    else false
  end;
$$;

revoke execute on function public.kin_offer_done(uuid, text) from public, anon, authenticated;

-- The live offer for the caller's household, choosing a new one when it is
-- time. Grown-ups only: accepting Plus is a household decision.
create or replace function public.next_kin_offer()
returns setof public.household_offers
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_family uuid := public.current_family_id();
  v_created timestamptz;
  v_feature_days integer;
  v_pick record;
begin
  if v_family is null or public.current_member_role() not in ('parent', 'adult') then
    return;
  end if;

  update household_offers set status = 'expired'
  where family_id = v_family and status in ('offered', 'accepted') and expires_at <= now();

  return query select * from household_offers where family_id = v_family and status in ('offered', 'accepted');
  if found then
    return;
  end if;

  select created_at into v_created from families where id = v_family;
  if v_created > now() - interval '7 days' then
    return;
  end if;
  -- At most one new offer a day, whatever became of the last.
  if exists (select 1 from household_offers where family_id = v_family and offered_at > now() - interval '1 day') then
    return;
  end if;

  select coalesce(sum(a.days), 0) into v_feature_days
  from kin_plus_awards a
  where a.family_id = v_family and a.reason like 'offer:%' and a.created_at > now() - interval '365 days';

  select c.code, c.days into v_pick
  from kin_offer_catalog() c
  where
    -- Not earned already (referral may be offered again).
    (c.code = 'refer' or not exists (select 1 from kin_plus_awards a where a.family_id = v_family and a.reason = 'offer:' || c.code))
    -- Not skipped or let lapse in the last 30 days.
    and not exists (
      select 1 from household_offers o
      where o.family_id = v_family and o.code = c.code
        and o.status in ('skipped', 'expired', 'completed') and o.offered_at > now() - interval '30 days'
    )
    -- Something the household has not done yet: that is the point.
    and not public.kin_offer_done(v_family, c.code)
    and (not c.plus_only or public.family_has_plus(v_family))
    -- Feature offers stay within 30 days a year; referral is outside it.
    and (c.code = 'refer' or v_feature_days + c.days <= 30)
  order by md5(v_family::text || c.code || current_date::text)
  limit 1;

  if v_pick.code is null then
    return;
  end if;

  return query
  insert into household_offers (family_id, code, days)
  values (v_family, v_pick.code, v_pick.days)
  returning *;
end;
$$;

revoke execute on function public.next_kin_offer() from public, anon;
grant execute on function public.next_kin_offer() to authenticated;

create or replace function public.respond_kin_offer(p_offer uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := public.current_family_id();
  v_status text;
begin
  if v_family is null or public.current_member_role() not in ('parent', 'adult') then
    raise exception 'Only a parent or another adult can answer Kin''s offers.' using errcode = '42501';
  end if;
  update household_offers
  set status = case when p_accept then 'accepted' else 'skipped' end,
      answered_at = now(),
      answered_by = public.current_member_id(),
      -- Taken: a week to do it from now.
      expires_at = case when p_accept then now() + interval '7 days' else expires_at end
  where id = p_offer and family_id = v_family and status = 'offered' and expires_at > now()
  returning status into v_status;
  if v_status is null then
    raise exception 'That offer is no longer open.' using errcode = 'P0002';
  end if;
  return v_status;
end;
$$;

revoke execute on function public.respond_kin_offer(uuid, boolean) from public, anon;
grant execute on function public.respond_kin_offer(uuid, boolean) to authenticated;

-- Taken offers the household has now done: earned. Returns what was just
-- earned, for the moment it happens.
create or replace function public.check_kin_offers()
returns table (code text, days integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_family uuid := public.current_family_id();
  o record;
  v_days integer;
begin
  if v_family is null then
    return;
  end if;
  for o in
    select * from household_offers
    where family_id = v_family and status = 'accepted' and expires_at > now() and code <> 'refer'
  loop
    if public.kin_offer_done(v_family, o.code) then
      update household_offers set status = 'completed', completed_at = now() where id = o.id;
      v_days := public.grant_plus_days(v_family, o.days, 'offer:' || o.code, null);
      if v_days > 0 then
        code := o.code;
        days := v_days;
        return next;
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function public.check_kin_offers() from public, anon;
grant execute on function public.check_kin_offers() to authenticated;

-- 5. Invited by another family ------------------------------------------------------
--
-- A new household (its first 14 days) names the family that invited it, once.
-- The inviting family earns 7 days now, and 30 more if this household later
-- subscribes (the trigger below).

create or replace function public.set_referrer(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := public.current_family_id();
  f public.families%rowtype;
  v_referrer public.families%rowtype;
  v_was text := coalesce(current_setting('kin.privileged', true), 'off');
begin
  if v_family is null or public.current_member_role() not in ('parent', 'adult') then
    raise exception 'Only a parent or another adult can say who invited the household.' using errcode = '42501';
  end if;
  select * into f from families where id = v_family for update;
  if f.referred_by is not null then
    raise exception 'This household already named who invited it.' using errcode = 'P0001';
  end if;
  if f.created_at < now() - interval '14 days' then
    raise exception 'A household can name who invited it in its first 14 days.' using errcode = 'P0001';
  end if;
  select * into v_referrer from families where referral_code = upper(trim(p_code));
  if not found or v_referrer.id = v_family then
    raise exception 'That code doesn''t match another family on Kin.' using errcode = 'P0002';
  end if;

  perform set_config('kin.privileged', 'on', true);
  update families set referred_by = v_referrer.id where id = v_family;
  perform set_config('kin.privileged', v_was, true);

  perform public.grant_plus_days(v_referrer.id, 7, 'refer:join', v_family);
  update household_offers set status = 'completed', completed_at = now()
  where family_id = v_referrer.id and code = 'refer' and status in ('offered', 'accepted');
  return v_referrer.name;
end;
$$;

revoke execute on function public.set_referrer(text) from public, anon;
grant execute on function public.set_referrer(text) to authenticated;

create or replace function public.families_reward_referrer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referred_by is not null
     and new.access_status = 'active'
     and old.access_status is distinct from 'active' then
    perform public.grant_plus_days(new.referred_by, 30, 'refer:plus', new.id);
  end if;
  return new;
end;
$$;

revoke execute on function public.families_reward_referrer() from public, anon, authenticated;

drop trigger if exists families_reward_referrer on public.families;
create trigger families_reward_referrer
  after update of access_status on public.families
  for each row execute function public.families_reward_referrer();
