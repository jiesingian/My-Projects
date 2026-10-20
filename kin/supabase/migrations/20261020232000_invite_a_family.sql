-- Invite a family: a referral link, and Kin Plus days for both households
-- ========================================================================
--
-- Since 29 September (20260929020000_kin_offers.sql) a new household could
-- type the code of the family that invited it, in its first 14 days, and
-- that family earned 7 days of Kin Plus. Decided 20 October (Jonathan):
--
--   * the invitation is a LINK, kin.app/r/<code>, shared from Settings ->
--     "Invite a family" (and the Kin offer card). The link remembers the code
--     in a cookie, and finishing setup (create_family in the app) claims it
--     by itself; typing the code on Today still works and goes the same way;
--   * BOTH households get the days: the new one 7 ('refer:welcome'), the
--     inviting one 7 ('refer:join'), through grant_plus_days -- a live trial
--     is pushed back, Kin Free gets a taste of Plus, a paying or comped
--     household banks them in plus_credit_days;
--   * a CAP so it can't be farmed: the inviting household is rewarded for its
--     first 5 households (every one still counts as "joined through you");
--     one referral per new household, in its first 14 days; self-referral
--     refused. The 30 more days when the invited household later subscribes
--     (families_reward_referrer) stay as they were: a subscription is not
--     something a farm produces.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- Name the family that invited this household, and pay both sides. Returns
-- the inviting family's name. The same checks set_referrer made, plus the
-- cap and the newcomer's days.
create or replace function public.claim_referral(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid := public.current_family_id();
  f public.families%rowtype;
  v_referrer public.families%rowtype;
  v_was text := coalesce(current_setting('kin.privileged', true), 'off');
  v_joined integer;
begin
  if v_family is null or public.current_member_role() not in ('parent', 'adult') then
    raise exception 'Only a parent or another adult can say who invited the household.' using errcode = '42501';
  end if;
  select * into f from public.families where id = v_family for update;
  if f.referred_by is not null then
    raise exception 'This household already named who invited it.' using errcode = 'P0001';
  end if;
  if f.created_at < now() - interval '14 days' then
    raise exception 'A household can name who invited it in its first 14 days.' using errcode = 'P0001';
  end if;
  select * into v_referrer from public.families where referral_code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found or v_referrer.id = v_family then
    raise exception 'That code doesn''t match another family on Kin.' using errcode = 'P0002';
  end if;

  perform set_config('kin.privileged', 'on', true);
  update public.families set referred_by = v_referrer.id where id = v_family;
  perform set_config('kin.privileged', v_was, true);

  -- The newcomer's days, always; the inviter's for its first five.
  perform public.grant_plus_days(v_family, 7, 'refer:welcome', v_referrer.id);
  select count(*) into v_joined from public.families x where x.referred_by = v_referrer.id;
  if v_joined <= 5 then
    perform public.grant_plus_days(v_referrer.id, 7, 'refer:join', v_family);
  end if;
  update public.household_offers set status = 'completed', completed_at = now()
  where family_id = v_referrer.id and code = 'refer' and status in ('offered', 'accepted');
  return v_referrer.name;
end;
$$;

revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- Typing the code on Today goes the same way now (both sides, the cap).
create or replace function public.set_referrer(p_code text)
returns text
language sql
security definer
set search_path = ''
as $$
  select public.claim_referral(p_code)
$$;

revoke all on function public.set_referrer(text) from public, anon;
grant execute on function public.set_referrer(text) to authenticated;

-- For Settings: how many households joined through the caller's, how many
-- of those earned it days, and the cap. Definer, because another
-- household's referred_by is not the caller's to read; it returns counts,
-- never which households.
create or replace function public.referral_stats()
returns table (joined integer, rewarded integer, cap integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.families x where x.referred_by = public.current_family_id()),
    (select count(*)::int from public.kin_plus_awards a where a.family_id = public.current_family_id() and a.reason = 'refer:join'),
    5
$$;

revoke all on function public.referral_stats() from public, anon;
grant execute on function public.referral_stats() to authenticated;
