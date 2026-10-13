-- The plan a household chose before it existed (agreed 13 October, first
-- open, Group B). The public check-up ends on a plan step: "Start with Plus
-- free" or "Just Kin Free". Both start the same 7-day trial, so the choice
-- changes no access at all -- only the words on the trial card and in the
-- trial reminders. 'plus' or 'free'; null for every household created before
-- this, by moving out (start_own_household), or by someone who skipped the
-- check-up, and every reader treats null as "said nothing".
--
-- Set once, by create_family, from what sign-up carried. Readable like the
-- rest of the family row (the existing families select policies cover it).
-- Not changeable afterwards from the app: it records what was chosen at the
-- start, so a direct update is refused, the same way the access columns are
-- guarded -- by its own small trigger so the shared billing guard is left
-- alone.

alter table public.families add column if not exists chosen_plan text;
alter table public.families drop constraint if exists families_chosen_plan_check;
alter table public.families add constraint families_chosen_plan_check
  check (chosen_plan is null or chosen_plan in ('plus', 'free'));

create or replace function public.guard_family_chosen_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('kin.privileged', true), 'off') = 'on' then
    return new;
  end if;
  if new.chosen_plan is distinct from old.chosen_plan then
    raise exception 'the chosen plan is set when the household is created';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_family_chosen_plan() from public, anon, authenticated;

drop trigger if exists guard_family_chosen_plan on public.families;
create trigger guard_family_chosen_plan
  before update of chosen_plan on public.families
  for each row execute function public.guard_family_chosen_plan();

-- create_family gains p_chosen_plan. The old four-argument version is dropped
-- first: left beside the new one, a call naming only the first two arguments
-- would match both and PostgREST would refuse it as ambiguous. The body is
-- otherwise exactly the one live on dev and production (identical on both, 13
-- October). Anything other than 'plus' or 'free' is stored as null rather than
-- refused: a stale tab must never stop a family being created.
drop function if exists public.create_family(text, text, date, text);

create or replace function public.create_family(
  p_household_name text,
  p_full_name text,
  p_dob date default null,
  p_mobile text default null,
  p_chosen_plan text default null
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family public.families;
  v_member public.members;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.members where auth_user_id = auth.uid()) then
    raise exception 'already a member of a family';
  end if;

  insert into public.families (name, invite_code, chosen_plan)
  values (
    p_household_name,
    public.generate_invite_code(),
    case when p_chosen_plan in ('plus', 'free') then p_chosen_plan end
  )
  returning * into v_family;

  insert into public.members (family_id, auth_user_id, full_name, dob, mobile, role, status, is_organiser)
  values (v_family.id, auth.uid(), p_full_name, p_dob, p_mobile, 'parent', 'active', true)
  returning * into v_member;

  return v_member;
end;
$$;

revoke all on function public.create_family(text, text, date, text, text) from public, anon;
grant execute on function public.create_family(text, text, date, text, text) to authenticated, service_role;

-- The trial reminders, worded for what the household chose. The schedule,
-- recipients and keys are unchanged from 20261007140000 (household clock,
-- 09:00-21:00 local, organisers only, once per key); only title and body now
-- follow chosen_plan. Null keeps today's wording exactly.
--   plus: they meant to keep Plus, so say how, and that nothing is charged
--         unless they subscribe themselves.
--   free: they chose Free, so no selling -- just that the move is coming
--         and that everything stays.
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
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  return query
  with zones as (
    -- Households where it is 09:00 to before 21:00, in their own time zone.
    select hc.family_id from household_clock(p_now) hc
    where hc.local_now::time >= time '09:00' and hc.local_now::time < time '21:00'
  ),
  candidates as (
    select 'trial:' || f.id || ':3days' as key,
           f.id as family_id,
           case f.chosen_plan
             when 'free' then 'Kin Plus extras: 3 days left'
             else 'Kin Plus: 3 days left of your trial'
           end as title,
           case f.chosen_plan
             when 'plus' then 'To keep Plus for ' || f.name || ', subscribe before it ends: ₱149 a month or ₱1,490 a year. Nothing is charged unless you do.'
             when 'free' then 'Then ' || f.name || ' moves to Kin Free, as you chose. Everything you added stays.'
             else 'After that ' || f.name || ' moves to Kin Free. Your calendar, lists and chat stay. See what Plus keeps.'
           end as body,
           '/subscribe' as url
    from families f
    join zones z on z.family_id = f.id
    where f.access_status = 'trialing'
      and f.access_expires_at > p_now + interval '1 day'
      and f.access_expires_at <= p_now + interval '3 days'
    union all
    select 'trial:' || f.id || ':lastday',
           f.id,
           case f.chosen_plan
             when 'free' then 'Tomorrow you''re on Kin Free'
             else 'Last day of your Kin Plus trial'
           end,
           case f.chosen_plan
             when 'plus' then 'To keep Plus, subscribe today: ₱149 a month. No automatic payment: do nothing and ' || f.name || ' moves to Kin Free with everything kept.'
             when 'free' then 'Nothing to do: ' || f.name || ' moves to Kin Free tomorrow and keeps everything. No card, no payment.'
             else 'Tomorrow ' || f.name || ' moves to Kin Free. Nothing you added is lost. Plus is ₱149 a month for the whole family.'
           end,
           '/subscribe'
    from families f
    join zones z on z.family_id = f.id
    where f.access_status = 'trialing'
      and f.access_expires_at > p_now
      and f.access_expires_at <= p_now + interval '1 day'
    union all
    select 'trial:' || f.id || ':ended',
           f.id,
           'You''re on Kin Free now',
           case f.chosen_plan
             when 'free' then 'Everything ' || f.name || ' added is still here. Calendar, lists, chat and calls stay free.'
             else 'Everything ' || f.name || ' added is still here. Calendar, lists, chat and calls stay free. Plus is ₱149 a month.'
           end,
           '/subscribe'
    from families f
    join zones z on z.family_id = f.id
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
