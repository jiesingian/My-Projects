-- Category budgets for Family and for each person (Janine, 26 October)
-- ====================================================================
--
-- WHAT IT IS
--
-- Until now Expenses had one household budget (budget_periods and its
-- budget_allocations), shown the same under All and Family, and a person had
-- only a month total (member_budgets). Now Family and every person have
-- budgets by category of their own, and All is the sum of the ones the
-- viewer can see -- never set on its own.
--
-- spending_budgets: one row per (whose, category, from_month). member_id
-- null is Family. A budget repeats into each later month until a later row
-- for the same whose and category changes it; amount 0 is "removed from that
-- month on". So the budget for a month is the row with the latest from_month
-- not after it, and past months keep what they were.
--
-- WHO SETS IT
--
--   Family:           any grown-up (parent or adult).
--   A grown-up's own: that grown-up alone; nobody else edits it.
--   A child's:        any grown-up; a child with their own login (child_self)
--                     may also set their own. A managed child has no login.
--
-- WHO SEES IT
--
--   Family's: the whole household, as the household budget was.
--   Your own: you.
--   A child's: the household's grown-ups and that child (not siblings).
--   A grown-up's: like their accounts. Open (the default, as a new account
--   is): the household's grown-ups. Private (budget_sharing.is_private):
--   only the people they name in budget_viewers.
--
-- WHEN AN ACCOUNT IS DELETED
--
-- finalize_account_deletion keeps the member row ('Former member', no
-- login), so nothing cascades. A trigger on that change removes their
-- budgets, their sharing choice and the viewer rows naming them.
--
-- KIN PLUS
--
-- Wealth is Kin Plus, so spending_budgets carries require_kin_plus.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.spending_budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  category text not null,
  amount numeric(14, 2) not null,
  from_month date not null,
  set_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint spending_budgets_category_length check (char_length(btrim(category)) between 1 and 100),
  constraint spending_budgets_amount_range check (amount >= 0 and amount <= 100000000),
  constraint spending_budgets_month_is_first check (extract(day from from_month) = 1),
  constraint spending_budgets_one_per_month unique nulls not distinct (family_id, member_id, category, from_month)
);

create index if not exists spending_budgets_member_idx on public.spending_budgets (member_id);
create index if not exists spending_budgets_set_by_idx on public.spending_budgets (set_by);

-- A grown-up's choice of who sees their budgets. No row: open to the
-- household's grown-ups, as a new account is.
create table if not exists public.budget_sharing (
  member_id uuid primary key references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  is_private boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists budget_sharing_family_idx on public.budget_sharing (family_id);

-- The people, besides its owner, who may see a private budget.
create table if not exists public.budget_viewers (
  owner_member_id uuid not null references public.members(id) on delete cascade,
  viewer_member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (owner_member_id, viewer_member_id),
  constraint budget_viewers_not_self check (owner_member_id <> viewer_member_id)
);

create index if not exists budget_viewers_viewer_idx on public.budget_viewers (viewer_member_id);
create index if not exists budget_viewers_family_idx on public.budget_viewers (family_id);

alter table public.spending_budgets enable row level security;
alter table public.budget_sharing enable row level security;
alter table public.budget_viewers enable row level security;

-- spending_budgets ----------------------------------------------------------

drop policy if exists spending_budgets_select on public.spending_budgets;
create policy spending_budgets_select on public.spending_budgets
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and (
      member_id is null
      or member_id = (select public.current_member_id())
      or (
        (select public.current_member_role()) in ('parent', 'adult')
        and (
          exists (select 1 from public.members m where m.id = spending_budgets.member_id and m.role in ('child_self', 'child_managed'))
          or not coalesce((select s.is_private from public.budget_sharing s where s.member_id = spending_budgets.member_id), false)
        )
      )
      or exists (
        select 1 from public.budget_viewers v
        where v.owner_member_id = spending_budgets.member_id and v.viewer_member_id = (select public.current_member_id())
      )
    )
  );

-- Who may write a row for this whose: Family and children's for grown-ups,
-- one's own for a grown-up or a child with a login.
drop policy if exists spending_budgets_insert on public.spending_budgets;
create policy spending_budgets_insert on public.spending_budgets
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and set_by = (select public.current_member_id())
    and (
      (member_id is null and (select public.current_member_role()) in ('parent', 'adult'))
      or (member_id = (select public.current_member_id()) and (select public.current_member_role()) in ('parent', 'adult', 'child_self'))
      or (
        (select public.current_member_role()) in ('parent', 'adult')
        and exists (select 1 from public.members m where m.id = spending_budgets.member_id and m.family_id = spending_budgets.family_id and m.role in ('child_self', 'child_managed'))
      )
    )
  );

drop policy if exists spending_budgets_update on public.spending_budgets;
create policy spending_budgets_update on public.spending_budgets
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (
      (member_id is null and (select public.current_member_role()) in ('parent', 'adult'))
      or (member_id = (select public.current_member_id()) and (select public.current_member_role()) in ('parent', 'adult', 'child_self'))
      or (
        (select public.current_member_role()) in ('parent', 'adult')
        and exists (select 1 from public.members m where m.id = spending_budgets.member_id and m.role in ('child_self', 'child_managed'))
      )
    )
  )
  with check (
    family_id = (select public.current_family_id())
    and set_by = (select public.current_member_id())
    and (
      (member_id is null and (select public.current_member_role()) in ('parent', 'adult'))
      or (member_id = (select public.current_member_id()) and (select public.current_member_role()) in ('parent', 'adult', 'child_self'))
      or (
        (select public.current_member_role()) in ('parent', 'adult')
        and exists (select 1 from public.members m where m.id = spending_budgets.member_id and m.family_id = spending_budgets.family_id and m.role in ('child_self', 'child_managed'))
      )
    )
  );

drop policy if exists spending_budgets_delete on public.spending_budgets;
create policy spending_budgets_delete on public.spending_budgets
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and (
      (member_id is null and (select public.current_member_role()) in ('parent', 'adult'))
      or (member_id = (select public.current_member_id()) and (select public.current_member_role()) in ('parent', 'adult', 'child_self'))
      or (
        (select public.current_member_role()) in ('parent', 'adult')
        and exists (select 1 from public.members m where m.id = spending_budgets.member_id and m.role in ('child_self', 'child_managed'))
      )
    )
  );

drop trigger if exists require_kin_plus on public.spending_budgets;
create trigger require_kin_plus before insert on public.spending_budgets
  for each row execute function public.require_kin_plus('Wealth');

-- budget_sharing: the household reads the open/private choice (it says
-- nothing about amounts); a grown-up writes only their own. -----------------

drop policy if exists budget_sharing_select on public.budget_sharing;
create policy budget_sharing_select on public.budget_sharing
  for select to authenticated using (family_id = (select public.current_family_id()));

drop policy if exists budget_sharing_insert on public.budget_sharing;
create policy budget_sharing_insert on public.budget_sharing
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

drop policy if exists budget_sharing_update on public.budget_sharing;
create policy budget_sharing_update on public.budget_sharing
  for update to authenticated
  using (member_id = (select public.current_member_id()) and family_id = (select public.current_family_id()))
  with check (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

drop policy if exists budget_sharing_delete on public.budget_sharing;
create policy budget_sharing_delete on public.budget_sharing
  for delete to authenticated using (member_id = (select public.current_member_id()) and family_id = (select public.current_family_id()));

-- budget_viewers: the owner sees and manages the list; a viewer sees the row
-- naming them. Only people of the household with a login, never oneself. ---

drop policy if exists budget_viewers_select on public.budget_viewers;
create policy budget_viewers_select on public.budget_viewers
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and (owner_member_id = (select public.current_member_id()) or viewer_member_id = (select public.current_member_id()))
  );

drop policy if exists budget_viewers_insert on public.budget_viewers;
create policy budget_viewers_insert on public.budget_viewers
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and owner_member_id = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (
      select 1 from public.members m
      where m.id = budget_viewers.viewer_member_id and m.family_id = budget_viewers.family_id
        and m.auth_user_id is not null and m.status = 'active'
    )
  );

drop policy if exists budget_viewers_delete on public.budget_viewers;
create policy budget_viewers_delete on public.budget_viewers
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and owner_member_id = (select public.current_member_id())
  );

-- A deleted account's budgets go with it ------------------------------------

create or replace function public.spending_budgets_sweep_former_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.spending_budgets where member_id = new.id;
  delete from public.budget_sharing where member_id = new.id;
  delete from public.budget_viewers where owner_member_id = new.id or viewer_member_id = new.id;
  return new;
end;
$$;

revoke execute on function public.spending_budgets_sweep_former_member() from public, anon, authenticated;

drop trigger if exists spending_budgets_sweep_former_member on public.members;
create trigger spending_budgets_sweep_former_member
  after update of auth_user_id on public.members
  for each row
  when (old.auth_user_id is not null and new.auth_user_id is null and new.status <> 'active')
  execute function public.spending_budgets_sweep_former_member();
