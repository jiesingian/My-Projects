-- APPLIED 9 September, on Jonathan's instruction, and verified after: the
-- column exists, text and nullable. STEP 3 was deliberately NOT run -- it
-- writes to the Singian household and the file itself says it is optional.
--
-- A household's own country, alongside currency
-- ================================================================
--
-- What this is for
-- -----------------
-- families already has currency, date_format and week_start -- each one a
-- household setting, not something guessed from wherever a browser happens
-- to be. country joins them, for the same reason: a household set up in
-- the Philippines and later using Kin from Dubai or Toronto is still the
-- same household, banking with the same institutions, on the same phones.
-- Nothing about where the phone currently is should change what Kin shows.
--
-- The one place this is read today: GET APP's search fallback
-- (appStoreSearchUrl in kin/src/lib/wealth.ts) picks which App Store
-- region to search in. It already works without this column -- every
-- family effectively searches the US App Store region today -- this
-- makes that a per-household choice instead of a fixed default, and
-- gives Kin somewhere to read a household's own market from as more of
-- the app grows region-aware later, rather than adding a column for
-- every feature separately.
--
-- One nullable column. Nothing reads it as required, and nothing breaks
-- if it is null -- appStoreSearchUrl keeps its own fallback either way.

begin;

alter table public.families
  add column country text;

commit;


-- How to run it
-- =============
--
-- STEP 1 -- everything between `begin;` and `commit;` above. Adds one
-- nullable column; touches no existing row. Expect "Success. No rows
-- returned."
--
-- STEP 2 -- confirm it exists. Read-only.
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'families'
--      and column_name = 'country';
--
--   Expect one row: "text", is_nullable = 'YES'.
--
-- STEP 3 (optional) -- set the Singian household's own country, since
-- it's the one real row that exists today and the app already knows the
-- answer:
--
--   update public.families set country = 'ph' where name = 'Singian';
--
--   Not required -- the app treats a null country the same as it does
--   right now, before this column existed.
--
--
-- To roll back
-- ------------
-- New, nullable, and (unless STEP 3 above was run) untouched -- safe to
-- drop at any point:
--
--   alter table public.families drop column country;
