-- A credit card's due day and minimum payment (Jonathan, 26 October)
-- ===================================================================
--
-- A credit card counts on A&L as money owed (#1010) but had no due date,
-- so nothing reminded anyone to pay it: a loan has its schedule, a bill
-- its due date, a card nothing. Two optional columns on the account:
--
--   card_due_day      the day of the month the statement is due (1-31;
--                     a 29th-31st falls on the month's last day when the
--                     month is shorter -- the app works that out)
--   card_min_payment  the minimum the bank asks, for the household's
--                     reference on Today
--
-- Only meaningful for account_type 'credit'; the app offers them there
-- alone and nothing breaks if another type carries them. Row-level
-- security is unchanged: these are columns on a table whose policies
-- already decide who sees and changes each account. Re-runnable.

alter table public.accounts add column if not exists card_due_day smallint;
alter table public.accounts add column if not exists card_min_payment numeric(14, 2);

alter table public.accounts drop constraint if exists accounts_card_due_day_check;
alter table public.accounts
  add constraint accounts_card_due_day_check check (card_due_day is null or card_due_day between 1 and 31);

alter table public.accounts drop constraint if exists accounts_card_min_payment_check;
alter table public.accounts
  add constraint accounts_card_min_payment_check check (card_min_payment is null or card_min_payment >= 0);
