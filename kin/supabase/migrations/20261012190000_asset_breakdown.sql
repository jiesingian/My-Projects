-- What a property is made of (Janine, 12 October).
--
-- A house or condo has one value for the place itself, and then everything
-- the household spent inside it: furniture, appliances, a kitchen redone,
-- association dues. Each of those has its own price and the day it was
-- bought, and ages on its own -- a five-year-old aircon resells for a
-- fraction of its price, while the property itself usually gains.
--
-- 1. On the asset: how much the place itself changes a year (+ gains,
--    - loses), from the day its value was last set (`valued_on`). The app
--    compounds it to today; null keeps the value as typed.
-- 2. asset_items: the breakdown, one row per thing, under its asset. What it
--    is worth now is worked out in the app from its kind and age
--    (src/lib/wealth.ts, assetWorth) unless someone types `value_now`.
--
-- Who sees an item: exactly whoever sees its asset. The policies ask the
-- assets table, which answers under its own policies, so this cannot show
-- more than the asset does. Writing is for the household's grown-ups, in
-- their own name.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- 1. The property's own yearly change ---------------------------------------

alter table public.assets add column if not exists annual_change_pct numeric(5, 2);
alter table public.assets add column if not exists valued_on date;

alter table public.assets drop constraint if exists assets_annual_change_pct_check;
alter table public.assets
  add constraint assets_annual_change_pct_check check (annual_change_pct is null or annual_change_pct between -50 and 50);

-- A value already recorded was last set when the row was last updated.
update public.assets set valued_on = coalesce(updated_at, created_at)::date where valued_on is null;
alter table public.assets alter column valued_on set default current_date;

-- 2. The breakdown ----------------------------------------------------------

create table if not exists public.asset_items (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  kind text not null default 'other',
  cost numeric(14, 2) not null,
  acquired_on date,
  value_now numeric(14, 2),
  note text,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint asset_items_kind_check check (kind in ('appliance', 'furniture', 'electronics', 'improvement', 'fees', 'other')),
  constraint asset_items_cost_not_negative check (cost >= 0),
  constraint asset_items_value_now_not_negative check (value_now is null or value_now >= 0),
  constraint asset_items_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint asset_items_note_length check (note is null or char_length(note) <= 500)
);

create index if not exists asset_items_asset_idx on public.asset_items (asset_id);
create index if not exists asset_items_family_idx on public.asset_items (family_id);
create index if not exists asset_items_created_by_idx on public.asset_items (created_by);

alter table public.asset_items enable row level security;

drop policy if exists asset_items_select on public.asset_items;
create policy asset_items_select on public.asset_items
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.assets a where a.id = asset_id and a.family_id = asset_items.family_id)
  );

drop policy if exists asset_items_insert on public.asset_items;
create policy asset_items_insert on public.asset_items
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and created_by = (select public.current_member_id())
    and exists (select 1 from public.assets a where a.id = asset_id and a.family_id = asset_items.family_id)
  );

drop policy if exists asset_items_update on public.asset_items;
create policy asset_items_update on public.asset_items
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.assets a where a.id = asset_id and a.family_id = asset_items.family_id)
  )
  with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.assets a where a.id = asset_id and a.family_id = asset_items.family_id)
  );

drop policy if exists asset_items_delete on public.asset_items;
create policy asset_items_delete on public.asset_items
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.assets a where a.id = asset_id and a.family_id = asset_items.family_id)
  );

grant select, insert, update, delete on public.asset_items to authenticated;

-- Part of Wealth, so part of Kin Plus, like assets (20260928150000).
do $$
begin
  if to_regprocedure('public.require_kin_plus()') is not null then
    drop trigger if exists require_kin_plus on public.asset_items;
    create trigger require_kin_plus before insert on public.asset_items
      for each row execute function public.require_kin_plus('Wealth');
  end if;
end $$;
