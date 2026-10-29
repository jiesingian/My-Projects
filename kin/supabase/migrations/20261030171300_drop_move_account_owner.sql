-- Removes move_account_owner (20261030131700), with the "Belongs to" picker
-- that called it (Janine, 29 October: "Disregard the Belongs to change ...
-- remove it from the app").
--
-- Nothing else calls it, and it never moved an account: it refused every
-- managed child (it asked for status 'active'; a managed profile is
-- 'managed'), so no data depends on it. A security-definer function nobody
-- uses is only something to keep auditing; if moving an account between
-- people is wanted again, it comes back as a fresh change.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

drop function if exists public.move_account_owner(uuid, uuid);
