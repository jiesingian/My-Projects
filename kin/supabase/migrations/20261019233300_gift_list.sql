-- Christmas gifts and aguinaldo: a grown-ups' list, hidden from who it's for
-- ========================================================================
--
-- Per person (someone in the household, a relative, an inaanak) for a year:
-- a budget, and the ideas for them -- a gift, or an aguinaldo in cash -- each
-- with a cost and ticked when bought. The screen adds up what is planned and
-- bought against the budget.
--
-- Who sees it: the household's grown-ups (parent, adult), never anyone
-- else, and never the person a row is for: a grown-up on another grown-up's
-- list does not see that row or its ideas. Children never see the list.
--
-- Bought can be recorded in Wealth like other expenses (postHubExpenseAction),
-- so wealth_transactions.source_table gains 'gift_list_items'. The entry's
-- particulars say "Christmas gift" or "Aguinaldo", never a name, so a shared
-- account's ledger does not give the gift away.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.gift_list_people (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  year integer not null,
  name text not null,
  -- Someone in the household, so the list can be hidden from them.
  member_id uuid references public.members(id) on delete set null,
  kind text not null default 'family',
  budget numeric(12, 2),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint gift_list_people_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint gift_list_people_kind check (kind in ('family', 'inaanak', 'other')),
  constraint gift_list_people_year check (year between 2020 and 2100),
  constraint gift_list_people_budget check (budget is null or (budget >= 0 and budget <= 10000000))
);

create index if not exists gift_list_people_family_year_idx on public.gift_list_people (family_id, year);
create index if not exists gift_list_people_member_idx on public.gift_list_people (member_id);
create index if not exists gift_list_people_created_by_idx on public.gift_list_people (created_by);

create table if not exists public.gift_list_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  person_id uuid not null references public.gift_list_people(id) on delete cascade,
  label text not null,
  cost numeric(12, 2),
  -- An aguinaldo: cash in an envelope, not a gift to buy.
  is_cash boolean not null default false,
  bought boolean not null default false,
  bought_at timestamptz,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint gift_list_items_label_length check (char_length(btrim(label)) between 1 and 120),
  constraint gift_list_items_cost check (cost is null or (cost >= 0 and cost <= 10000000))
);

create index if not exists gift_list_items_person_idx on public.gift_list_items (person_id, created_at);
create index if not exists gift_list_items_family_idx on public.gift_list_items (family_id);
create index if not exists gift_list_items_created_by_idx on public.gift_list_items (created_by);

-- ── people ───────────────────────────────────────────────────────────────

alter table public.gift_list_people enable row level security;

drop policy if exists gift_list_people_select on public.gift_list_people;
create policy gift_list_people_select on public.gift_list_people
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and member_id is distinct from (select public.current_member_id())
  );

drop policy if exists gift_list_people_insert on public.gift_list_people;
create policy gift_list_people_insert on public.gift_list_people
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and member_id is distinct from (select public.current_member_id())
    and (member_id is null or exists (select 1 from public.members m where m.id = member_id and m.family_id = (select public.current_family_id())))
  );

drop policy if exists gift_list_people_update on public.gift_list_people;
create policy gift_list_people_update on public.gift_list_people
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and member_id is distinct from (select public.current_member_id())
  )
  with check (
    family_id = (select public.current_family_id())
    and member_id is distinct from (select public.current_member_id())
    and (member_id is null or exists (select 1 from public.members m where m.id = member_id and m.family_id = (select public.current_family_id())))
  );

drop policy if exists gift_list_people_delete on public.gift_list_people;
create policy gift_list_people_delete on public.gift_list_people
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and member_id is distinct from (select public.current_member_id())
  );

grant select, insert, update, delete on public.gift_list_people to authenticated;

-- ── items: as their person; asking gift_list_people under its own policy
-- hides an item exactly where its person is hidden ───────────────────────

alter table public.gift_list_items enable row level security;

drop policy if exists gift_list_items_select on public.gift_list_items;
create policy gift_list_items_select on public.gift_list_items
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.gift_list_people p where p.id = person_id and p.family_id = gift_list_items.family_id)
  );

drop policy if exists gift_list_items_insert on public.gift_list_items;
create policy gift_list_items_insert on public.gift_list_items
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and exists (select 1 from public.gift_list_people p where p.id = person_id and p.family_id = gift_list_items.family_id)
  );

drop policy if exists gift_list_items_update on public.gift_list_items;
create policy gift_list_items_update on public.gift_list_items
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.gift_list_people p where p.id = person_id and p.family_id = gift_list_items.family_id)
  )
  with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.gift_list_people p where p.id = person_id and p.family_id = gift_list_items.family_id)
  );

drop policy if exists gift_list_items_delete on public.gift_list_items;
create policy gift_list_items_delete on public.gift_list_items
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.gift_list_people p where p.id = person_id and p.family_id = gift_list_items.family_id)
  );

grant select, insert, update, delete on public.gift_list_items to authenticated;

-- Bought gets its time; who added it stays.
create or replace function public.gift_list_items_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.family_id := old.family_id;
  end if;
  if new.bought and (tg_op = 'INSERT' or not old.bought) then
    new.bought_at := now();
  elsif not new.bought then
    new.bought_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists gift_list_items_stamp on public.gift_list_items;
create trigger gift_list_items_stamp before insert or update on public.gift_list_items
  for each row execute function public.gift_list_items_stamp();

-- ── recording the spend in Wealth ─────────────────────────────────────────

alter table public.wealth_transactions drop constraint if exists wealth_transactions_source_table_check;
alter table public.wealth_transactions
  add constraint wealth_transactions_source_table_check check (
    source_table is null or source_table = any (array[
      'bills', 'trips', 'events', 'buy_items', 'health_appointments', 'goals',
      'routines', 'income_schedules', 'assets', 'remittances', 'gift_list_items'
    ])
  );
