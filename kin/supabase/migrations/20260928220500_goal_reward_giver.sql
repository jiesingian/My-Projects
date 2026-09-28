-- Goal rewards: the one who gives it is the one who says yes
-- ==========================================================
--
-- Jonathan, 28 September, on 20260928180000_planner_goals.sql: "the approver
-- depends on who is going to give the reward". A reward is a promise --
-- money, a treat, a hug, a massage -- and the only person who can agree to
-- it is the one who will keep it. That can be a parent, another adult, or a
-- child promising a parent something. So:
--
--  * A reward names its GIVER (giver_member_id). Anyone in the household may
--    be one, child or grown-up, except the person the goal belongs to:
--    nobody gives themselves a reward, so nobody approves their own.
--  * Asking: whoever sets the reward asks the giver. It waits, pending, until
--    the giver answers. The giver may reword it as they say yes ("₱300, not
--    ₱500") -- that is them setting what they commit to.
--  * Offering: when the one setting the reward IS the giver ("if you read
--    twelve books, I'll take you to the bookshop") there is nobody left to
--    ask, so it starts out promised.
--  * Once the goal is reached, the giver marks it given.
--
-- Changing a goal is part of the same bargain. With a reward waiting or
-- promised, what the goal measures -- target, period, due date, the starting
-- weight, the savings goal it reads -- changes only with the giver's yes: a
-- change is written as a request (planner_goal_changes) and the giver
-- approves or refuses it through decide_goal_change(). The giver's own edit
-- applies at once, since they are the one committed. A goal with no reward
-- in play has nobody's promise to protect and edits directly. The owner and
-- kind of a goal stay fixed for good, as before.
--
-- The tables were created earlier today and hold no rows in either database
-- (checked in production before writing this), so the new column needs no
-- back-fill; it is required of every new reward by the insert policy.

-- 1. Who gives it -------------------------------------------------------------

alter table public.planner_goal_rewards
  add column if not exists giver_member_id uuid references public.members(id) on delete cascade,
  add column if not exists given_at timestamptz;

create index if not exists planner_goal_rewards_giver_idx on public.planner_goal_rewards (giver_member_id);

alter table public.planner_goal_rewards drop constraint if exists planner_goal_rewards_status_check;
alter table public.planner_goal_rewards
  add constraint planner_goal_rewards_status_check check (status in ('pending', 'approved', 'refused', 'given'));

-- A reward's goal, asker and giver never change after it is written; a
-- different promise is a different reward (delete, add again, pending again).
create or replace function public.planner_goal_rewards_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.goal_id is distinct from old.goal_id
     or new.family_id is distinct from old.family_id
     or new.proposed_by is distinct from old.proposed_by
     or new.giver_member_id is distinct from old.giver_member_id then
    raise exception 'A reward keeps its goal, who asked and who gives it. Take it back and ask again.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goal_rewards_fixed() from public, anon, authenticated;

drop trigger if exists planner_goal_rewards_fixed on public.planner_goal_rewards;
create trigger planner_goal_rewards_fixed
  before update on public.planner_goal_rewards
  for each row execute function public.planner_goal_rewards_fixed();

-- 2. The policies, rewritten around the giver ----------------------------------

-- Asking or offering. The giver is someone in this household other than the
-- goal's owner. It starts pending -- or promised, when the one writing it is
-- the giver.
drop policy if exists planner_goal_rewards_insert on public.planner_goal_rewards;
create policy planner_goal_rewards_insert on public.planner_goal_rewards
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and proposed_by = (select public.current_member_id())
    and giver_member_id is not null
    and exists (
      select 1 from public.members m
      where m.id = giver_member_id and m.family_id = (select public.current_family_id())
    )
    and exists (
      select 1 from public.planner_goals g
      where g.id = goal_id
        and g.family_id = (select public.current_family_id())
        and g.owner_member_id is distinct from giver_member_id
    )
    and given_at is null
    and (
      (status = 'pending' and decided_by is null and decided_at is null)
      or (status = 'approved' and giver_member_id = (select public.current_member_id()) and decided_by = giver_member_id)
    )
  );

-- Answering, rewording, marking given: the giver, and only the giver.
drop policy if exists planner_goal_rewards_update on public.planner_goal_rewards;
create policy planner_goal_rewards_update on public.planner_goal_rewards
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and giver_member_id = (select public.current_member_id())
  )
  with check (
    family_id = (select public.current_family_id())
    and giver_member_id = (select public.current_member_id())
    and status in ('approved', 'refused', 'given')
    and decided_by = (select public.current_member_id())
  );

-- Taking it back: whoever asked, while it waits; the giver, any time (a
-- promise withdrawn is visible to the family by its absence, and the asker
-- can ask again); or the goal's owner, who may simply not want it.
drop policy if exists planner_goal_rewards_delete on public.planner_goal_rewards;
create policy planner_goal_rewards_delete on public.planner_goal_rewards
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (
      (status = 'pending' and proposed_by = (select public.current_member_id()))
      or giver_member_id = (select public.current_member_id())
      or exists (
        select 1 from public.planner_goals g
        where g.id = goal_id and g.owner_member_id = (select public.current_member_id())
      )
    )
  );

-- 3. Asking to change a goal ----------------------------------------------------

create table if not exists public.planner_goal_changes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  goal_id uuid not null references public.planner_goals(id) on delete cascade,
  proposed_by uuid references public.members(id) on delete set null,
  -- Null means "leave as it is". due_date has its own flag because null is
  -- also a real answer there ("no deadline").
  title text,
  target numeric,
  period text,
  unit text,
  due_date date,
  change_due_date boolean not null default false,
  status text not null default 'pending',
  decided_by uuid references public.members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint planner_goal_changes_status_check check (status in ('pending', 'approved', 'refused')),
  constraint planner_goal_changes_title_len check (title is null or char_length(title) between 1 and 80),
  constraint planner_goal_changes_target_sane check (target is null or (target > 0 and target <= 1000000000)),
  constraint planner_goal_changes_period_check check (period is null or period in ('day', 'week', 'month', 'total')),
  constraint planner_goal_changes_unit_len check (unit is null or char_length(unit) <= 24)
);

create index if not exists planner_goal_changes_goal_id_idx on public.planner_goal_changes (goal_id);
create index if not exists planner_goal_changes_family_id_idx on public.planner_goal_changes (family_id);
create index if not exists planner_goal_changes_proposed_by_idx on public.planner_goal_changes (proposed_by);
create index if not exists planner_goal_changes_decided_by_idx on public.planner_goal_changes (decided_by);
create index if not exists planner_goal_changes_pending_idx
  on public.planner_goal_changes (family_id) where status = 'pending';

alter table public.planner_goal_changes enable row level security;

drop policy if exists planner_goal_changes_select on public.planner_goal_changes;
create policy planner_goal_changes_select on public.planner_goal_changes
  for select to authenticated
  using (family_id = (select public.current_family_id()));

drop policy if exists planner_goal_changes_insert on public.planner_goal_changes;
create policy planner_goal_changes_insert on public.planner_goal_changes
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and proposed_by = (select public.current_member_id())
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and exists (
      select 1 from public.planner_goals g
      where g.id = goal_id and g.family_id = (select public.current_family_id())
    )
  );

-- No update policy: an answer goes through decide_goal_change() below, which
-- is also what applies it. Withdrawing a request is the asker's.
drop policy if exists planner_goal_changes_delete on public.planner_goal_changes;
create policy planner_goal_changes_delete on public.planner_goal_changes
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and status = 'pending'
    and proposed_by = (select public.current_member_id())
  );

-- 4. What a goal measures, and who may move it ----------------------------------
--
-- Owner, kind and household: never. Target, period, due date, starting
-- weight and the savings goal it reads: freely while no reward is waiting or
-- promised; otherwise only by the giver, or through decide_goal_change().
-- A savings goal deleted on Wealth still clears its link (on delete set
-- null), whatever else is true.

create or replace function public.planner_goals_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_giver uuid;
begin
  if new.owner_member_id is distinct from old.owner_member_id
     or new.kind is distinct from old.kind
     or new.family_id is distinct from old.family_id then
    raise exception 'A goal keeps its owner and its kind. Make a new goal instead.'
      using errcode = 'P0001';
  end if;

  if new.target is distinct from old.target
     or new.period is distinct from old.period
     or new.due_date is distinct from old.due_date
     or new.start_value is distinct from old.start_value
     or (new.savings_goal_id is distinct from old.savings_goal_id and new.savings_goal_id is not null) then
    if coalesce(current_setting('kin.goal_change', true), 'off') = 'on' then
      return new;
    end if;
    select r.giver_member_id into v_giver
    from public.planner_goal_rewards r
    where r.goal_id = new.id and r.status in ('pending', 'approved');
    if found and v_giver is distinct from public.current_member_id() then
      raise exception 'goal_change_needs_giver: this goal has a reward, so changing it needs a yes from whoever gives the reward.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- 5. The giver's answer on a change -------------------------------------------

create or replace function public.decide_goal_change(p_change uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_member_id();
  v_family uuid := public.current_family_id();
  c public.planner_goal_changes%rowtype;
  v_giver uuid;
begin
  if v_me is null or v_family is null then
    raise exception 'not a member of a household' using errcode = '42501';
  end if;

  select * into c from public.planner_goal_changes
  where id = p_change and family_id = v_family
  for update;
  if not found then
    raise exception 'That change is no longer here.' using errcode = 'P0002';
  end if;
  if c.status <> 'pending' then
    raise exception 'That change has already been answered.' using errcode = 'P0001';
  end if;

  -- Whose yes it needs: the giver of a reward still waiting or promised.
  -- With none in play, the goal is nobody's promise and anyone in the
  -- household may answer.
  select r.giver_member_id into v_giver
  from public.planner_goal_rewards r
  where r.goal_id = c.goal_id and r.status in ('pending', 'approved');
  if found and v_giver is distinct from v_me then
    raise exception 'Only whoever gives the reward can answer this.' using errcode = '42501';
  end if;

  if p_approve then
    perform set_config('kin.goal_change', 'on', true);
    update public.planner_goals g set
      title = coalesce(c.title, g.title),
      target = coalesce(c.target, g.target),
      -- Weight is always measured over its whole course.
      period = case when g.kind = 'weight' then g.period else coalesce(c.period, g.period) end,
      unit = coalesce(c.unit, g.unit),
      due_date = case when c.change_due_date then c.due_date else g.due_date end
    where g.id = c.goal_id and g.family_id = v_family;
    perform set_config('kin.goal_change', 'off', true);
  end if;

  update public.planner_goal_changes
  set status = case when p_approve then 'approved' else 'refused' end,
      decided_by = v_me,
      decided_at = now()
  where id = c.id;
end;
$$;

revoke execute on function public.decide_goal_change(uuid, boolean) from public, anon;
grant execute on function public.decide_goal_change(uuid, boolean) to authenticated;
