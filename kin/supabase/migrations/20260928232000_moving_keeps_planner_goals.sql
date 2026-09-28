-- Moving household keeps your own Planner goals (fix, 28 September).
--
-- 20260928214500_start_own_household.sql let a person's own Planner goals
-- follow them to a new household: planner_goals_fixed() refuses any change of
-- owner or household, with one exception -- the same person, while
-- members_bring_personal_space() names them in kin.moving_person.
--
-- 20260928220500_goal_reward_giver.sql (#311, written alongside) replaced
-- planner_goals_fixed() with its own version and added
-- planner_goal_rewards_fixed(), which also freezes a reward's household. #314
-- then ordered it after start_own_household, so it ran second and the
-- exception was gone: starting your own household, or an approved move,
-- failed with "A goal keeps its owner and its kind" for anyone who had a
-- Planner goal of their own. This puts the exception back into #311's
-- functions, unchanged otherwise, and lets a goal's rewards and pending
-- change requests follow it. Nothing else about either rule changes.
--
-- No data changes. Every function here is re-created whole.

create or replace function public.planner_goals_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_giver uuid;
  v_moving text := coalesce(current_setting('kin.moving_person', true), '');
begin
  -- The one change allowed to owner and household: the same person moving,
  -- named by members_bring_personal_space(). Nothing else about the goal
  -- may change in the same update, except dropping a savings goal that
  -- stayed behind.
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

create or replace function public.planner_goal_rewards_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_moving text := coalesce(current_setting('kin.moving_person', true), '');
begin
  -- Mid-move, the household (and only that) follows the goal's owner.
  if v_moving <> ''
     and new.family_id is distinct from old.family_id
     and new.goal_id is not distinct from old.goal_id
     and new.proposed_by is not distinct from old.proposed_by
     and new.giver_member_id is not distinct from old.giver_member_id
     and (select m.person_id from planner_goals pg join members m on m.id = pg.owner_member_id where pg.id = new.goal_id)::text = v_moving then
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

revoke execute on function public.planner_goal_rewards_fixed() from public, anon, authenticated;

create or replace function public.members_bring_personal_space()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from uuid;
begin
  if new.status <> 'active' or new.auth_user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  update public.journal_entries
     set family_id = new.family_id
   where owner_person_id = new.person_id and visibility = 'personal' and family_id <> new.family_id;

  update public.journal_media
     set family_id = new.family_id
   where owner_person_id = new.person_id and visibility = 'personal' and family_id <> new.family_id;

  -- A personal goal's saved total stays as it was. Its ledger lines are the
  -- old household's money and stay there; the account it drew from is theirs
  -- too, so the link to it is dropped.
  update public.goals
     set family_id = new.family_id, owner_member_id = new.id, linked_account_id = null
   where owner_person_id = new.person_id and not is_joint and family_id <> new.family_id;

  -- Their own Planner goals (water, steps, weight, gym, custom, money --
  -- 20260928180000_planner_goals.sql), with what was logged against them and
  -- its rewards and change requests. A household goal (no owner) stays.
  -- planner_goals_fixed() and planner_goal_rewards_fixed() refuse a change of
  -- owner or household, except for this: the same person, moved by this
  -- function, named in kin.moving_person for exactly these four updates. A
  -- money goal's link to a savings goal is kept only if that savings goal
  -- came along too.
  perform set_config('kin.moving_person', new.person_id::text, true);
  update public.planner_goals g
     set family_id = new.family_id,
         owner_member_id = new.id,
         savings_goal_id = case
           when exists (select 1 from public.goals s where s.id = g.savings_goal_id and s.family_id = new.family_id)
           then g.savings_goal_id end
   where g.family_id <> new.family_id
     and g.owner_member_id in (select m.id from public.members m where m.person_id = new.person_id and m.id <> new.id);

  update public.planner_goal_entries e
     set family_id = new.family_id
    from public.planner_goals g
   where g.id = e.goal_id and g.owner_member_id = new.id and e.family_id <> new.family_id;

  -- A reward keeps its giver and its status (planner_goal_rewards_fixed()
  -- allows only the household to change, and only mid-move). A giver who
  -- stays in the old household can no longer see it from there: an open
  -- question for the goals work, written up in kin/docs/PERSONAL_SPACE.md.
  update public.planner_goal_rewards r
     set family_id = new.family_id
    from public.planner_goals g
   where g.id = r.goal_id and g.owner_member_id = new.id and r.family_id <> new.family_id;

  update public.planner_goal_changes c
     set family_id = new.family_id
    from public.planner_goals g
   where g.id = c.goal_id and g.owner_member_id = new.id and c.family_id <> new.family_id;
  perform set_config('kin.moving_person', '', true);

  -- Their photo album. Files in the avatars bucket are publicly readable, so
  -- the same path works from the new household. Drive-held photos belong to
  -- the old household's Drive and are left there.
  insert into public.member_avatars (member_id, family_id, storage_path, created_at)
  select new.id, new.family_id, a.storage_path, a.created_at
    from public.member_avatars a
    join public.members m on m.id = a.member_id
   where m.person_id = new.person_id and m.id <> new.id and a.storage_path is not null
     and not exists (
       select 1 from public.member_avatars x where x.member_id = new.id and x.storage_path = a.storage_path
     );

  -- An approved move into someone else's household: ask the household they
  -- came from to link, unless the two already are (or are being asked).
  if tg_op = 'UPDATE' and old.status = 'pending' then
    select m.family_id into v_from
      from public.members m
     where m.person_id = new.person_id and m.status = 'moved' and m.family_id <> new.family_id
     order by m.moved_at desc nulls last
     limit 1;
    if v_from is not null and not exists (
      select 1 from public.family_links l
       where l.status in ('pending', 'accepted')
         and ((l.requester_family_id = v_from and l.addressee_family_id = new.family_id)
           or (l.requester_family_id = new.family_id and l.addressee_family_id = v_from))
    ) then
      insert into public.family_links (requester_family_id, addressee_family_id, requested_by)
      values (new.family_id, v_from, new.id);
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.members_bring_personal_space() from public, anon, authenticated;
