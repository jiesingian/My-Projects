-- Market, apart from Groceries (Janine, 26 October)
-- ================================================
--
-- "Groceries & market" was one category. Market (palengke, talipapa, the
-- wet market) is its own now, and Groceries is the supermarket. The app
-- adds the category; this file moves what was already filed and removes
-- the Groceries budgets, as Janine chose:
--
-- 1. Expenses and bills under Groceries whose description names a market
--    -- palengke, talipapa, wet market, public market, or "market" as a
--    word of its own -- move to Market. "Supermarket", "minimarket" and
--    the like stay: \m matches only at the start of a word.
--
-- 2. Every Groceries budget (Family's or a person's) in force this month is
--    removed from this month on: a 0 row for the month, as the Remove
--    button saves it. Past months keep theirs. require_kin_plus is set
--    aside for these rows alone: they remove a budget, not add one.
--
-- Re-runnable: a second run finds nothing left to move, and the 0 rows
-- are already there.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

update public.wealth_transactions
set category = 'Market'
where category = 'Groceries'
  and direction = 'out'
  and particulars ~* '\m(palengke|talipapa|wet market|public market|market)\M';

update public.bills
set category = 'Market'
where category = 'Groceries'
  and name ~* '\m(palengke|talipapa|wet market|public market|market)\M';

alter table public.spending_budgets disable trigger require_kin_plus;

insert into public.spending_budgets (family_id, member_id, category, amount, from_month, set_by)
select b.family_id, b.member_id, 'Groceries', 0, date_trunc('month', now() at time zone 'Asia/Manila')::date, null
from (
  select distinct on (family_id, member_id) family_id, member_id, amount
  from public.spending_budgets
  where category = 'Groceries'
    and from_month <= date_trunc('month', now() at time zone 'Asia/Manila')::date
  order by family_id, member_id, from_month desc
) b
where b.amount > 0
on conflict (family_id, member_id, category, from_month) do update set amount = 0, updated_at = now();

alter table public.spending_budgets enable trigger require_kin_plus;
