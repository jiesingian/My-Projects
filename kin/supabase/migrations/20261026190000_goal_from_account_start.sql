-- A goal's From account and start date (Janine, 26 October)
-- ==========================================================
--
-- Add goal asks where the money comes from and when saving starts, beside
-- where it is kept (linked_account_id, "Saved in", now read as the goal's To
-- account) and when it should be reached (target_date, now "Target end
-- date"). Both are optional.
--
--   from_account_id: the account Put money in starts on. With a To account
--     too, putting money in is a transfer From -> To (the app's change),
--     so the To balance holds what the goal has saved.
--   start_date: when saving starts; with target_date it gives the monthly
--     amount needed.
--
-- No policy changes: goals' existing policies cover new columns. An account
-- deleted leaves the goal with no From account, as linked_account_id does.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.goals add column if not exists from_account_id uuid references public.accounts(id) on delete set null;
alter table public.goals add column if not exists start_date date;

create index if not exists goals_from_account_idx on public.goals (from_account_id);

alter table public.goals drop constraint if exists goals_start_before_end;
alter table public.goals add constraint goals_start_before_end check (start_date is null or target_date is null or start_date <= target_date);
