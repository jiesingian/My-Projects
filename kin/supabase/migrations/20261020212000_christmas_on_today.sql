-- Christmas on Today: the household's switch
-- ===========================================
--
-- From 1 December to 1 January (the household's own zone), Today starts
-- with a countdown to Noche Buena, a ready Noche Buena meal plan that fills
-- the To-Buy list through the meal plan, and the gift list and monito-monita
-- (20261019233300, 20261019233200). Decided 20 October (Jonathan), Kin Free.
--
-- families.christmas_on_today: the household's switch for all of it, on
-- unless turned off, as remember_the_departed is (20261019233000). Changed
-- by the organizer through the existing families update policy; read like
-- the rest of the family row. Nothing else: the dates are the app's
-- (lib/christmas.ts), the meals and the lists are the tables that exist.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.families add column if not exists christmas_on_today boolean not null default true;
