-- Whose an account is, changed after it was added (Janine, 29 October).
--
-- Two MP2 accounts were added under a parent's name when they were a managed
-- child's each. Removing and adding them again would lose the transfers
-- already made into them, so the account moves instead -- and with it the
-- movements that were simply its owner's, so Cash Flow counts that money
-- as the child's. A movement someone had tagged to another person, or to
-- the family on someone's own account, keeps that tag.
--
-- Who may move one is the rule for opening one (20261012 "Whose it is"):
-- a grown-up, and only between themselves, the family (joint) and a
-- managed child of the household -- never into or out of another grown-up's
-- or a child with a login, whose accounts are theirs.
--
-- After the move the account is open to the household: a managed child has
-- no login to see a private account with, joint is everyone's, and a
-- grown-up taking one back starts from where it was and can close it. Any
-- list of named viewers the old owner kept is cleared with it.
--
-- One function, so the account and its movements move together or not at
-- all. Security definer because the account's current owner may be a child
-- whose rows the caller cannot write directly; every check is below.
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create or replace function public.move_account_owner(p_account uuid, p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.current_member_id();
  v_family uuid := public.current_family_id();
  v_role text := public.current_member_role();
  v_account record;
  v_old_role text;
  v_new_role text;
begin
  if v_me is null or v_role not in ('parent', 'adult') then
    raise exception 'Only a grown-up can change whose an account is.';
  end if;

  select a.id, a.is_joint, a.owner_member_id into v_account
    from public.accounts a
    where a.id = p_account and a.family_id = v_family and a.deleted_at is null
    for update;
  if not found then
    raise exception 'That account is no longer here.';
  end if;

  -- Where it is now: the family's, the caller's, or a managed child's.
  if not v_account.is_joint and v_account.owner_member_id is distinct from v_me then
    select m.role into v_old_role from public.members m
      where m.id = v_account.owner_member_id and m.family_id = v_family;
    if v_old_role is distinct from 'child_managed' then
      raise exception 'This account is someone else''s; only they can change whose it is.';
    end if;
  end if;

  -- Where it goes: the family (null), the caller, or a managed child.
  if p_owner is not null and p_owner <> v_me then
    select m.role into v_new_role from public.members m
      where m.id = p_owner and m.family_id = v_family and m.status = 'active';
    if v_new_role is distinct from 'child_managed' then
      raise exception 'Choose yourself, the family, or a child whose profile you keep.';
    end if;
  end if;

  -- Already there: nothing to do.
  if (p_owner is null and v_account.is_joint)
     or (p_owner is not null and not v_account.is_joint and v_account.owner_member_id = p_owner) then
    return;
  end if;

  update public.wealth_transactions t
    set is_joint = (p_owner is null), owner_member_id = p_owner
    where t.account_id = p_account
      and t.family_id = v_family
      and case when v_account.is_joint
               then t.is_joint
               else not t.is_joint and t.owner_member_id = v_account.owner_member_id end;

  delete from public.account_viewers v where v.account_id = p_account;

  update public.accounts a
    set is_joint = (p_owner is null), owner_member_id = p_owner, is_private = false
    where a.id = p_account;
end;
$$;

revoke execute on function public.move_account_owner(uuid, uuid) from public, anon;
grant execute on function public.move_account_owner(uuid, uuid) to authenticated;
