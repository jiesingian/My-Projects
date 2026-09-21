-- Four more routine kinds: school, work, family, personal
-- ========================================================
--
-- The KIND dropdown on Add Task (routines/new) reads ROUTINE_KIND_META in
-- src/lib/routines.ts, but the values it can actually save are bounded by
-- routines_kind_check -- the two have to move together or the form offers a
-- choice the database refuses. This widens the constraint to match the four
-- new values the app code adds alongside this migration.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS then re-ADD, so running this twice
-- (which the ledger already prevents) would just recreate the same check.
alter table public.routines drop constraint if exists routines_kind_check;
alter table public.routines add constraint routines_kind_check
  check (kind = any (array[
    'grocery', 'fitness', 'sport', 'worship', 'lesson', 'chore', 'health',
    'school', 'work', 'family', 'personal', 'other'
  ]));
