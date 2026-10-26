-- A goal for a child (Janine, 26 October)
-- =======================================
--
-- Add goal offered Joint (the household's) or Mine (the one adding it). A
-- grown-up can now set one up for a child -- Erynne's, Keira's -- between
-- the two. goals already says whose a goal is (is_joint, owner_member_id);
-- what it lacked were rules for a goal owned by someone other than the one
-- looking:
--
--   Who sees a child's goal: the household's grown-ups and that child (the
--     child already sees their own: goals_select), never a sibling.
--   Who changes it: any grown-up. The child watches it grow but does not
--     change or delete one a grown-up set up; a goal the child made
--     themselves stays theirs to change.
--
-- The policies below are added beside the existing ones. The permissive
-- ones only let grown-ups reach a child's goal; the two restrictive ones
-- only take editing away from a child, on a goal a grown-up made. Nothing
-- else anyone could do before changes.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

drop policy if exists goals_child_select on public.goals;
create policy goals_child_select on public.goals
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and not is_joint
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.members m where m.id = goals.owner_member_id and m.family_id = goals.family_id and m.role in ('child_self', 'child_managed'))
  );

drop policy if exists goals_child_insert on public.goals;
create policy goals_child_insert on public.goals
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and not is_joint
    and created_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.members m where m.id = goals.owner_member_id and m.family_id = goals.family_id and m.role in ('child_self', 'child_managed'))
  );

drop policy if exists goals_child_update on public.goals;
create policy goals_child_update on public.goals
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and not is_joint
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.members m where m.id = goals.owner_member_id and m.family_id = goals.family_id and m.role in ('child_self', 'child_managed'))
  )
  with check (
    family_id = (select public.current_family_id())
    and not is_joint
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.members m where m.id = goals.owner_member_id and m.family_id = goals.family_id and m.role in ('child_self', 'child_managed'))
  );

drop policy if exists goals_child_delete on public.goals;
create policy goals_child_delete on public.goals
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and not is_joint
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.members m where m.id = goals.owner_member_id and m.family_id = goals.family_id and m.role in ('child_self', 'child_managed'))
  );

-- A child does not change or delete a goal a grown-up set up for them.
drop policy if exists goals_child_keeps_hands_off on public.goals;
create policy goals_child_keeps_hands_off on public.goals
  as restrictive for update to authenticated using (
    not (
      (select public.current_member_role()) in ('child_self', 'child_managed')
      and owner_member_id = (select public.current_member_id())
      and created_by is distinct from (select public.current_member_id())
    )
  );

drop policy if exists goals_child_keeps_delete on public.goals;
create policy goals_child_keeps_delete on public.goals
  as restrictive for delete to authenticated using (
    not (
      (select public.current_member_role()) in ('child_self', 'child_managed')
      and owner_member_id = (select public.current_member_id())
      and created_by is distinct from (select public.current_member_id())
    )
  );
