-- A loan repriced after its fixed rate (Jonathan, 28 October)
-- ===========================================================
--
-- Philippine housing loans fix the rate for one, three or five years and
-- then reprice at the bank's prevailing rate (rate_fixed_until,
-- 20261026170000). From then on the bank's amortisation table starts again
-- from that day's balance, over the payments left, at the new rate. Kin
-- checked the balance against the original terms only, so after a
-- repricing it would read every peso since as a gap.
--
--   repriced_on             the day the new rate took effect
--   repriced_balance        what was owed that day
--   repriced_payments_left  how many payments were still ahead that day
--
-- All three set together by the app's "New rate" sheet; the table then runs
-- from them (lib/wealth.ts, loanOriginStatus). Optional: a loan never
-- repriced has none. Row-level security unchanged -- columns on a table
-- whose policies already decide who sees each row. Re-runnable.

alter table public.liabilities add column if not exists repriced_on date;
alter table public.liabilities add column if not exists repriced_balance numeric(14, 2);
alter table public.liabilities add column if not exists repriced_payments_left integer;

alter table public.liabilities drop constraint if exists liabilities_repriced_balance_check;
alter table public.liabilities
  add constraint liabilities_repriced_balance_check check (repriced_balance is null or repriced_balance >= 0);

alter table public.liabilities drop constraint if exists liabilities_repriced_payments_left_check;
alter table public.liabilities
  add constraint liabilities_repriced_payments_left_check check (repriced_payments_left is null or repriced_payments_left between 1 and 1200);
