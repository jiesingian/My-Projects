-- A "Stocks" account type beside Investment, for a brokerage like COL
-- Financial: its own group on the Accounts tab and its own apps in the
-- add-account dropdown, instead of sharing Investment with MP2.
--
-- accounts_account_type_check predates the migrations folder. Probed on
-- kin-dev on 12 October 2026: it accepts exactly bank, cash, ewallet,
-- credit, investment and other (the six ACCOUNT_TYPES in src/lib/wealth.ts),
-- and rejects anything else. This widens it by one; every existing row
-- already satisfies the new check. Re-runnable: drop if exists, then add.
alter table public.accounts drop constraint if exists accounts_account_type_check;
alter table public.accounts
  add constraint accounts_account_type_check
  check (account_type in ('bank', 'cash', 'ewallet', 'credit', 'investment', 'stocks', 'other'));
