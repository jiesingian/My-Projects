-- Account numbers (Janine, 2 October): an optional number on any account,
-- shown masked with a Copy button on the account's page and in Transfer, so
-- it can be pasted into a bank's app.
--
-- Why a table of its own, not a column on accounts and not the vault:
--
--   * The vault (20260924100000) is the household's: an item is for everyone
--     or for grown-ups, never for one person. A private account's number has
--     to be its owner's alone, so the vault cannot hold it.
--   * A column on accounts would follow the account's own visibility, but it
--     would also travel everywhere an account row is read -- select("*") in
--     every Wealth list, Move money's pickers, the assistant's tools, the data
--     export. Here it is read only where it is shown.
--
-- Who sees one, enforced here, not in the page:
--   * the account's owner, always;
--   * on a joint account, or one its owner has shared with the household,
--     the household's grown-ups -- not its children.
--   * nobody else: another member's private account is invisible to them
--     already (accounts' own SELECT policy), and so is its number.
-- Who sets one: the owner of a personal account; any grown-up on a joint one.
--
-- One row per account, gone with it (on delete cascade).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.account_numbers (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  number text not null,
  updated_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint account_numbers_number_shape check (number ~ '^[A-Za-z0-9 -]{4,40}$')
);

create index if not exists account_numbers_family_idx on public.account_numbers (family_id);
create index if not exists account_numbers_updated_by_idx on public.account_numbers (updated_by);

alter table public.account_numbers enable row level security;

drop policy if exists account_numbers_select on public.account_numbers;
create policy account_numbers_select on public.account_numbers
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (
      select 1 from public.accounts a
      where a.id = account_numbers.account_id
        and a.family_id = account_numbers.family_id
        and (
          a.owner_member_id = (select public.current_member_id())
          or ((a.is_joint or not a.is_private) and (select public.current_member_role()) in ('parent', 'adult'))
        )
    )
  );

drop policy if exists account_numbers_insert on public.account_numbers;
create policy account_numbers_insert on public.account_numbers
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and updated_by = (select public.current_member_id())
    and exists (
      select 1 from public.accounts a
      where a.id = account_numbers.account_id
        and a.family_id = account_numbers.family_id
        and (
          (not a.is_joint and a.owner_member_id = (select public.current_member_id()))
          or (a.is_joint and (select public.current_member_role()) in ('parent', 'adult'))
        )
    )
  );

drop policy if exists account_numbers_update on public.account_numbers;
create policy account_numbers_update on public.account_numbers
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (
      select 1 from public.accounts a
      where a.id = account_numbers.account_id
        and a.family_id = account_numbers.family_id
        and (
          (not a.is_joint and a.owner_member_id = (select public.current_member_id()))
          or (a.is_joint and (select public.current_member_role()) in ('parent', 'adult'))
        )
    )
  )
  with check (
    family_id = (select public.current_family_id())
    and updated_by = (select public.current_member_id())
    and exists (
      select 1 from public.accounts a
      where a.id = account_numbers.account_id
        and a.family_id = account_numbers.family_id
        and (
          (not a.is_joint and a.owner_member_id = (select public.current_member_id()))
          or (a.is_joint and (select public.current_member_role()) in ('parent', 'adult'))
        )
    )
  );

drop policy if exists account_numbers_delete on public.account_numbers;
create policy account_numbers_delete on public.account_numbers
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (
      select 1 from public.accounts a
      where a.id = account_numbers.account_id
        and a.family_id = account_numbers.family_id
        and (
          (not a.is_joint and a.owner_member_id = (select public.current_member_id()))
          or (a.is_joint and (select public.current_member_role()) in ('parent', 'adult'))
        )
    )
  );

revoke all on public.account_numbers from anon;
grant select, insert, update, delete on public.account_numbers to authenticated;
