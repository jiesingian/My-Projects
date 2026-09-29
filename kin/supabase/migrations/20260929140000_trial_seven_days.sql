-- A 7-day Kin Plus trial, with days to earn during it (approved by Jonathan,
-- 29 September).
--
-- The trial was 14 days (20260928150000_kin_free_and_plus.sql). From here:
--
--  * A NEW household gets 7 days. The column default is the only thing that
--    sets it, so households already mid-trial keep the end date they were
--    given, and comped households are untouched.
--  * Kin's setup offers (20260929020000_kin_offers.sql) may now appear from
--    a household's second day instead of its second week. Days earned while
--    trialing push the end date back (grant_plus_days), so a family that sets
--    Kin up properly can stretch the 7 days to about 14.
--  * The organizer hears about it three times: on day 5 (3 days left), on
--    day 7 (the last day), and on day 8 (moved to Kin Free).
--
-- What happens at the end is unchanged: Kin Free, nothing locked, nothing
-- deleted, only new entries in a Plus area refused.

-- 1. The trial, by default ----------------------------------------------------

alter table public.families
  alter column access_expires_at set default (now() + interval '7 days');

-- 2. Three notices -------------------------------------------------------------
--
-- Same shape as before, one notice added. The windows do not overlap, so a
-- short trial -- a day of Plus earned on Kin Free -- gets the last-day notice
-- and not both at once. The '3days' key keeps its name so a household that
-- already had that notice on its 14-day trial does not get it again.

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
      and f.access_expires_at > p_now + interval '1 day'
      and f.access_expires_at <= p_now + interval '3 days'
    union all
    select 'trial:' || f.id || ':lastday',
           f.id,
           'Last day of your Kin Plus trial',
           'Tomorrow ' || f.name || ' moves to Kin Free. Nothing you added is lost. Plus is ₱149 a month for the whole family.',
           '/subscribe'
    from families f
    where f.access_status = 'trialing'
      and f.access_expires_at > p_now
      and f.access_expires_at <= p_now + interval '1 day'
    union all
    select 'trial:' || f.id || ':ended',
           f.id,
           'You''re on Kin Free now',
           'Everything ' || f.name || ' added is still here. Calendar, lists, chat and calls stay free. Plus is ₱149 a month.',
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

-- 3. Offers during the trial ---------------------------------------------------
--
-- next_kin_offer() exactly as 20260929020000 wrote it, except that a
-- household waits one day for its first offer instead of seven.

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
