-- The Start here bonus, earned by trying every part of Kin (Jonathan, 13
-- October, after 20261013160000 shipped): "prioritize utilizing features per
-- page, should at least cover all features of the app and be able to make the
-- user want to subscribe the premium version through experience."
--
-- What changes from 20261013160000_start_here_bonus.sql:
--
--  * The steps: one action per part of Kin, the same eight for everyone --
--    a plan (Planner), the grocery list (Household), a message in the family
--    chat (Chat), a journal entry (Journal), a medicine or a vitals reading
--    (Family -> Health, Plus), a document in the vault (Plus), a bill or an
--    account (Wealth, Plus), and a question to Kin AI (Plus beyond five a
--    month). Half are Plus on purpose: a family whose medicines, papers and
--    bills are already in Kin sees what Kin Free would stop it adding.
--    Inviting a partner and adding the kids are no longer counted, so a
--    household of one or two can earn it.
--  * The window: the household's first 5 days, not 24 hours (Jonathan's
--    choice). The 7 days then land before the 7-day trial ends.
--  * Kin's own offers wait while the checklist is open (Jonathan's choice):
--    several reward the same actions, and the household would otherwise be
--    paid twice. They come back once it is earned or the window closes, each
--    still earnable once.
--
-- Unchanged: 7 days, once, through grant_plus_days() and kin_plus_awards;
-- only on a live trial; only households created from 13 October;
-- claim_start_bonus() as 20261013160000 wrote it, now reading that date from
-- start_bonus_from() and calling the start_bonus_done() below.
--
-- Kin AI keeps a monthly count rather than a row per question, so that step
-- is "asked in the month the household started (or the next, when the five
-- days cross a month end)" -- a question on day 6 of the same month counts.

-- 0. From when -------------------------------------------------------------------
--
-- Households created before this saw no bonus. One place for the date, so
-- claim_start_bonus() and the checklist agree (and the PGlite probe can move
-- it to test a household old enough for Kin's offers).

create or replace function public.start_bonus_from()
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select timestamptz '2026-10-13 00:00:00+00' $$;

-- 1. The eight steps, for one household ------------------------------------------

create or replace function public.start_bonus_progress_of(p_family uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_created timestamptz;
  v_cutoff timestamptz;
begin
  select f.created_at into v_created from public.families f where f.id = p_family;
  if v_created is null then
    return null;
  end if;
  v_cutoff := v_created + interval '5 days';
  return jsonb_build_object(
    'plans', exists (select 1 from public.events e where e.family_id = p_family and e.created_at <= v_cutoff)
             or exists (select 1 from public.activities a where a.family_id = p_family and a.created_at <= v_cutoff),
    'list', exists (select 1 from public.buy_items b where b.family_id = p_family and b.created_at <= v_cutoff),
    'chat', exists (select 1 from public.family_messages m where m.family_id = p_family and m.created_at <= v_cutoff),
    'journal', exists (select 1 from public.journal_entries j where j.family_id = p_family and j.created_at <= v_cutoff),
    'health', exists (select 1 from public.health_medicines h where h.family_id = p_family and h.created_at <= v_cutoff)
              or exists (select 1 from public.health_vitals v where v.family_id = p_family and v.created_at <= v_cutoff),
    'vault', exists (select 1 from public.doc_entries d where d.family_id = p_family and d.created_at <= v_cutoff)
             or exists (select 1 from public.family_vault_items i where i.family_id = p_family and i.created_at <= v_cutoff),
    'wealth', exists (select 1 from public.bills b where b.family_id = p_family and b.created_at <= v_cutoff)
              or exists (select 1 from public.accounts a where a.family_id = p_family and a.created_at <= v_cutoff),
    'ai', exists (select 1 from public.ai_usage u where u.family_id = p_family and u.uses > 0
                  and u.month between date_trunc('month', v_created)::date and date_trunc('month', v_cutoff)::date)
  );
end;
$$;

revoke execute on function public.start_bonus_progress_of(uuid) from public, anon, authenticated;

-- What claim_start_bonus() asks: all eight, in the window.
create or replace function public.start_bonus_done(p_family uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p jsonb := public.start_bonus_progress_of(p_family);
begin
  return p is not null
    and (p->>'plans')::boolean and (p->>'list')::boolean and (p->>'chat')::boolean and (p->>'journal')::boolean
    and (p->>'health')::boolean and (p->>'vault')::boolean and (p->>'wealth')::boolean and (p->>'ai')::boolean;
end;
$$;

revoke execute on function public.start_bonus_done(uuid) from public, anon, authenticated;

-- Still earnable: a new household on a live trial, in its first 5 days, that
-- has not had it. While this is true Kin's own offers wait.
create or replace function public.start_bonus_open(p_family uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f public.families%rowtype;
begin
  select * into f from public.families where id = p_family;
  return f.id is not null
    and f.created_at >= public.start_bonus_from()
    and now() < f.created_at + interval '5 days'
    and f.access_status = 'trialing'
    and f.access_expires_at is not null and f.access_expires_at > now()
    and not exists (select 1 from public.kin_plus_awards a where a.family_id = p_family and a.reason = 'start:bonus');
end;
$$;

revoke execute on function public.start_bonus_open(uuid) from public, anon, authenticated;

-- claim_start_bonus() as 20261013160000 wrote it, with the date from above.
create or replace function public.claim_start_bonus()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family uuid := public.current_family_id();
  v_role text;
  f public.families%rowtype;
begin
  if v_family is null then
    return 0;
  end if;
  select m.role into v_role from public.members m where m.id = public.current_member_id();
  if v_role is null or v_role not in ('parent', 'adult') then
    return 0;
  end if;
  select * into f from public.families where id = v_family;
  if f.created_at < public.start_bonus_from()
     or f.access_status is distinct from 'trialing'
     or f.access_expires_at is null
     or f.access_expires_at <= now() then
    return 0;
  end if;
  if not public.start_bonus_done(v_family) then
    return 0;
  end if;
  return public.grant_plus_days(v_family, 7, 'start:bonus', null);
end;
$$;

revoke execute on function public.claim_start_bonus() from public, anon;
grant execute on function public.claim_start_bonus() to authenticated;

-- 2. The checklist, for the screen -------------------------------------------------
--
-- The caller's own household only: whether it is still open, when it closes,
-- and each step. The same answer claim_start_bonus() will act on, including
-- rows the reader cannot see (a document someone else keeps private).

create or replace function public.start_bonus_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family uuid := public.current_family_id();
  v_created timestamptz;
begin
  if v_family is null then
    return null;
  end if;
  select f.created_at into v_created from public.families f where f.id = v_family;
  return jsonb_build_object(
    'open', public.start_bonus_open(v_family),
    'ends_at', v_created + interval '5 days',
    'steps', public.start_bonus_progress_of(v_family)
  );
end;
$$;

revoke execute on function public.start_bonus_progress() from public, anon;
grant execute on function public.start_bonus_progress() to authenticated;

-- 3. Kin's offers wait while the checklist is open ---------------------------------
--
-- next_kin_offer() exactly as 20260929140000 wrote it, plus one check: no new
-- offer while start_bonus_open(). An offer already live stays.

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

  -- The Start here checklist pays for the same things: one at a time.
  if public.start_bonus_open(v_family) then
    return;
  end if;

  select created_at into v_created from families where id = v_family;
  if v_created > now() - interval '1 day' then
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
