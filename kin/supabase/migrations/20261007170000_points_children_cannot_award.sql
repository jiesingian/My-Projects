-- Points: a child cannot award them to themselves
-- ================================================
--
-- A balance is never stored -- it is summed from routine_log (chores done
-- and counted), the streak bonuses those earn, and reward_redemptions. So
-- "a child cannot change their own balance" means a child cannot write any
-- of the rows it is summed from in a way that adds points.
--
-- 20260922053456 stopped a child writing 'approved'. Two holes were left,
-- both reachable with the public anon key and a child's own session:
--
--   * routine_log: 'not_required' also counts (it is what an adult's tick
--     says), and the update policy lets a child write it. So a child could
--     tick a chore 'done' with approval 'not_required' -- on insert or on
--     update -- and it counted without anybody saying yes.
--   * routines.points: what a chore is worth. A child could raise it on a
--     chore already approved, and every past tick would be worth more.
--
-- Triggers rather than policies, because the rule is about what a column
-- may become, and a trigger can quietly correct a child's tick to
-- 'pending' -- which is exactly what the app writes for them anyway --
-- instead of refusing it and losing the tick.
--
-- Only a signed-in child is touched: current_member_role() is null for the
-- migration runner and scheduled jobs, which keep doing what they did.

create or replace function public.routine_log_child_tick_waits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.current_member_role();
begin
  if r is null or r in ('parent', 'adult') then
    return new;
  end if;
  -- A child's 'done' always waits for a grown-up. Anything else they write
  -- (skipped, undone) earns nothing, so it can say what it likes.
  if new.status = 'done' then
    new.approval := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.routine_log_child_tick_waits() from public, anon;

drop trigger if exists routine_log_child_tick_waits on public.routine_log;
create trigger routine_log_child_tick_waits
  before insert or update on public.routine_log
  for each row execute function public.routine_log_child_tick_waits();

create or replace function public.routines_points_grown_ups_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.current_member_role();
begin
  if r is null or r in ('parent', 'adult') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.points is distinct from old.points then
    raise exception 'Only a parent or another adult can change what a chore is worth.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.routines_points_grown_ups_only() from public, anon;

drop trigger if exists routines_points_grown_ups_only on public.routines;
create trigger routines_points_grown_ups_only
  before update on public.routines
  for each row execute function public.routines_points_grown_ups_only();

-- A request carries no answer when a child writes it. The insert policy
-- already makes it 'pending'; this stops it arriving with a forged
-- decided_by that the history would then show as somebody's yes.
create or replace function public.reward_redemptions_child_request_unanswered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.current_member_role();
begin
  if r is null or r in ('parent', 'adult') then
    return new;
  end if;
  new.decided_by := null;
  new.decided_at := null;
  return new;
end;
$$;

revoke all on function public.reward_redemptions_child_request_unanswered() from public, anon;

drop trigger if exists reward_redemptions_child_request_unanswered on public.reward_redemptions;
create trigger reward_redemptions_child_request_unanswered
  before insert on public.reward_redemptions
  for each row execute function public.reward_redemptions_child_request_unanswered();
