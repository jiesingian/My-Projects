-- Include my private accounts in All totals (Janine, 2 October).
--
-- A private account is already private where it matters: the accounts and
-- wealth_transactions SELECT policies return it to its owner and nobody else
-- (joint OR mine OR NOT is_private), so it never reaches anyone else's list,
-- balance or total -- every total in Wealth is summed from what the policy
-- returns to the person looking.
--
-- What its owner could not do was leave it out of their OWN "All" totals:
-- the point of some private accounts is that they are not the household's
-- money. This is that choice, one per person, on their own member row.
-- Default true keeps every total exactly what it was until someone turns it
-- off. It is read only for the viewer's own row, and changes nothing about
-- who can see what.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.members add column if not exists wealth_include_private boolean not null default true;
