-- APPLIED 9 September, on Jonathan's instruction, and verified after: the
-- five rules now read the same as bills'.
--
-- income_schedules: make its foreign keys behave like bills'
-- ==========================================================
--
-- What this is for
-- -----------------
-- 2026-09-09-income-schedules.sql created income_schedules to mirror bills
-- "column-for-column where the concept matches", and its columns do. Its
-- foreign keys do not: every one of them was written without an ON DELETE
-- clause, which in Postgres means NO ACTION -- refuse the parent's deletion.
--
-- Read off the database after that migration was run:
--
--   column                     bills                income_schedules
--   family_id                  CASCADE              NO ACTION
--   account                    SET NULL             NO ACTION
--   member who settled it      SET NULL             NO ACTION
--   transaction_id             SET NULL             NO ACTION
--
-- family_id is the one that matters most. Every other table in the schema --
-- all fifty-one of them -- cascades from families, because delete_household()
-- deletes the family row and lets the cascade do the rest. income_schedules
-- is the only exception, so from the first income schedule any household
-- saves, DELETE HOUSEHOLD raises a foreign-key violation and the most
-- destructive, most clearly-promised button in the app stops working. The
-- Settings screen says "This permanently deletes every member, journal entry,
-- health record, document index, and everything else in the app"; it would
-- instead have failed.
--
-- The other three are the same mistake with smaller blast radii, and each
-- would surface as an unrelated action refusing for no visible reason:
-- archiving or deleting an account that an income schedule was expected into,
-- removing the member who recorded one, or deleting the ledger row a receipt
-- created.
--
-- This is safe to run right now and gets less safe the longer it waits: the
-- table went live today and holds no rows in any household yet, so there is
-- nothing for the new rules to act on and nothing to lose. Once a household
-- has income schedules, the same change is still correct but it is no longer
-- theoretical -- deleting that household will start removing rows that were
-- previously refusing to be removed, which is the intended behaviour and
-- worth knowing you are turning on.

begin;

alter table public.income_schedules
  drop constraint income_schedules_family_id_fkey,
  add constraint income_schedules_family_id_fkey
    foreign key (family_id) references public.families(id) on delete cascade;

alter table public.income_schedules
  drop constraint income_schedules_account_id_fkey,
  add constraint income_schedules_account_id_fkey
    foreign key (account_id) references public.accounts(id) on delete set null;

alter table public.income_schedules
  drop constraint income_schedules_owner_member_id_fkey,
  add constraint income_schedules_owner_member_id_fkey
    foreign key (owner_member_id) references public.members(id) on delete set null;

alter table public.income_schedules
  drop constraint income_schedules_received_by_member_id_fkey,
  add constraint income_schedules_received_by_member_id_fkey
    foreign key (received_by_member_id) references public.members(id) on delete set null;

alter table public.income_schedules
  drop constraint income_schedules_transaction_id_fkey,
  add constraint income_schedules_transaction_id_fkey
    foreign key (transaction_id) references public.wealth_transactions(id) on delete set null;

commit;


-- Deliberately left alone
-- -----------------------
-- created_by stays NO ACTION, because that is what bills.created_by is. It
-- means a member who has recorded one cannot be deleted outright -- but
-- removeMemberAction sets status to 'removed' rather than deleting, so the
-- path people actually take is unaffected, and changing it here would be
-- making income_schedules differ from bills in the other direction for no
-- reason anybody asked for.


-- How to run it
-- =============
--
-- STEP 1 -- everything between `begin;` and `commit;` above. Rewrites five
-- constraints on one table; touches no row in any table. Expect "Success. No
-- rows returned."
--
-- STEP 2 -- confirm the rules now match bills. Read-only.
--
--   select tc.table_name, kcu.column_name, ccu.table_name as refs, rc.delete_rule
--     from information_schema.table_constraints tc
--     join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
--     join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
--     join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
--    where tc.constraint_type = 'FOREIGN KEY'
--      and tc.table_name in ('bills', 'income_schedules')
--    order by tc.table_name, kcu.column_name;
--
--   Expect income_schedules to read CASCADE for family_id and SET NULL for
--   account_id, owner_member_id, received_by_member_id and transaction_id.
--
--
-- To roll back
-- ------------
-- Put the five constraints back the way this file found them -- NO ACTION,
-- which is what you get by omitting the ON DELETE clause entirely:
--
--   alter table public.income_schedules
--     drop constraint income_schedules_family_id_fkey,
--     add constraint income_schedules_family_id_fkey
--       foreign key (family_id) references public.families(id);
--
-- and correspondingly for the other four. There is no reason to want this
-- other than to reproduce the bug.
