-- Who can see an account, person by person (Janine, 12-13 October).
--
-- Until now a personal account was either the whole household's to see or
-- its owner's alone (is_private). Neither fits "my wife may see it, the kids
-- may not": an account open to all shows its balance to a child, and a
-- private one hides it from the spouse too.
--
-- account_viewers lists the people, besides its owner, who may see one
-- private account -- its balance, its movements. is_private keeps its
-- meaning, "not the whole household's to see"; so a private account with no
-- viewers is still its owner's alone, exactly as before.
--
-- The existing SELECT policies on accounts and wealth_transactions predate
-- the migrations folder (joint OR mine OR NOT is_private) and are left as
-- they are. The two policies added here are permissive, so they only ADD the
-- people named on a private account; they cannot widen anything else.
--
-- Only the owner names viewers, only people in their own household, never
-- themselves. A viewer sees the list row that names them; the owner sees
-- all of theirs. Nobody else sees the list at all.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.account_viewers (
  account_id uuid not null references public.accounts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  added_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (account_id, member_id)
);

create index if not exists account_viewers_member_idx on public.account_viewers (member_id);
create index if not exists account_viewers_family_idx on public.account_viewers (family_id);
create index if not exists account_viewers_added_by_idx on public.account_viewers (added_by);

-- Whether the caller is named on this account. Security definer so the
-- accounts policy can ask without going through account_viewers' own policy
-- (which asks accounts -- that would recurse).
create or replace function public.account_shared_with_me(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_viewers v
    where v.account_id = p_account
      and v.member_id = (select public.current_member_id())
  );
$$;

revoke execute on function public.account_shared_with_me(uuid) from public, anon;
grant execute on function public.account_shared_with_me(uuid) to authenticated;

-- 1. The account, and its movements, to the people named on it ------------

drop policy if exists accounts_select_named_viewers on public.accounts;
create policy accounts_select_named_viewers on public.accounts
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and public.account_shared_with_me(id)
  );

drop policy if exists wealth_transactions_select_named_viewers on public.wealth_transactions;
create policy wealth_transactions_select_named_viewers on public.wealth_transactions
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and public.account_shared_with_me(account_id)
  );

-- 2. The list itself -------------------------------------------------------

alter table public.account_viewers enable row level security;

drop policy if exists account_viewers_select on public.account_viewers;
create policy account_viewers_select on public.account_viewers
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and (
      member_id = (select public.current_member_id())
      or exists (
        select 1 from public.accounts a
        where a.id = account_id and a.owner_member_id = (select public.current_member_id()) and not a.is_joint
      )
    )
  );

drop policy if exists account_viewers_insert on public.account_viewers;
create policy account_viewers_insert on public.account_viewers
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and added_by = (select public.current_member_id())
    and member_id <> (select public.current_member_id())
    and exists (
      select 1 from public.accounts a
      where a.id = account_id
        and a.family_id = account_viewers.family_id
        and a.owner_member_id = (select public.current_member_id())
        and not a.is_joint
    )
    and exists (
      select 1 from public.members m
      where m.id = member_id and m.family_id = account_viewers.family_id
    )
  );

drop policy if exists account_viewers_delete on public.account_viewers;
create policy account_viewers_delete on public.account_viewers
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.owner_member_id = (select public.current_member_id()) and not a.is_joint
    )
  );

grant select, insert, delete on public.account_viewers to authenticated;

-- 3. Children see only their own accounts and ones named for them ----------
--
-- (Janine, 13 October: "hide personal accounts set to everyone from kids
-- too".) A child sees an account only when it is theirs or its owner named
-- them above. "Everyone" on a personal account now means every grown-up.
-- This replaces 20261012210000's joint-only rule, which it covers (a joint
-- account is nobody's own and names nobody).
--
-- RESTRICTIVE, like that rule: ANDed with every permissive policy, so it
-- only ever takes rows away from a child; grown-ups are untouched.

-- Whether the caller owns this account or is named on it, read past RLS (the
-- movement policy cannot ask accounts as the child it is hiding them from).
create or replace function public.account_open_to_me(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.accounts a
    where a.id = p_account and a.owner_member_id = (select public.current_member_id())
  ) or public.account_shared_with_me(p_account);
$$;

revoke execute on function public.account_open_to_me(uuid) from public, anon;
grant execute on function public.account_open_to_me(uuid) to authenticated;

drop policy if exists accounts_joint_grownups_only on public.accounts;
drop policy if exists accounts_children_own_or_named on public.accounts;
create policy accounts_children_own_or_named on public.accounts
  as restrictive
  for select to authenticated
  using (
    (select public.current_member_role()) in ('parent', 'adult')
    or owner_member_id = (select public.current_member_id())
    or public.account_shared_with_me(id)
  );

drop policy if exists wealth_transactions_joint_grownups_only on public.wealth_transactions;
drop policy if exists wealth_transactions_children_own_or_named on public.wealth_transactions;
create policy wealth_transactions_children_own_or_named on public.wealth_transactions
  as restrictive
  for select to authenticated
  using (
    (select public.current_member_role()) in ('parent', 'adult')
    or public.account_open_to_me(account_id)
  );
