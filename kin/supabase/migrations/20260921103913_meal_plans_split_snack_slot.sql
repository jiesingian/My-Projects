-- Split meal_plans' generic "snack" slot into morning and afternoon
-- ====================================================================
--
-- The Household meal plan showed a day's four parts in order: breakfast,
-- lunch, dinner, then one generic "snack" bucket tacked on the end. A day
-- actually has two snack breaks, one on each side of lunch, and a single
-- undated bucket said nothing about which -- so a day's plan no longer read
-- in the order it happens on a page that otherwise promises exactly that.
--
-- Checked before writing this: neither dev nor production had a single row
-- in the "snack" slot (`select slot, count(*) from meal_plans group by
-- slot` came back empty on dev, and without "snack" at all on production),
-- so this replaces the value outright in the CHECK constraint rather than
-- keeping the old one around unused alongside the two new ones.
alter table public.meal_plans drop constraint if exists meal_plans_slot_check;
alter table public.meal_plans add constraint meal_plans_slot_check
  check (slot = any (array['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner']));
