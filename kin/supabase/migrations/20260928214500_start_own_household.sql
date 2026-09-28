-- A person owns their account; a household links them. Step 2 of 3: moving.
-- (Approved by Jonathan, 28 September; design in kin/docs/PERSONAL_SPACE.md.)
--
-- A married son or daughter starts their own household and takes their
-- personal space with them; the parents' household keeps its shared history,
-- and the two households are linked so the family feed and the tree still
-- reach each other. Someone can also move into another household with its
-- invite code (a wife joining her husband's), and a removed member -- until
-- now at a dead end, since create_family and join_family refuse anyone with a
-- member row -- can do either.
--
-- The pieces:
--   * members.status 'moved': the membership left behind. Its login is
--     cleared (the account now signs in to the new one), its name stays so
--     the old household's history still says who wrote what, and nobody can
--     edit it (members_update_by_organiser does not allow 'moved').
--   * members_bring_personal_space(): whenever a membership becomes active,
--     the person's personal rows (personal journal entries and photos,
--     personal savings goals, their own Planner goals) are re-homed to that household, and their photo album
--     comes along. One trigger, so starting a household, an approved join
--     and a reinstatement all behave the same.
--   * start_own_household(name): a new household with the caller as its
--     organizer, profile copied, linked to the old household (accepted -- the
--     mover was a grown-up there) with the tree person matched across.
--   * move_to_household(code): a pending membership in another household,
--     profile copied. On approval the personal space follows (the trigger
--     above) and a link request goes to the old household, which answers it
--     as any other.
--
-- Household records are never moved, copied or deleted by any of this.

-- 1. The status ---------------------------------------------------------------

alter table public.members drop constraint if exists members_status_check;
alter table public.members
  add constraint members_status_check
  check (status in ('active', 'invited', 'managed', 'pending', 'removed', 'moved'));

alter table public.members add column if not exists moved_at timestamptz;

comment on column public.members.moved_at is
  'When this person left this membership for another household (start_own_household / move_to_household). Null otherwise.';

-- A membership someone moved out of is history. The organizer could otherwise
-- set it back to 'active' (the check only looks at the new status) and leave a
-- second, login-less copy of that person in the household.
drop policy if exists members_update_by_organiser on public.members;
create policy members_update_by_organiser on public.members
  for update using (
    family_id = current_family_id() and current_member_is_organiser() and status <> 'moved'
  ) with check (
    status = any (array['active', 'pending', 'managed', 'removed'])
    and family_id = current_family_id()
    and current_member_is_organiser()
  );

-- 2. Personal space follows the active membership ------------------------------

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
  -- any reward. A household goal (no owner) stays. planner_goals_fixed()
  -- refuses a change of owner or household, except for this: the same person,
  -- moved by this function, named in kin.moving_person. A reward still
  -- waiting for a yes is now answered by the new household's grown-ups; one
  -- already answered stays answered. A money goal's link to a savings goal is
  -- kept only if that savings goal came along too.
  perform set_config('kin.moving_person', new.person_id::text, true);
  update public.planner_goals g
     set family_id = new.family_id,
         owner_member_id = new.id,
         savings_goal_id = case
           when exists (select 1 from public.goals s where s.id = g.savings_goal_id and s.family_id = new.family_id)
           then g.savings_goal_id end
   where g.family_id <> new.family_id
     and g.owner_member_id in (select m.id from public.members m where m.person_id = new.person_id and m.id <> new.id);
  perform set_config('kin.moving_person', '', true);

  update public.planner_goal_entries e
     set family_id = new.family_id
    from public.planner_goals g
   where g.id = e.goal_id and g.owner_member_id = new.id and e.family_id <> new.family_id;

  update public.planner_goal_rewards r
     set family_id = new.family_id
    from public.planner_goals g
   where g.id = r.goal_id and g.owner_member_id = new.id and r.family_id <> new.family_id;

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

drop trigger if exists members_bring_personal_space on public.members;
create trigger members_bring_personal_space
  after insert or update of status on public.members
  for each row execute function public.members_bring_personal_space();

-- A Planner goal keeps what it measures, owner and household included
-- (20260928180000_planner_goals.sql) -- with one exception: its owner moving
-- household. Allowed only while members_bring_personal_space() names that
-- person, and only to another membership of the same person, so it cannot be
-- used to hand a goal to somebody else.
create or replace function public.planner_goals_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_moving text := coalesce(current_setting('kin.moving_person', true), '');
begin
  if v_moving <> ''
     and old.owner_member_id is not null and new.owner_member_id is not null
     and (select person_id from members where id = old.owner_member_id)::text = v_moving
     and (select person_id from members where id = new.owner_member_id)::text = v_moving
     and new.kind is not distinct from old.kind
     and new.target is not distinct from old.target
     and new.period is not distinct from old.period
     and new.start_value is not distinct from old.start_value
     and (new.savings_goal_id is null or new.savings_goal_id is not distinct from old.savings_goal_id) then
    return new;
  end if;
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

-- 3. Leaving a membership for a new one (internal) -----------------------------

-- The checks both ways of moving share, and the leaving itself. Returns the
-- membership left behind, as it was before leaving. Not callable from the API.
create or replace function public.leave_membership_for_move(p_joining boolean)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.members;
  v_others int;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into v_me from public.members where auth_user_id = auth.uid() for update;
  if v_me.id is null then
    raise exception 'no household to move from';
  end if;
  if v_me.status = 'pending' then
    raise exception 'already waiting to join a household';
  end if;

  if v_me.is_organiser and v_me.status = 'active' then
    select count(*) into v_others from public.members
     where family_id = v_me.family_id and status in ('active', 'managed') and id <> v_me.id;
    select name into v_name from public.families where id = v_me.family_id;
    if v_others > 0 then
      raise exception 'organizer must hand over first: %', v_name;
    end if;
    if not p_joining then
      raise exception 'already your own household: %', v_name;
    end if;
    raise exception 'only member of: %', v_name;
  end if;

  perform set_config('kin.privileged', 'on', true);
  update public.members
     set status = case when status = 'removed' then 'removed' else 'moved' end,
         auth_user_id = null,
         is_organiser = false,
         moved_at = now()
   where id = v_me.id;

  return v_me;
end;
$$;

revoke execute on function public.leave_membership_for_move(boolean) from public, anon, authenticated;

-- The new membership: the same person, their profile copied. Household-bound
-- things are not copied (relationship to that household, calendar and brief
-- links, "start here", kid view -- recomputed by its own trigger).
create or replace function public.copy_membership(p_from public.members, p_family uuid, p_role text, p_status text, p_organiser boolean)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new public.members;
begin
  perform set_config('kin.privileged', 'on', true);
  insert into public.members (
    family_id, person_id, auth_user_id, role, status, is_organiser,
    full_name, dob, mobile, avatar_url, sex, email, color, palette, theme, text_size, text_scale,
    notification_prefs, quick_actions, look_offer_answered_at,
    blood_type, allergies, insurance_info, physician_name,
    place_of_birth, height, weight, shoe_size, tshirt_size, pants_size,
    high_school, college, employer_name, employment_start_date, employment_end_date,
    work_contact_info, work_email, sss_number, philhealth_number, pagibig_number, tin_number
  )
  values (
    p_family, p_from.person_id, auth.uid(), p_role, p_status, p_organiser,
    p_from.full_name, p_from.dob, p_from.mobile, p_from.avatar_url, p_from.sex, p_from.email, p_from.color,
    p_from.palette, p_from.theme, p_from.text_size, p_from.text_scale,
    p_from.notification_prefs, p_from.quick_actions, p_from.look_offer_answered_at,
    p_from.blood_type, p_from.allergies, p_from.insurance_info, p_from.physician_name,
    p_from.place_of_birth, p_from.height, p_from.weight, p_from.shoe_size, p_from.tshirt_size, p_from.pants_size,
    p_from.high_school, p_from.college, p_from.employer_name, p_from.employment_start_date, p_from.employment_end_date,
    p_from.work_contact_info, p_from.work_email, p_from.sss_number, p_from.philhealth_number, p_from.pagibig_number, p_from.tin_number
  )
  returning * into v_new;
  return v_new;
end;
$$;

revoke execute on function public.copy_membership(public.members, uuid, text, text, boolean) from public, anon, authenticated;

-- 4. Starting your own household -----------------------------------------------

create or replace function public.start_own_household(p_household_name text)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(p_household_name, '')), 80);
  v_role text;
  v_old public.members;
  v_family uuid;
  v_new public.members;
  v_old_tree uuid;
  v_new_tree uuid;
begin
  if v_name = '' then
    raise exception 'household name required';
  end if;
  select role into v_role from public.members where auth_user_id = auth.uid();
  if v_role is not null and v_role not in ('parent', 'adult') then
    raise exception 'only a grown-up can start a household';
  end if;

  v_old := public.leave_membership_for_move(false);

  insert into public.families (name, invite_code)
  values (v_name, public.generate_invite_code())
  returning id into v_family;

  v_new := public.copy_membership(v_old, v_family, 'parent', 'active', true);

  -- Linked with the household they came from, if they left it rather than
  -- being removed from it. Accepted: they were a grown-up there, which is who
  -- answers a link request anyway.
  if v_old.status = 'active' then
    insert into public.family_links (requester_family_id, addressee_family_id, status, requested_by, decided_by, decided_at)
    values (v_family, v_old.family_id, 'accepted', v_new.id, v_new.id, now());

    -- In the new tree, and matched to themselves in the old one, so each
    -- household sees the other's branch around them (shared_branch()).
    insert into public.family_tree_people (family_id, member_id, created_by)
    values (v_family, v_new.id, v_new.id)
    returning id into v_new_tree;

    select id into v_old_tree from public.family_tree_people
     where family_id = v_old.family_id and member_id = v_old.id
     limit 1;
    if v_old_tree is not null then
      insert into public.family_tree_matches
        (offer_family_id, offer_person_id, to_family_id, to_person_id, status, offered_by, decided_by, decided_at)
      values (v_old.family_id, v_old_tree, v_family, v_new_tree, 'accepted', v_new.id, v_new.id, now());
    end if;
  end if;

  return v_new;
end;
$$;

revoke execute on function public.start_own_household(text) from public, anon;
grant execute on function public.start_own_household(text) to authenticated;

-- 5. Moving into another household with its code --------------------------------

create or replace function public.move_to_household(p_invite_code text)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_old public.members;
begin
  select id into v_target from public.families where invite_code = upper(btrim(coalesce(p_invite_code, '')));
  if v_target is null then
    raise exception 'invalid invite code';
  end if;
  if exists (select 1 from public.members where auth_user_id = auth.uid() and family_id = v_target) then
    raise exception 'already in that household';
  end if;

  v_old := public.leave_membership_for_move(true);

  return public.copy_membership(
    v_old, v_target,
    case when v_old.role = 'child_self' then 'child_self' else 'adult' end,
    'pending', false
  );
end;
$$;

revoke execute on function public.move_to_household(text) from public, anon;
grant execute on function public.move_to_household(text) to authenticated;
