-- PROPOSED. NOT APPLIED. Jonathan runs this one.
--
-- Security fix: a parent can mint an organiser
-- ===========================================
--
-- What is wrong
-- -------------
-- members_guard_self_update is the trigger that stops anyone editing the
-- fields that decide what they may do. It opens with:
--
--     if auth.uid() = old.auth_user_id then
--
-- A managed child has no login, so old.auth_user_id is null, and
-- `auth.uid() = null` is null rather than true. The guard is skipped entirely
-- for exactly the rows nobody is signed in as.
--
-- Meanwhile members_update_managed_by_parent lets any member whose role is
-- 'parent' update a managed child in their household, and it has no
-- WITH CHECK of its own -- so Postgres reuses its USING clause, which
-- constrains family and status but says nothing about is_organiser or role.
--
-- Nothing else closes the gap. Verified against the throwaway household on
-- 8 September: a signed-in member PATCHed is_organiser = true onto a managed
-- child through PostgREST and it was accepted. (Reverted immediately; that
-- household is back as it was.)
--
-- Why it matters
-- --------------
-- attach_login_to_child -- which exists already -- sets auth_user_id, role
-- and status on a managed child, and deliberately does not touch
-- is_organiser. So the sequence is:
--
--   1. add_managed_child            (any parent or adult may)
--   2. set is_organiser = true      (any parent may; nothing refuses it)
--   3. attach_login_to_child        (any parent or adult may)
--
-- and the login attached in step 3 is now an organiser: it can rename the
-- household, edit anyone's profile, remove members, and call
-- delete_household.
--
-- The escalation is parent -> organiser. join_family refuses to hand out
-- 'parent' (it accepts only 'adult' and 'child_self'), so a parent who is not
-- the organiser can only exist because an organiser promoted them -- an
-- entirely ordinary thing to do, and the whole point of having the role.
--
-- In the Singian household today the only parent is also the organiser, so
-- there is nobody who could gain anything by this. It is a rule that does not
-- hold, not an incident.
--
-- The fix
-- -------
-- Extend the existing trigger rather than add a new mechanism. It already has
-- OLD and NEW, and it already honours the kin.privileged escape hatch that
-- attach_login_to_child sets -- so that function keeps working unchanged,
-- which is what lets a child legitimately graduate.
--
-- A row with no login cannot be signed in as, so no legitimate flow needs a
-- signed-in user to change its privileges directly; the flows that do change
-- them (attach_login_to_child, transfer_organiser_role) go through
-- SECURITY DEFINER functions that set kin.privileged.

begin;

create or replace function public.prevent_member_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- The escape hatch, unchanged: attach_login_to_child and friends set this
  -- before doing the thing they exist to do.
  if coalesce(current_setting('kin.privileged', true), '') = 'on' then
    return new;
  end if;

  -- Your own membership: you may edit your profile, not your powers.
  if auth.uid() = old.auth_user_id then
    if new.status is distinct from old.status
       or new.is_organiser is distinct from old.is_organiser
       or new.role is distinct from old.role
       or new.family_id is distinct from old.family_id then
      raise exception 'not allowed to change this field on your own membership';
    end if;
  end if;

  -- A profile with no login, which is to say a managed child. The old check
  -- never reached these rows, because auth.uid() = null is null and not true.
  -- A parent may edit such a child's details; a parent may not hand it
  -- powers, because attach_login_to_child would then hand those powers a
  -- login.
  if old.auth_user_id is null then
    if new.is_organiser is distinct from old.is_organiser
       or new.role is distinct from old.role
       or new.family_id is distinct from old.family_id then
      raise exception 'not allowed to change privileges on a managed profile';
    end if;
  end if;

  return new;
end;
$function$;

commit;

-- How to check it worked
-- ---------------------
-- As a signed-in parent, against a managed child in your own household:
--
--   PATCH /rest/v1/members?id=eq.<managed child> {"is_organiser": true}
--
-- Before: 200, and the row comes back with is_organiser true.
-- After:  refused -- 'not allowed to change privileges on a managed profile'.
--
-- And the graduation path must still work, because it is the reason the
-- escape hatch exists:
--
--   select * from attach_login_to_child('<managed child>', '<auth user>');
--
-- That should still succeed. If it does not, this migration is wrong and
-- should be rolled back by restoring the previous function body, which is
-- quoted in full at the top of this file's history.
