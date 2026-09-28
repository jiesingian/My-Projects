-- Planner → Goals, with a reward that somebody else says yes to
-- ==============================================================
--
-- Approved by Jonathan, 28 September (BACKLOG, "Agreed 28 September", item 4).
--
-- A goal is a target with a ring that fills itself from what Kin already
-- knows wherever it can:
--
--   money   a savings goal on Wealth (goals.current_amount) when one is
--           linked, else what is logged against it here
--   water   glasses of water in liquid_intake_log
--   steps   health_vitals 'steps' (Apple Health)
--   weight  health_vitals 'weight', from where it started towards the target
--   gym     sessions ticked here, counted per week (or whatever the period)
--   custom  anything countable, logged here
--
-- The owner is a person or, when owner_member_id is null, the whole household.
--
-- Plans: money, water, gym and custom goals are Kin Free. Steps and weight
-- read vitals, which are Plus (20260928150000_kin_free_and_plus.sql), so a
-- NEW goal of either kind goes through the same require_kin_plus guard as
-- every other Plus area. One already made stays readable after a downgrade.
--
-- THE REWARD, AND WHY IT IS ITS OWN TABLE
-- ---------------------------------------
-- A goal can carry a reward ("a new book when I've read twelve"), set when
-- the goal is made, by the person for themselves or by someone for another
-- member. It counts only once a parent or another adult says yes -- the same
-- idea as routine_log.approval and reward_redemptions, and for the same
-- reason written into the policies rather than the server action: the person
-- the rule is about holds the anon key and a session, and can talk to
-- PostgREST directly (see 20260922053456_rewards_and_redemption.sql).
--
-- Nobody approves their own reward. For a person's goal that means the owner
-- can never answer it; for a household goal, where everyone would receive it,
-- the one who asked for it cannot. A policy cannot restrict individual
-- columns, so were the reward columns on the goal row, whoever may edit the
-- goal could also mark its reward approved. On a table of its own the answer
-- has its own update policy.
--
-- What a goal measures cannot change after it is made: its owner, kind,
-- target, period, starting weight and linked savings goal (a trigger below).
-- Otherwise a goal could be handed to someone else to get round who may
-- approve its reward, or an approved reward's target lowered to one glass.
-- The title, unit and due date stay editable.

-- 1. The goals -----------------------------------------------------------------

create table if not exists public.planner_goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  kind text not null,
  -- Null means the whole household.
  owner_member_id uuid references public.members(id) on delete cascade,
  target numeric not null,
  -- For custom goals: what is being counted ("pages", "km"). The other kinds
  -- carry their own unit.
  unit text,
  -- The window progress is counted over. Weight is always 'total': it is a
  -- distance from where it started, not a sum.
  period text not null default 'total',
  -- Weight: the reading when the goal was made, so the ring can measure the
  -- way from there to the target.
  start_value numeric,
  -- Money: the savings goal on Wealth whose balance fills the ring.
  savings_goal_id uuid references public.goals(id) on delete set null,
  due_date date,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint planner_goals_title_len check (char_length(title) between 1 and 80),
  constraint planner_goals_kind_check check (kind in ('money', 'water', 'steps', 'weight', 'gym', 'custom')),
  constraint planner_goals_period_check check (period in ('day', 'week', 'month', 'total')),
  constraint planner_goals_target_sane check (target > 0 and target <= 1000000000),
  constraint planner_goals_unit_len check (unit is null or char_length(unit) <= 24),
  -- A weight is a person's, never a household's.
  constraint planner_goals_weight_has_owner check (kind <> 'weight' or owner_member_id is not null),
  constraint planner_goals_savings_only_money check (savings_goal_id is null or kind = 'money')
);

create index if not exists planner_goals_family_id_idx on public.planner_goals (family_id);
create index if not exists planner_goals_owner_member_id_idx on public.planner_goals (owner_member_id);
create index if not exists planner_goals_savings_goal_id_idx on public.planner_goals (savings_goal_id);
create index if not exists planner_goals_created_by_idx on public.planner_goals (created_by);

-- 2. What is logged against them (gym sessions, custom counts, money put by) --

create table if not exists public.planner_goal_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  goal_id uuid not null references public.planner_goals(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  entry_date date not null,
  amount numeric not null default 1,
  created_at timestamptz not null default now(),
  constraint planner_goal_entries_amount_sane check (amount > 0 and amount <= 1000000000)
);

create index if not exists planner_goal_entries_goal_date_idx on public.planner_goal_entries (goal_id, entry_date);
create index if not exists planner_goal_entries_family_id_idx on public.planner_goal_entries (family_id);
create index if not exists planner_goal_entries_member_id_idx on public.planner_goal_entries (member_id);

-- 3. The reward, one per goal ---------------------------------------------------

create table if not exists public.planner_goal_rewards (
  goal_id uuid primary key references public.planner_goals(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  status text not null default 'pending',
  proposed_by uuid references public.members(id) on delete set null,
  decided_by uuid references public.members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint planner_goal_rewards_title_len check (char_length(title) between 1 and 120),
  constraint planner_goal_rewards_status_check check (status in ('pending', 'approved', 'refused'))
);

create index if not exists planner_goal_rewards_family_id_idx on public.planner_goal_rewards (family_id);
create index if not exists planner_goal_rewards_proposed_by_idx on public.planner_goal_rewards (proposed_by);
create index if not exists planner_goal_rewards_decided_by_idx on public.planner_goal_rewards (decided_by);
-- The grown-ups' queue on Today.
create index if not exists planner_goal_rewards_pending_idx
  on public.planner_goal_rewards (family_id) where status = 'pending';

-- 4. What a goal measures is fixed ---------------------------------------------
--
-- savings_goal_id may still become null: that is the savings goal on Wealth
-- being deleted (on delete set null), after which the ring counts what is
-- logged here.

create or replace function public.planner_goals_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_member_id is distinct from old.owner_member_id
     or new.kind is distinct from old.kind
     or new.family_id is distinct from old.family_id
     or new.target is distinct from old.target
     or new.period is distinct from old.period
     or new.start_value is distinct from old.start_value
     or (new.savings_goal_id is distinct from old.savings_goal_id and new.savings_goal_id is not null) then
    raise exception 'A goal keeps what it measures. Make a new goal instead.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goals_fixed() from public, anon, authenticated;

drop trigger if exists planner_goals_fixed on public.planner_goals;
create trigger planner_goals_fixed
  before update on public.planner_goals
  for each row execute function public.planner_goals_fixed();

-- 5. Health goals are Plus ------------------------------------------------------

drop trigger if exists require_kin_plus on public.planner_goals;
create trigger require_kin_plus
  before insert on public.planner_goals
  for each row
  when (new.kind in ('steps', 'weight'))
  execute function public.require_kin_plus('Health goals');

-- 6. Row-level security ---------------------------------------------------------
--
-- The household helpers each call auth.uid(); wrapped in a select they are
-- evaluated once per statement rather than once per row.

alter table public.planner_goals enable row level security;
alter table public.planner_goal_entries enable row level security;
alter table public.planner_goal_rewards enable row level security;

drop policy if exists planner_goals_select on public.planner_goals;
create policy planner_goals_select on public.planner_goals
  for select to authenticated
  using (family_id = (select public.current_family_id()));

-- Anyone in the house may set a goal, for themselves, for someone else or for
-- everyone -- but only naming people and savings goals of this household.
drop policy if exists planner_goals_insert on public.planner_goals;
create policy planner_goals_insert on public.planner_goals
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and (owner_member_id is null or exists (
      select 1 from public.members m
      where m.id = owner_member_id and m.family_id = (select public.current_family_id())
    ))
    and (savings_goal_id is null or exists (
      select 1 from public.goals g
      where g.id = savings_goal_id and g.family_id = (select public.current_family_id())
    ))
  );

drop policy if exists planner_goals_update on public.planner_goals;
create policy planner_goals_update on public.planner_goals
  for update to authenticated
  using (family_id = (select public.current_family_id()))
  with check (
    family_id = (select public.current_family_id())
    and (savings_goal_id is null or exists (
      select 1 from public.goals g
      where g.id = savings_goal_id and g.family_id = (select public.current_family_id())
    ))
  );

drop policy if exists planner_goals_delete on public.planner_goals;
create policy planner_goals_delete on public.planner_goals
  for delete to authenticated
  using (family_id = (select public.current_family_id()));

drop policy if exists planner_goal_entries_select on public.planner_goal_entries;
create policy planner_goal_entries_select on public.planner_goal_entries
  for select to authenticated
  using (family_id = (select public.current_family_id()));

drop policy if exists planner_goal_entries_insert on public.planner_goal_entries;
create policy planner_goal_entries_insert on public.planner_goal_entries
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and exists (
      select 1 from public.planner_goals g
      where g.id = goal_id and g.family_id = (select public.current_family_id())
    )
    and (member_id is null or exists (
      select 1 from public.members m
      where m.id = member_id and m.family_id = (select public.current_family_id())
    ))
  );

drop policy if exists planner_goal_entries_delete on public.planner_goal_entries;
create policy planner_goal_entries_delete on public.planner_goal_entries
  for delete to authenticated
  using (family_id = (select public.current_family_id()));

drop policy if exists planner_goal_rewards_select on public.planner_goal_rewards;
create policy planner_goal_rewards_select on public.planner_goal_rewards
  for select to authenticated
  using (family_id = (select public.current_family_id()));

-- Asking: only a pending reward, only in your own name, only on a goal of
-- this household. Nobody can write a reward that starts out approved.
drop policy if exists planner_goal_rewards_insert on public.planner_goal_rewards;
create policy planner_goal_rewards_insert on public.planner_goal_rewards
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and proposed_by = (select public.current_member_id())
    and exists (
      select 1 from public.planner_goals g
      where g.id = goal_id and g.family_id = (select public.current_family_id())
    )
  );

-- Answering: a parent or an adult, never the person the reward is for, and
-- on a household goal never the one who asked. Both the row as it was
-- (using) and as it becomes (with check) must pass, so an answer cannot be
-- smuggled onto a reward its writer could not have answered.
drop policy if exists planner_goal_rewards_update on public.planner_goal_rewards;
create policy planner_goal_rewards_update on public.planner_goal_rewards
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (
      select 1 from public.planner_goals g
      where g.id = goal_id
        and g.family_id = (select public.current_family_id())
        and (
          (g.owner_member_id is not null and g.owner_member_id <> (select public.current_member_id()))
          or (g.owner_member_id is null and proposed_by is distinct from (select public.current_member_id()))
        )
    )
  )
  with check (
    family_id = (select public.current_family_id())
    and status in ('approved', 'refused')
    and decided_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (
      select 1 from public.planner_goals g
      where g.id = goal_id
        and g.family_id = (select public.current_family_id())
        and (
          (g.owner_member_id is not null and g.owner_member_id <> (select public.current_member_id()))
          or (g.owner_member_id is null and proposed_by is distinct from (select public.current_member_id()))
        )
    )
  );

-- Taking a reward back: whoever asked, while it is still waiting, or a
-- grown-up. A new one starts pending again, so deleting and re-adding never
-- gets round the answer.
drop policy if exists planner_goal_rewards_delete on public.planner_goal_rewards;
create policy planner_goal_rewards_delete on public.planner_goal_rewards
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (
      (status = 'pending' and proposed_by = (select public.current_member_id()))
      or (select public.current_member_role()) in ('parent', 'adult')
    )
  );
