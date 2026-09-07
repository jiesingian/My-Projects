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

-- Checked, on 7 September, against the deployed app
-- ------------------------------------------------
-- This correction is only right if the server is actually in Asia/Manila,
-- and that was an open question when the file was written: instrumentation.ts
-- sets the zone at runtime, and next dev renders in a worker pool that can be
-- forked before register() runs, so locally the same page came back in both
-- zones on the same machine. While a server is in UTC these rows read as the
-- times they were typed, everything looks correct, and shifting them by eight
-- hours is what would break them.
--
-- Production was then looked at directly, and it is in Manila. The five rows
-- below read exactly as this file predicts they would -- two of them on the
-- wrong day, not merely at the wrong time:
--
--     Study Math with Erynne       Tue 08 04:30   ->  Mon 07 20:30
--     Study Language with Erynne   Wed 09 04:30   ->  Tue 08 20:30
--     Erynne's Final Exam          Wed 09 20:30   ->  Wed 09 12:30
--     Erynne's Final Exam          Thu 10 20:30   ->  Thu 10 12:30
--     Diode                        Thu 10 22:00   ->  Thu 10 14:00
--
-- So the premise holds and this is safe to run. The cutoff below is 08:27 UTC,
-- fifty seconds before the deployment that moved the server; all five rows
-- predate it and nothing has been written since, so nothing correct is
-- touched.
--
-- Run the select on its own first anyway. It costs nothing, and it is the
-- last chance to notice that one of those times is not the one the family
-- remembers.

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
