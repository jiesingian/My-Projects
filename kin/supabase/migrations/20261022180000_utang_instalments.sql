-- Utang paid back in instalments (Janine, 22 October)
-- ===================================================
--
-- An utang (20261019110000) can now be agreed as so many instalments --
-- "₱30,000 back at ₱5,000 a month for six months" -- rather than only a
-- single "by" date. Three columns on the loan, all set or all empty:
--
--   instalments           how many, 2 to 120;
--   instalment_frequency  weekly, semi_monthly (kinsenas) or monthly --
--                         the paluwagan's own rhythms and dates;
--   first_due_on          when the first one is due, not before the
--                         utang started.
--
-- Each instalment's date and amount are worked out in the app
-- (instalmentPlan in src/lib/utang.ts); what has been paid is still the sum
-- of utang_payments, applied to the instalments in order. due_on is set to
-- the last instalment's date, so "past due" and the reminder keep working.
--
-- No new table and no policy change: the columns sit under utang_entries'
-- own policies.

alter table public.utang_entries add column if not exists instalments integer;
alter table public.utang_entries add column if not exists instalment_frequency text;
alter table public.utang_entries add column if not exists first_due_on date;

alter table public.utang_entries drop constraint if exists utang_entries_instalments_whole;
alter table public.utang_entries add constraint utang_entries_instalments_whole check (
  (instalments is null and instalment_frequency is null and first_due_on is null)
  or (
    instalments between 2 and 120
    -- not null spelled out: "null in (...)" is null, and a check passes on null.
    and instalment_frequency is not null
    and instalment_frequency in ('weekly', 'semi_monthly', 'monthly')
    and first_due_on is not null
    and first_due_on >= started_on
  )
);
