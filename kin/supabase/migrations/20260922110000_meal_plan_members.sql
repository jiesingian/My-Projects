-- Whose dinner is whose, without making the shopping list count twice
-- ===================================================================
--
-- "Add a drop down button for which preview of a family member shall be
-- displayed (each member usually has different meals, and some meals are
-- being shared by the family being considered in the grocery)."
--
-- The parenthesis is the hard part and the reason this is a join table
-- rather than a column. Two things are true at once: most dinners are one
-- dish the whole house eats, and some members eat something different --
-- a toddler, someone avoiding dairy, whoever is out that evening. A
-- meal_plans.member_id would force every shared meal to be duplicated per
-- person, and a duplicated meal is a duplicated shopping list.
--
-- NO ROWS MEANS EVERYONE
--
-- A meal with no rows here is the household's meal, which is the common
-- case and therefore the one that needs no work to express. Rows only
-- appear when a dish belongs to particular people. That also means every
-- meal already planned stays correct through this migration without being
-- touched.
--
-- THE GROCERY LIST DOES NOT READ THIS
--
-- Deliberately, and it is worth saying so here because the obvious next
-- change is to make it. The dropdown filters what is shown; the shop is
-- still built from every meal in the week exactly once. One dish feeding
-- four people is one set of ingredients, and a list that multiplied by the
-- number of people it was tagged for would be wrong in the direction that
-- costs money.

create table public.meal_plan_members (
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meal_plan_id, member_id)
);

create index meal_plan_members_member_idx on public.meal_plan_members(member_id);
create index meal_plan_members_family_idx on public.meal_plan_members(family_id);

alter table public.meal_plan_members enable row level security;

-- An ordinary household table: everyone in the house plans the meals
-- together, the same as meal_plans itself and meal_ingredients. Nothing
-- here is one person's secret, so nothing here needs current_member_id().
create policy meal_plan_members_select on public.meal_plan_members
  for select using (family_id = current_family_id());

create policy meal_plan_members_insert on public.meal_plan_members
  for insert with check (family_id = current_family_id());

create policy meal_plan_members_delete on public.meal_plan_members
  for delete using (family_id = current_family_id());
