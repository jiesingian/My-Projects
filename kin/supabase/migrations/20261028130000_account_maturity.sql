-- When an investment account matures (Jonathan, 28 October)
-- ==========================================================
--
-- A time deposit or an MP2 account has a maturity date: the term ends and
-- the money, with what it earned, is the household's to roll over or move.
-- Without the date in Kin a matured time deposit can sit forgotten and roll
-- over at a worse rate, or MP2's payout go unclaimed. One optional column
-- on accounts:
--
--   matures_on   the day the term ends
--
-- The app offers it for investment and stock accounts and reminds on Today
-- (lib/today-wealth.ts): in Coming up the week before, and as a row from
-- the day until two weeks after. Row-level security unchanged -- a column
-- on a table whose policies already decide who sees and changes each
-- account. Re-runnable.

alter table public.accounts add column if not exists matures_on date;
