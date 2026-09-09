-- APPLIED 9 September, on Jonathan's instruction, and verified after: both
-- columns exist, both text, both nullable.
--
-- App Store and Play Store links, alongside the app's own link
-- ================================================================
--
-- What this is for
-- -----------------
-- accounts.linked_app_url already opens an app directly, when a member has
-- it installed and knows its own link (gcash://, for example). There was
-- nothing for the other half of that: someone who does NOT have the app
-- yet, on whichever kind of phone they carry. A household mixes iPhones and
-- Androids, and the two stores need two different links -- there is no
-- single URL that works on both, the way linked_app_url tries to be one
-- link for whoever already has the app.
--
-- This adds exactly that: one nullable link per store, both optional,
-- both independent of linked_app_url and of each other. A household can
-- fill in as many or as few as they actually have -- an account with only
-- an Android phone's owner needs only play_store_url, and nothing reads
-- either column as required.
--
-- Both are plain text, exactly like linked_app_url already is, and get the
-- same treatment app-side: clamp()'d to a length limit, never trusted
-- further than that. Nothing here changes what linked_app_url does or how
-- it is used.

begin;

alter table public.accounts
  add column app_store_url text,
  add column play_store_url text;

commit;


-- How to run it
-- =============
--
-- STEP 1 -- everything between `begin;` and `commit;` above. Adds two
-- nullable columns; touches no existing row, changes no existing behavior
-- until the accompanying code ships. Expect "Success. No rows returned."
--
-- STEP 2 -- confirm both columns exist. Read-only.
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'accounts'
--      and column_name in ('app_store_url', 'play_store_url');
--
--   Expect two rows, both "text", both is_nullable = 'YES'.
--
--
-- To roll back
-- ------------
-- Both columns are new and nullable, and nothing writes to them until the
-- accompanying code ships -- dropping them is safe at any point before
-- that, and safe after so long as you are willing to lose whatever a
-- household had already filled in:
--
--   alter table public.accounts drop column app_store_url;
--   alter table public.accounts drop column play_store_url;
