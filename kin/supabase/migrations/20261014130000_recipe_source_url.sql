-- Save a recipe from a link (Meals tab): a recipe read from a web page keeps
-- the page's address, so the book can open the original (the full method,
-- the photos, the writer's own notes) and credit where it came from.
--
-- Only https, and no longer than a browser would keep. The column rides on
-- family_recipes' existing household policies; nothing else changes.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.family_recipes add column if not exists source_url text;

alter table public.family_recipes drop constraint if exists family_recipes_source_url_check;
alter table public.family_recipes
  add constraint family_recipes_source_url_check
  check (source_url is null or (source_url ~ '^https://' and char_length(source_url) <= 2000));
