-- Wealth charts (Jonathan, 30 September; preview approved the same day:
-- https://claude.ai/artifact/1Qg7T8E3XFBYLf9rJ21WFn). Two things the charts
-- need that the schema did not have.
--
-- 1. A spending budget per person per month. A grown-up sets it and the whole
--    household can see it, the same as the household budget ("yes" to the
--    preview's first question). Today's member card reads it too.
--
-- 2. Net worth over time. Kin only ever knew today's values for property,
--    loans and goals, so the line starts the month this ships ("yes" to
--    starting it clean rather than rebuilding cash backwards).
--
--    Each row is what ONE viewer saw, for one Who choice, in one month: the
--    page keeps the current month's row up to date whenever that person
--    opens it, and last month's row stops changing when the month ends. Per
--    viewer on purpose. Net worth depends on who is looking -- a private
--    account is in its owner's total and nobody else's -- so a single
--    household-wide snapshot would either leak private balances into
--    everyone's line or leave them out of their owner's. A row here is read
--    by the person who wrote it and nobody else.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- 1. Per-person budgets -----------------------------------------------------

create table if not exists public.member_budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  period_year integer not null,
  period_month integer not null,
  amount numeric(14, 2) not null,
  set_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint member_budgets_month_range check (period_month between 1 and 12),
  constraint member_budgets_year_range check (period_year between 2000 and 2200),
  constraint member_budgets_amount_nonnegative check (amount >= 0),
  constraint member_budgets_one_per_month unique (member_id, period_year, period_month)
);

create index if not exists member_budgets_family_period_idx on public.member_budgets (family_id, period_year, period_month);
create index if not exists member_budgets_set_by_idx on public.member_budgets (set_by);

alter table public.member_budgets enable row level security;

drop policy if exists member_budgets_select on public.member_budgets;
create policy member_budgets_select on public.member_budgets
  for select to authenticated
  using (family_id = (select public.current_family_id()));

-- Writing: a grown-up, for someone in their own household, in their own name.
drop policy if exists member_budgets_insert on public.member_budgets;
create policy member_budgets_insert on public.member_budgets
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and set_by = (select public.current_member_id())
    and exists (select 1 from public.members m where m.id = member_id and m.family_id = member_budgets.family_id)
  );

drop policy if exists member_budgets_update on public.member_budgets;
create policy member_budgets_update on public.member_budgets
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  )
  with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and set_by = (select public.current_member_id())
    and exists (select 1 from public.members m where m.id = member_id and m.family_id = member_budgets.family_id)
  );

drop policy if exists member_budgets_delete on public.member_budgets;
create policy member_budgets_delete on public.member_budgets
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

drop trigger if exists require_kin_plus on public.member_budgets;
create trigger require_kin_plus before insert on public.member_budgets
  for each row execute function public.require_kin_plus('Wealth');

-- 2. Net worth, month by month, per viewer ----------------------------------

create table if not exists public.net_worth_snapshots (
  viewer_member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  -- 'all', 'family', or the id of the one member the Who picker named.
  scope text not null,
  month date not null,
  cash numeric(16, 2) not null default 0,
  goals numeric(16, 2) not null default 0,
  assets numeric(16, 2) not null default 0,
  liabilities numeric(16, 2) not null default 0,
  net_worth numeric(16, 2) not null,
  updated_at timestamptz not null default now(),
  primary key (viewer_member_id, scope, month),
  constraint net_worth_snapshots_month_is_first check (extract(day from month) = 1),
  constraint net_worth_snapshots_scope_shape check (
    scope in ('all', 'family') or scope ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create index if not exists net_worth_snapshots_family_idx on public.net_worth_snapshots (family_id);

alter table public.net_worth_snapshots enable row level security;

drop policy if exists net_worth_snapshots_own on public.net_worth_snapshots;
create policy net_worth_snapshots_own on public.net_worth_snapshots
  for all to authenticated
  using (
    viewer_member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
  )
  with check (
    viewer_member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
  );

drop trigger if exists require_kin_plus on public.net_worth_snapshots;
create trigger require_kin_plus before insert on public.net_worth_snapshots
  for each row execute function public.require_kin_plus('Wealth');
