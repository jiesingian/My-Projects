-- NOT YET APPLIED. Jonathan runs this; nothing here has been run against the
-- database. Read "How to run it" at the foot before you start.
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
-- One thing this migration cannot settle from here: whether
-- wealth_transactions.source_table or calendar_event_links.source_table
-- carries a CHECK constraint limiting it to today's values ('bills',
-- 'trips', 'buy_items', 'health_appointments', 'goals', 'routines', plus
-- 'activities', 'events', 'health_schedule', 'doc_entries', 'meal_plans'
-- for the calendar one). The generated TypeScript type for both columns is
-- plain `string`, which means either there is no such constraint, or the
-- generator simply doesn't surface CHECK constraints -- I can't tell which
-- from here without a database connection, and reading is fine but this
-- isn't a question a read answers on its own without running it. Step 0
-- below checks both. If either finds one, add 'income_schedules' to it
-- before the app tries to write that value, or every income receipt (for
-- wealth_transactions) or every calendar sync of an income schedule's
-- expected date (for calendar_event_links) will fail at the database.
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
-- STEP 0 -- check whether either source_table column is constrained.
-- Read-only.
--
--   select conrelid::regclass as on_table, conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid in ('public.wealth_transactions'::regclass, 'public.calendar_event_links'::regclass)
--      and contype = 'c'
--      and pg_get_constraintdef(oid) ilike '%source_table%';
--
-- For any row this returns whose definition does not already mention
-- 'income_schedules', widen it before the app code ships, e.g. for
-- wealth_transactions:
--
--   alter table public.wealth_transactions drop constraint <name from above>;
--   alter table public.wealth_transactions add constraint <same name>
--     check (source_table in ('bills','trips','buy_items',
--       'health_appointments','goals','routines','income_schedules'));
--
-- and correspondingly for calendar_event_links, adding 'income_schedules'
-- to whatever list its own constraint already has.
--
-- (Match each constraint's exact existing value list from its definition
-- above -- don't guess it; the values shown here are what the application
-- code uses as of this migration, not a copy of what either constraint
-- says.) If STEP 0 returns nothing, there is no constraint on either
-- column to widen and this step is done.
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
-- If STEP 0's widening was applied and needs undoing too, restore the
-- constraint definition STEP 0 printed before you changed it.
