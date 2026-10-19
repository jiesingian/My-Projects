-- Sinking funds (Kin Free, approved 19 October)
-- =============================================
--
-- A sinking fund is a savings goal for a cost that comes back every year:
-- tuition, car registration, an insurance premium, the Christmas season.
-- It is the same `goals` row as any savings goal -- contributions are the
-- same ledger movements, its total the same recalc_goal_total() -- with one
-- more fact: it repeats. When it is paid ("Paid it" on the goal), the app
-- takes the money back out of the goal into the account that pays, records
-- the payment, and moves target_date a year on.
--
-- No policy changes: goals' existing household policy covers the column.

alter table public.goals add column if not exists repeats_yearly boolean not null default false;

comment on column public.goals.repeats_yearly is
  'A sinking fund: the target date moves a year on each time it is paid.';
