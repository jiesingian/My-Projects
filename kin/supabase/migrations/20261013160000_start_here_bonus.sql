-- Start here bonus: 7 more days of Kin Plus for finishing the first steps
-- within a day (agreed by Jonathan, 13 October, answer 6; docs/BACKLOG.md,
-- "Agreed 13 October: first open", Group C).
--
-- A new household's trial is 7 days (20260929140000). A household that does
-- every Start here step within 24 hours of being created gets 7 more, once:
-- 14 in all. Kin's own offers (20260929020000) are unchanged and still add
-- their days on top.
--
--  * Checked from the family's own records, the way kin_offer_done() checks
--    an offer: each step needs a row created in the household's first 24
--    hours. So it can be claimed later in the trial -- the last step done at
--    hour 23, Today opened at hour 30 -- but not earned late.
--  * The steps checked are the ones every household has (queries/start-here.ts):
--    this week's plans, someone else invited, the kids added, a chore, the
--    grocery list. The check-up's extra steps follow a top 3 that never
--    leaves the phone (first-open.ts, answer 9A), so the database cannot
--    know which a household was shown, and does not ask.
--  * Only on the trial with time left: not a Free household, not a paying or
--    comped one. Only households created from today, so an older household
--    still trialing on earned days cannot claim it after the fact.
--  * Once: grant_plus_days() writes kin_plus_awards, unique per household
--    and reason. Only a parent or another adult claims it, for their own
--    household; nothing about it is taken from the caller but who they are.

-- 1. Whether the steps were done in time ----------------------------------------

create or replace function public.start_bonus_done(p_family uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz;
begin
  select f.created_at + interval '24 hours' into v_cutoff from public.families f where f.id = p_family;
  if v_cutoff is null then
    return false;
  end if;
  return
    -- This week's plans: anything on the calendar.
    (exists (select 1 from public.events e where e.family_id = p_family and e.created_at <= v_cutoff)
      or exists (select 1 from public.activities a where a.family_id = p_family and a.created_at <= v_cutoff))
    -- Someone else with a login, or invited: the founder plus one.
    and (select count(*) from public.members m
         where m.family_id = p_family and m.status in ('active', 'pending') and m.created_at <= v_cutoff) >= 2
    -- The kids, with a login or as profiles.
    and exists (select 1 from public.members m
                where m.family_id = p_family and m.role in ('child_managed', 'child_self')
                  and m.status not in ('removed', 'moved') and m.created_at <= v_cutoff)
    and exists (select 1 from public.routines r where r.family_id = p_family and r.created_at <= v_cutoff)
    and exists (select 1 from public.buy_items b where b.family_id = p_family and b.created_at <= v_cutoff);
end;
$$;

revoke execute on function public.start_bonus_done(uuid) from public, anon, authenticated;

-- 2. Claiming it ------------------------------------------------------------------
--
-- Today calls this once the steps look done. Returns the days just added:
-- 7 the first time, 0 every other time.

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
  if f.created_at < timestamptz '2026-10-13 00:00:00+00'
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
