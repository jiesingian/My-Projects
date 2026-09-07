-- PROPOSED. NOT APPLIED. Jonathan runs this one.
--
-- Why
-- ---
-- Every household is currently assumed to be in Asia/Manila, in two places:
-- FAMILY_TZ in src/lib/time.ts, which formats the Today briefing, and
-- src/instrumentation.ts, which sets the server's own zone so that the
-- Planner's date arithmetic lands on the right day. Both are stopgaps for this
-- column, and both stop being defensible the moment a second household in a
-- second country signs up: they would see a calendar keeping Manila's hours.
--
-- What it does
-- ------------
-- Adds families.timezone, defaulting to the zone the app already assumes, so
-- applying it changes nothing for the household that exists today. The check
-- constraint asks Postgres to resolve the name, which rejects a typo like
-- 'Asia/Manilla' at write time rather than at render time.
--
-- Safe to run live: one nullable-with-default column, no rewrite of existing
-- rows beyond the default, no lock held long enough to notice.

alter table public.families
  add column timezone text not null default 'Asia/Manila';

alter table public.families
  add constraint families_timezone_check
  check (now() at time zone timezone is not null);

comment on column public.families.timezone is
  'IANA zone the household lives in. Decides what "today" means for them.';

-- After it is applied
-- -------------------
-- 1. Regenerate src/lib/database.types.ts so the column exists in the types.
--
-- 2. src/lib/time.ts: familyDay/familyTime already take a tz argument and
--    default to FAMILY_TZ. Pass me.families.timezone at the call sites in
--    src/lib/queries/today.ts instead of letting them default.
--
-- 3. The harder half is the Planner, which does its date arithmetic in the
--    server's own zone rather than a passed-in one -- getDate(), getDay(),
--    toDateString(), toLocaleTimeString() with no timeZone. That is why
--    instrumentation.ts sets the process zone: it makes server-local and
--    family-local the same thing without touching several hundred lines.
--    Per-family zones break that trick, because one process cannot be in two
--    zones at once. Converting it means threading the household's zone through
--    src/app/(app)/planner/page.tsx and src/lib/queries/planner.ts and pinning
--    every formatter to it -- a real change, worth doing on its own, and worth
--    doing before the second country rather than after.
--
-- 4. Then delete src/instrumentation.ts and the FAMILY_TZ default, so there is
--    no longer a second answer to the question of where a family lives.
