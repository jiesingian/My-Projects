-- Today's household budget becomes Family's (Janine, 26 October)
-- ===============================================================
--
-- Expenses now reads category budgets from spending_budgets
-- (20261026100000): Family's and each person's, All their sum. The one
-- household budget there was until now (budget_periods and its
-- budget_allocations) is copied here as Family's, so All shows the same
-- totals as before until someone sets a personal budget.
--
-- Each month that had a budget becomes rows from that month. A spending
-- budget repeats until changed, where a month's allocations did not: a
-- category budgeted one month and missing from a later month's budget is
-- written as 0 (removed) for that later month, so no month gains a budget
-- it never had. A month with no budget at all now carries the one before
-- it -- the repeating Janine chose.
--
-- The month's total ceiling (budget_amount) is not copied: the budget is now
-- its categories added up.
--
-- Re-runnable: rows already there are left as they are (on conflict do
-- nothing), so a budget set on the new screen is never overwritten.
-- require_kin_plus is set aside for the copy alone: these are budgets a
-- household already had, not new ones being added.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.spending_budgets disable trigger require_kin_plus;

insert into public.spending_budgets (family_id, member_id, category, amount, from_month, set_by)
select p.family_id, null, c.category, coalesce(a.amount, 0), make_date(p.period_year, p.period_month, 1), null
from public.budget_periods p
join (
  select p2.family_id, a2.category, min(make_date(p2.period_year, p2.period_month, 1)) as first_month
  from public.budget_allocations a2
  join public.budget_periods p2 on p2.id = a2.budget_period_id
  where char_length(btrim(a2.category)) between 1 and 100
  group by p2.family_id, a2.category
) c on c.family_id = p.family_id and c.first_month <= make_date(p.period_year, p.period_month, 1)
left join public.budget_allocations a on a.budget_period_id = p.id and a.category = c.category
where p.period_month between 1 and 12
  and coalesce(a.amount, 0) between 0 and 100000000
on conflict (family_id, member_id, category, from_month) do nothing;

alter table public.spending_budgets enable trigger require_kin_plus;
