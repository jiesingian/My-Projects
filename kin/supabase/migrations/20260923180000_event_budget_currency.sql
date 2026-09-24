-- A currency for an event's budget.
--
-- budget_amount was a bare number, read everywhere in the household's own
-- currency. A trip abroad is budgeted in the currency it will be spent in,
-- and a figure with no currency beside it is a guess about which one it is.
--
-- Nullable, and null means "the household's currency" -- which is what every
-- existing budget already is, so nothing here needs backfilling and no row's
-- meaning changes.
--
-- The CHECK is a shape, not a list. The app offers the codes in
-- household-prefs.ts and the server action refuses anything else; this is
-- the floor underneath that, so a 2,000-character string can never end up
-- prefixed to an amount the way one did on families.currency on 9 September.

alter table public.events
  add column if not exists budget_currency text;

alter table public.events
  drop constraint if exists events_budget_currency_code;
alter table public.events
  add constraint events_budget_currency_code check (budget_currency is null or budget_currency ~ '^[A-Z]{3}$');

-- No policy change. events is already family-scoped for select, insert,
-- update and delete; a new column inherits all four.
