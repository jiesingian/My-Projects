-- A loan's payment schedule (12 October, Janine): when the next payment is
-- due, how many are left, and the interest rate -- so each payment, with its
-- amount, shows on the calendar on its own day until the last one.
--
-- next_payment_date and payments_remaining describe the schedule as it was
-- entered: the payments fall monthly from next_payment_date, that many of
-- them. The app counts how many are still ahead from today, so nobody has to
-- tick the number down each month. interest_rate is the yearly rate in
-- percent, for the household's own reference; nothing is computed from it.
--
-- All three optional: most liabilities already in the household have none,
-- and a loan without a schedule simply puts nothing on the calendar.
-- Row-level security is unchanged -- these are columns on a table whose
-- policies already decide who sees each row.

alter table public.liabilities add column if not exists next_payment_date date;
alter table public.liabilities add column if not exists payments_remaining integer;
alter table public.liabilities add column if not exists interest_rate numeric(6, 3);

alter table public.liabilities drop constraint if exists liabilities_payments_remaining_check;
alter table public.liabilities
  add constraint liabilities_payments_remaining_check check (payments_remaining is null or payments_remaining between 1 and 1200);

alter table public.liabilities drop constraint if exists liabilities_interest_rate_check;
alter table public.liabilities
  add constraint liabilities_interest_rate_check check (interest_rate is null or (interest_rate >= 0 and interest_rate <= 100));
