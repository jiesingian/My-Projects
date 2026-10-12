-- Joint accounts are for the grown-ups (Janine, 12 October): a child does
-- not see the household's joint accounts, their balances or their
-- movements.
--
-- The SELECT policies on accounts and wealth_transactions predate the
-- migrations folder (joint OR mine OR NOT is_private). Rather than rewrite
-- policies whose live names are not in this repository, these are
-- RESTRICTIVE: Postgres ANDs them with every permissive policy, so they can
-- only take rows away -- here, joint ones from anyone who is not a parent or
-- an adult. Nothing else about who sees what changes; writes are untouched.
--
-- A child's own account is not joint and stays theirs to see. The Wealth
-- tab is already hidden in kid view; this is the lock behind it, and also
-- keeps joint movements out of what a child's Today, Planner and export
-- sum.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- Whether an account is joint, read past RLS: a restrictive policy on
-- wealth_transactions cannot ask accounts under the caller's own policies,
-- because for a child the joint account is exactly the row that is hidden.
create or replace function public.account_is_joint(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.is_joint from public.accounts a where a.id = p_account), false);
$$;

revoke execute on function public.account_is_joint(uuid) from public, anon;
grant execute on function public.account_is_joint(uuid) to authenticated;

drop policy if exists accounts_joint_grownups_only on public.accounts;
create policy accounts_joint_grownups_only on public.accounts
  as restrictive
  for select to authenticated
  using (
    not is_joint
    or (select public.current_member_role()) in ('parent', 'adult')
  );

drop policy if exists wealth_transactions_joint_grownups_only on public.wealth_transactions;
create policy wealth_transactions_joint_grownups_only on public.wealth_transactions
  as restrictive
  for select to authenticated
  using (
    (select public.current_member_role()) in ('parent', 'adult')
    or not public.account_is_joint(account_id)
  );
