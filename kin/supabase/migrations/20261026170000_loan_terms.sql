-- A loan by the terms it was taken on (Jonathan, 26 October)
-- =========================================================
--
-- A household that starts Kin halfway through a mortgage types the balance
-- off the latest statement and has no way to know whether it is right, how
-- much interest it has paid, or what the whole loan will cost. A bank's
-- own amortisation table answers all of that from three figures the loan
-- offer carries, and the rate already on the row (20261012170000):
--
--   original_amount   what was borrowed
--   term_months       over how many monthly payments
--   rate_fixed_until  the day the fixed rate ends and the bank reprices
--                     (Philippine housing loans fix for one, three or five
--                     years, then move to the bank's prevailing rate)
--
-- With these the app runs the schedule month by month (lib/wealth.ts,
-- amortise, loanOriginStatus): payments made are the schedule's dates that
-- have passed, the balance the terms say should be owed sits beside the one
-- on record, the interest paid so far and over the whole loan show under
-- the loan, and a repricing date coming up gets a line. Nothing is
-- computed from them in the database.
--
-- All three optional: a credit card or a personal loan has no term to
-- speak of, and every loan already recorded has none. Row-level security
-- is unchanged -- these are columns on a table whose policies already
-- decide who sees each row. Written re-runnable, as every migration is.

alter table public.liabilities add column if not exists original_amount numeric(14, 2);
alter table public.liabilities add column if not exists term_months integer;
alter table public.liabilities add column if not exists rate_fixed_until date;

alter table public.liabilities drop constraint if exists liabilities_original_amount_check;
alter table public.liabilities
  add constraint liabilities_original_amount_check check (original_amount is null or original_amount >= 0);

-- The same ceiling as payments_remaining: a hundred years of monthly payments.
alter table public.liabilities drop constraint if exists liabilities_term_months_check;
alter table public.liabilities
  add constraint liabilities_term_months_check check (term_months is null or term_months between 1 and 1200);
