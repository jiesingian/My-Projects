-- APPLIED 9 September, on Jonathan's instruction. STEP 0's widening was run
-- first, as this file insists; the table and its four policies followed, and
-- RLS was confirmed on afterwards.
--
-- It left one thing wrong that this file did not anticipate: every foreign
-- key here was written without an ON DELETE clause, so all of them came out
-- NO ACTION where bills' are CASCADE and SET NULL. See
-- 2026-09-09-income-schedules-cascades.sql, which repairs it.
--
-- Income schedules: the other half of the ledger
-- ================================================
--
-- What this is for
-- -----------------
-- Bills already give the household a place to expect an outgoing payment
-- before it happens -- a name, an amount, a due date, a recurrence label --
-- and to log it against the ledger once it's actually paid. There was
-- nothing symmetrical for money coming in: salary, a regular allowance,
-- recurring business revenue. This adds that other half, in the same shape.
--
-- income_schedules mirrors bills column-for-column where the concept
-- matches (name, amount, category, recurrence, a next-expected date, who
-- it's paid by), and status/received_at/received_by_member_id/
-- transaction_id play the same role bills' status/paid_at/
-- paid_by_member_id/transaction_id already play -- an entry sits
-- "expected" until logged, at which point receiveIncomeAction (added in the
-- same change as this migration) writes a wealth_transactions row and
-- flips the schedule to "received", exactly as payBillAction does for
-- bills. Nothing here auto-regenerates a schedule for its next period --
-- bills don't either; recurrence is a label the household reads, not a
-- generator, and this keeps the two symmetrical rather than making income
-- do something bills don't.
--
-- Visibility follows the bills convention, not the accounts one: every
-- bill is visible to the whole family regardless of who created it,
-- because a household plans around its bills together. income_schedules
-- does the same -- is_joint/owner_member_id exist for attribution ("this
-- is Jonathan's salary") but do not gate who can see or receive an entry.
-- A member's own account can still only be credited by them or a co-owner,
-- because that account's own RLS already enforces that on the
-- wealth_transactions insert.
--
-- One thing this migration could not settle when it was written: whether
-- wealth_transactions.source_table or calendar_event_links.source_table
-- carries a CHECK constraint limiting it to today's values. The generated
-- TypeScript type for both columns is plain `string`, which settles nothing
-- either way -- the type generator does not surface CHECK constraints.
--
-- It has since been read straight off the database, and the answer is that
-- both columns are constrained and neither list allows 'income_schedules':
--
--   wealth_transactions_source_table_check
--     CHECK (source_table IS NULL OR source_table = ANY (ARRAY[
--       'bills','trips','buy_items','health_appointments','goals','routines']))
--
--   calendar_event_links_source_table_check
--     CHECK (source_table = ANY (ARRAY[
--       'activities','events','health_schedule','health_appointments',
--       'doc_entries','trips','bills','meal_plans','goals','routines']))
--
-- So STEP 0 below is REQUIRED, not conditional, and it has to happen before
-- the accompanying code can write either value. receiveIncomeAction records
-- the ledger row with source_table = 'income_schedules', and
-- addIncomeScheduleAction syncs the expected date to the calendars with the
-- same value; without the widening, every income receipt and every calendar
-- sync of an income schedule fails at the database.
--
--
begin;

create table public.income_schedules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  name text not null,
  amount numeric not null,
  category text,
  recurrence text not null default 'monthly',
  next_date date,
  account_id uuid references public.accounts(id),
  is_joint boolean not null default true,
  owner_member_id uuid references public.members(id),
  status text not null default 'expected',
  received_at timestamptz,
  received_by_member_id uuid references public.members(id),
  transaction_id uuid references public.wealth_transactions(id),
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);

alter table public.income_schedules enable row level security;

-- Same shape as bills: any member of the family can see and record
-- against every schedule in it. Nothing here is private the way an
-- account can be -- a household plans its income together.
create policy income_schedules_select on public.income_schedules
  for select using (family_id = current_family_id());

create policy income_schedules_insert on public.income_schedules
  for insert with check (family_id = current_family_id());

create policy income_schedules_update on public.income_schedules
  for update using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy income_schedules_delete on public.income_schedules
  for delete using (family_id = current_family_id());

commit;


-- How to run it
-- =============
--
-- STEP 0 -- widen both source_table constraints. Required; run it first.
--
-- Each statement below carries that constraint's exact current definition
-- with 'income_schedules' appended. They were built from the live
-- definitions, not from the value list the application code happens to use.
--
-- Note the `source_table is null` branch on wealth_transactions: every
-- ad-hoc transaction -- anything not raised from a bill, trip or goal --
-- has a null source_table, so dropping that branch would break the ledger
-- everywhere, not just for income.
--
--   alter table public.wealth_transactions
--     drop constraint wealth_transactions_source_table_check;
--   alter table public.wealth_transactions
--     add constraint wealth_transactions_source_table_check
--     check (source_table is null or source_table in ('bills','trips',
--       'buy_items','health_appointments','goals','routines','income_schedules'));
--
--   alter table public.calendar_event_links
--     drop constraint calendar_event_links_source_table_check;
--   alter table public.calendar_event_links
--     add constraint calendar_event_links_source_table_check
--     check (source_table in ('activities','events','health_schedule',
--       'health_appointments','doc_entries','trips','bills','meal_plans',
--       'goals','routines','income_schedules'));
--
-- Then read both definitions back. Both should now mention
-- 'income_schedules', and wealth_transactions' should still have its
-- null branch:
--
--   select conrelid::regclass as on_table, conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid in ('public.wealth_transactions'::regclass, 'public.calendar_event_links'::regclass)
--      and contype = 'c'
--      and pg_get_constraintdef(oid) ilike '%source_table%';
--
-- STEP 1 -- everything between `begin;` and `commit;` above. Creates one
-- new table and its policies; touches no existing table, no existing row.
-- Expect "Success. No rows returned."
--
-- STEP 2 -- confirm RLS is on and all four policies exist. Read-only.
--
--   select relrowsecurity from pg_class where relname = 'income_schedules';
--   -- expect true
--
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'income_schedules'
--    order by policyname;
--   -- expect four rows: income_schedules_delete, income_schedules_insert,
--   -- income_schedules_select, income_schedules_update
--
--
-- To roll back
-- ------------
-- The table is new and, until the accompanying code ships, nothing writes
-- to it -- dropping it is safe at any point before that:
--
--   drop table public.income_schedules;
--
-- If STEP 0's widening was applied and needs undoing too, restore each
-- constraint from the definition quoted at the head of this file -- but
-- there is rarely a reason to: widening a CHECK only admits one more value,
-- and no row can carry it once the table is gone.
