-- Goals follow their owner to a new household again
-- ================================================
--
-- 20260928214500_start_own_household.sql taught planner_goals_fixed() one
-- exception: a goal may follow its owner to a new household, while
-- members_bring_personal_space() names that person in kin.moving_person.
-- That move also changes the family_id of each moving goal's reward.
--
-- 20260928220500_goal_reward_giver.sql was written before that file and ran
-- after it (#314 renamed it so the pipeline would take it). It redefined
-- planner_goals_fixed() without the exception, and its new
-- planner_goal_rewards_fixed() forbids a reward changing household at all.
-- Since it ran, anyone with a personal Planner goal who starts their own
-- household has the move refused. No goal existed in production when this
-- was written, so nobody has hit it yet.
--
-- This puts back the move exception, word for word, beside the giver rules,
-- and lets a reward follow its goal during that same move and at no other
-- time. It also stops decide_goal_change() from applying a change to a goal
-- that has since moved to another household.
--
-- Only functions are replaced, with create or replace, so the file is
-- idempotent and touches no rows.

create or replace function public.planner_goal_rewards_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Following its goal to the owner's new household
  -- (members_bring_personal_space, 20260928214500): the household may change,
  -- nothing else about the promise may.
  if new.family_id is distinct from old.family_id
     and coalesce(current_setting('kin.moving_person', true), '') <> ''
     and new.goal_id is not distinct from old.goal_id
     and new.proposed_by is not distinct from old.proposed_by
     and new.giver_member_id is not distinct from old.giver_member_id then
    return new;
  end if;
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

create or replace function public.planner_goals_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_moving text := coalesce(current_setting('kin.moving_person', true), '');
  v_giver uuid;
begin
  -- Its owner moving household (20260928214500_start_own_household.sql, kept
  -- as it was): allowed only while members_bring_personal_space() names that
  -- person, only to another membership of the same person, and only when
  -- nothing the goal measures changes.
  if v_moving <> ''
     and old.owner_member_id is not null and new.owner_member_id is not null
     and (select person_id from members where id = old.owner_member_id)::text = v_moving
     and (select person_id from members where id = new.owner_member_id)::text = v_moving
     and new.kind is not distinct from old.kind
     and new.target is not distinct from old.target
     and new.period is not distinct from old.period
     and new.due_date is not distinct from old.due_date
     and new.start_value is not distinct from old.start_value
     and (new.savings_goal_id is null or new.savings_goal_id is not distinct from old.savings_goal_id) then
    return new;
  end if;

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

revoke execute on function public.planner_goals_fixed() from public, anon, authenticated;

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
  -- A goal that has since moved household with its owner is answered there.
  if not exists (select 1 from public.planner_goals g where g.id = c.goal_id and g.family_id = v_family) then
    raise exception 'That goal is no longer in this household.' using errcode = 'P0002';
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
