-- Renewable goals earn points (Jonathan, 13 October)
-- ==================================================
--
-- A daily, weekly or monthly goal -- eight glasses, 10,000 steps, three gym
-- sessions -- starts again each period. Until now nothing remembered a
-- period met. Now a goal can be worth points each time, and the owner
-- claims a period once its ring is full. The points land in the same
-- balance chores feed (summed, never stored: queries/routines loadPoints)
-- and are spent on the same Rewards panel.
--
-- The same trust as chores, for the same reason (20260922053456): a child
-- holds the anon key and their own session, so the rule lives here.
--
--   * What a goal is worth is a grown-up's to set (planner_goals.points),
--     on a personal, repeating goal only -- a household goal has nobody to
--     pay, and a one-off goal already has its reward.
--   * A claim is the owner's own, for a goal they can see. A grown-up's
--     counts at once; a child's waits for a grown-up's yes, on Today, like
--     a chore -- the trigger sets that, whatever the client sent.
--   * What a claim is worth is copied from the goal when it is made, so a
--     grown-up changing the points later never rewrites what was earned
--     (the redemptions rule).
--   * Answering is a grown-up's, never one's own claim, and only once.
--   * The app checks the ring is full before it offers the claim. For a
--     child the grown-up's yes is the check, as it is for a chore ticked
--     done; a grown-up is trusted with their own, as with their own chores.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.planner_goals add column if not exists points integer not null default 0;

alter table public.planner_goals drop constraint if exists planner_goals_points_check;
alter table public.planner_goals
  add constraint planner_goals_points_check check (
    points between 0 and 1000
    and (points = 0 or (period <> 'total' and owner_member_id is not null))
  );

-- 1. What a goal is worth is a grown-up's to set ----------------------------

create or replace function public.planner_goals_points_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.points = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.points is not distinct from old.points then
    return new;
  end if;
  if coalesce(public.current_member_role(), '') not in ('parent', 'adult') then
    raise exception 'What a goal is worth in points is a grown-up''s to set.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goals_points_guard() from public, anon, authenticated;

drop trigger if exists planner_goals_points_guard on public.planner_goals;
create trigger planner_goals_points_guard
  before insert or update on public.planner_goals
  for each row execute function public.planner_goals_points_guard();

-- 2. A period met ------------------------------------------------------------

create table if not exists public.planner_goal_completions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  goal_id uuid not null references public.planner_goals(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  -- The first day of the period met: the day itself, the week's first day,
  -- or the 1st of the month (lib/goals windowStart).
  period_start date not null,
  points integer not null default 0,
  status text not null default 'counted',
  decided_by uuid references public.members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint planner_goal_completions_once unique (goal_id, period_start),
  constraint planner_goal_completions_status_check check (status in ('counted', 'pending', 'refused')),
  constraint planner_goal_completions_points_check check (points between 0 and 1000)
);

create index if not exists planner_goal_completions_family_id_idx on public.planner_goal_completions (family_id);
create index if not exists planner_goal_completions_member_id_idx on public.planner_goal_completions (member_id);
create index if not exists planner_goal_completions_decided_by_idx on public.planner_goal_completions (decided_by);
create index if not exists planner_goal_completions_pending_idx
  on public.planner_goal_completions (family_id) where status = 'pending';

-- What the claim is worth and whether it waits are set here, from the goal
-- and the claimant -- never from what the client sent. On an answer, only
-- the answer may change.
create or replace function public.planner_goal_completions_fix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_points integer;
begin
  if tg_op = 'INSERT' then
    select g.points into v_points from public.planner_goals g where g.id = new.goal_id;
    new.points := coalesce(v_points, 0);
    new.status := case when coalesce(public.current_member_role(), '') in ('parent', 'adult') then 'counted' else 'pending' end;
    new.decided_by := null;
    new.decided_at := null;
    new.created_at := now();
    return new;
  end if;
  if new.goal_id is distinct from old.goal_id
     or new.member_id is distinct from old.member_id
     or new.family_id is distinct from old.family_id
     or new.period_start is distinct from old.period_start
     or new.points is distinct from old.points
     or new.created_at is distinct from old.created_at then
    raise exception 'A claim keeps what it was for.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goal_completions_fix() from public, anon, authenticated;

drop trigger if exists planner_goal_completions_fix on public.planner_goal_completions;
create trigger planner_goal_completions_fix
  before insert or update on public.planner_goal_completions
  for each row execute function public.planner_goal_completions_fix();

alter table public.planner_goal_completions enable row level security;

drop policy if exists planner_goal_completions_select on public.planner_goal_completions;
create policy planner_goal_completions_select on public.planner_goal_completions
  for select to authenticated
  using (family_id = (select public.current_family_id()) and public.planner_goal_visible(goal_id));

-- Claiming: the owner, on their own repeating goal they can see, for a
-- period that is this one or a recent one -- not a year of back-claims.
drop policy if exists planner_goal_completions_insert on public.planner_goal_completions;
create policy planner_goal_completions_insert on public.planner_goal_completions
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
    and period_start between current_date - 62 and current_date + 1
    and exists (
      select 1 from public.planner_goals g
      where g.id = goal_id
        and g.family_id = (select public.current_family_id())
        and g.owner_member_id = (select public.current_member_id())
        and g.period <> 'total'
    )
  );

-- Answering: a grown-up, never on their own claim, only while it waits.
drop policy if exists planner_goal_completions_update on public.planner_goal_completions;
create policy planner_goal_completions_update on public.planner_goal_completions
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and status = 'pending'
    and member_id <> (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  )
  with check (
    family_id = (select public.current_family_id())
    and status in ('counted', 'refused')
    and decided_by = (select public.current_member_id())
    and member_id <> (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

-- Taking a claim back: its own claimant (a tap too early). A refused one
-- stays, so refusing cannot be undone by deleting and claiming again.
drop policy if exists planner_goal_completions_delete on public.planner_goal_completions;
create policy planner_goal_completions_delete on public.planner_goal_completions
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
    and status <> 'refused'
  );
