-- 🎯 auto-save that keeps going, and into a savings account too (Jonathan,
-- 30 October).
--
-- auto_save   A goal's monthly auto-save bill (lib/actions/wealth-goals.ts).
--             Paying one lines up next month's by itself: the person asked
--             for a monthly saving once, so it is not offered again each
--             month the way an ordinary repeating bill is (lib/bill-roll.ts).
--             Until now only the name told one apart ("Save for ...",
--             "Extra on ..."); the ones already made are marked here.
--
-- 'accounts'  A bill may be for one of the household's accounts: paying it
--             moves the money there, as a transfer between two of the
--             household's accounts, instead of spending it. This is how a
--             savings-balance goal's auto-save reaches the account.
--             bill_against_check (20261026150000) checks the account is
--             this household's, as it does a loan's, an asset's or a goal's.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.bills add column if not exists auto_save boolean not null default false;

alter table public.bills drop constraint if exists bills_against_table_check;
alter table public.bills add constraint bills_against_table_check
  check (against_table is null or against_table in ('liabilities', 'assets', 'goals', 'accounts'));

-- The auto-saves made before the flag existed (29 October), by their shape.
update public.bills set auto_save = true
 where not auto_save
   and recurrence = 'monthly'
   and ((against_table = 'goals' and category = 'Goal' and name like 'Save for %')
     or (against_table = 'liabilities' and name like 'Extra on %'));

-- An account deleted outright lets go of its bills, as a loan, an asset or
-- a goal does. (Archiving an account keeps the row, and the bill with it.)
drop trigger if exists bills_against_release on public.accounts;
create trigger bills_against_release after delete on public.accounts
  for each row execute function public.bill_against_release();
