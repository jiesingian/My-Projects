-- Each household's own time zone (roadmap item 9, "any family, anywhere").
--
-- Until now every household was treated as being in Manila (lib/time.ts,
-- FAMILY_TZ). The default keeps that true for every existing household: no
-- row changes meaning when this runs. The app only offers names from its own
-- list (lib/household-prefs.ts, TIME_ZONES) and checks them on save; the
-- constraint here is a backstop on shape and length, since a CHECK cannot ask
-- pg_timezone_names whether a zone exists.
--
-- No policy change: families already has its read policy (own household
-- only) and writes go through the organiser-only Settings action.

alter table public.families
  add column if not exists time_zone text not null default 'Asia/Manila';

alter table public.families drop constraint if exists families_time_zone_shape;
alter table public.families
  add constraint families_time_zone_shape
  check (char_length(time_zone) between 3 and 64 and time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){0,2}$');
