-- Which meals put what on the shopping list (7 October, Janine's roadmap).
--
-- Picking a meal for the week now adds its missing ingredients to the list by
-- itself -- whatever is not in the pantry -- merged with what is already
-- there by item and unit, so the adobo's garlic and the tinola's garlic are
-- one line of 0.15 kg rather than two. Each line says which meals it is for.
-- Removing a meal takes back only what that meal added: a line no other meal
-- needs goes, a shared one shrinks by that meal's share.
--
-- That needs to know, per line, how much each meal contributed. This table is
-- that record: one row per (list line, meal), with the amount the meal added.
-- Both sides cascade, so deleting a meal or a line tidies its links away.
--
-- Row-level security: the household reads and writes its own links, and a
-- link can only join a line and a meal that are both in the caller's
-- household -- the same reach the caller already has over buy_items and
-- meal_plans themselves.

create table if not exists public.buy_item_meals (
  buy_item_id uuid not null references public.buy_items(id) on delete cascade,
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  -- What this meal added to the line, in the line's unit; null when the
  -- recipe gave no amount.
  quantity numeric,
  created_at timestamptz not null default now(),
  primary key (buy_item_id, meal_plan_id)
);

create index if not exists buy_item_meals_meal_idx on public.buy_item_meals (meal_plan_id);
create index if not exists buy_item_meals_family_idx on public.buy_item_meals (family_id);

alter table public.buy_item_meals enable row level security;

drop policy if exists buy_item_meals_select on public.buy_item_meals;
create policy buy_item_meals_select on public.buy_item_meals
  for select to authenticated using (family_id = (select public.current_family_id()));

drop policy if exists buy_item_meals_insert on public.buy_item_meals;
create policy buy_item_meals_insert on public.buy_item_meals
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.buy_items b where b.id = buy_item_id and b.family_id = buy_item_meals.family_id)
    and exists (select 1 from public.meal_plans m where m.id = meal_plan_id and m.family_id = buy_item_meals.family_id)
  );

drop policy if exists buy_item_meals_update on public.buy_item_meals;
create policy buy_item_meals_update on public.buy_item_meals
  for update to authenticated
  using (family_id = (select public.current_family_id()))
  with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.buy_items b where b.id = buy_item_id and b.family_id = buy_item_meals.family_id)
    and exists (select 1 from public.meal_plans m where m.id = meal_plan_id and m.family_id = buy_item_meals.family_id)
  );

drop policy if exists buy_item_meals_delete on public.buy_item_meals;
create policy buy_item_meals_delete on public.buy_item_meals
  for delete to authenticated using (family_id = (select public.current_family_id()));

grant select, insert, update, delete on public.buy_item_meals to authenticated;
