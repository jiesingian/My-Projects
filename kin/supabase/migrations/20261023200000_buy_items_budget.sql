-- A budget for each line on the to-buy list, and what it really cost
-- (23 October, Janine).
--
-- budget is typed when the line is added or edited; left blank, the list uses
-- the price book's estimate instead, so it is only stored when someone chose
-- it. actual_cost is what the line came to at the store: the box that opens
-- when a line is ticked starts at the budget, and only a different figure is
-- saved. Unticking a line clears it, since an unbought line cost nothing.
-- Savings are worked out from the two in the app (lib/buy-budget.ts), never
-- stored, so they cannot drift.
--
-- Both are amounts in the household's currency, never negative. buy_items'
-- own policies keep them inside the household; no new policy.

alter table public.buy_items
  add column if not exists budget numeric(12, 2),
  add column if not exists actual_cost numeric(12, 2);

alter table public.buy_items drop constraint if exists buy_items_budget_check;
alter table public.buy_items
  add constraint buy_items_budget_check check (budget is null or budget >= 0);

alter table public.buy_items drop constraint if exists buy_items_actual_cost_check;
alter table public.buy_items
  add constraint buy_items_actual_cost_check check (actual_cost is null or actual_cost >= 0);
