-- A goal's second From account, and what each gives (Janine, 26 October)
-- =====================================================================
--
-- Two sources can fund one goal -- a salary account and a business one,
-- both going To the same savings account. Add goal takes a second From
-- account (exactly two, as Janine chose), and for each an optional amount
-- a month, which Kin sets against the monthly amount the goal needs.
-- Put money in can then move from one of them, or from both at once.
--
--   from_account_2_id: the second source; must differ from the first.
--   from_amount, from_2_amount: what each gives a month, if said.
--
-- No policy changes: goals' existing policies cover new columns. An account
-- deleted leaves the goal without that source.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.goals add column if not exists from_account_2_id uuid references public.accounts(id) on delete set null;
alter table public.goals add column if not exists from_amount numeric(14, 2);
alter table public.goals add column if not exists from_2_amount numeric(14, 2);

create index if not exists goals_from_account_2_idx on public.goals (from_account_2_id);

alter table public.goals drop constraint if exists goals_two_sources_differ;
alter table public.goals add constraint goals_two_sources_differ check (from_account_2_id is null or from_account_id is distinct from from_account_2_id);

alter table public.goals drop constraint if exists goals_source_amounts_positive;
alter table public.goals add constraint goals_source_amounts_positive check (
  (from_amount is null or (from_amount > 0 and from_amount <= 100000000))
  and (from_2_amount is null or (from_2_amount > 0 and from_2_amount <= 100000000))
);
