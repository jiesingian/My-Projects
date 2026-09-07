-- PROPOSED. NOT APPLIED. Jonathan runs this one, and should read it first
-- because it moves real family data.
--
-- What happened
-- -------------
-- Until 7 September the server ran in UTC. createActivityAction builds an
-- instant with new Date(`${date}T${from}`), which parses in the server's zone,
-- so a time typed as 20:30 was stored as 20:30 UTC. The Planner then rendered
-- it in the server's zone too, so it displayed as 20:30 and looked right. Two
-- errors cancelling.
--
-- instrumentation.ts put the server in Asia/Manila. New activities are now
-- stored correctly: type 20:30, get 12:30 UTC, read 20:30. But the old rows
-- kept their old instants, and the display is no longer wrong in the way that
-- used to hide them, so they now read eight hours late:
--
--     stored 12:30 UTC  ->  displays 20:30      (was 12:30)
--     stored 14:00 UTC  ->  displays 22:00      (was 14:00)
--     stored 20:30 UTC  ->  displays 04:30 +1d  (was 20:30)
--
-- That last one is the tell. Nothing in a household happens at half four in
-- the morning, so those times were typed as Manila and stored as UTC.
--
-- What this does
-- --------------
-- Moves each affected instant back eight hours, so the wall-clock time reads
-- as the one that was originally typed. The Philippines has never observed
-- daylight saving, so a flat offset is right for every date.
--
-- Scope, and why it is narrow
-- ---------------------------
-- Only activities.start_at and end_at are affected. They are the only columns
-- built from a typed time-of-day: everything else is either a date-only column
-- or a `T00:00:00` all-day marker used for calendar sync and not stored.
-- routines.time_of_day is a `time`, not a timestamp, so it never moved.

begin;

-- Look before leaping. Run this on its own first and check the "after" column
-- against what the family remembers these actually being.
select id,
       title,
       to_char(start_at at time zone 'Asia/Manila', 'Dy DD Mon HH24:MI') as reads_now,
       to_char((start_at - interval '8 hours') at time zone 'Asia/Manila', 'Dy DD Mon HH24:MI') as reads_after
from public.activities
where family_id = 'f1fd4dec-6377-4e0b-8c53-17e4ec62a25f'
  and created_at < timestamptz '2026-09-07 08:27:00+00'
order by start_at;

update public.activities
set start_at = start_at - interval '8 hours',
    end_at   = case when end_at is null then null else end_at - interval '8 hours' end
where family_id = 'f1fd4dec-6377-4e0b-8c53-17e4ec62a25f'
  and created_at < timestamptz '2026-09-07 08:27:00+00';

-- Deliberately scoped to the one household rather than every row before the
-- cutoff: the throwaway QA household's rows were inserted with their Manila
-- times already converted, so they are correct and must not move.

commit;

-- If a household is ever onboarded whose activities predate this fix, the same
-- correction applies to it -- but only if its members were typing Manila times.
-- Anyone in another zone typed something else, and there is no way to recover
-- which from the row alone. That is the argument for families.timezone landing
-- before a second household does.
