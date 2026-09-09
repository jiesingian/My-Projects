-- APPLIED 9 September, on Jonathan's instruction, and verified after with the
-- read-only check below. "How to run it" is at the foot and was followed.
--
-- Turning a stuck calendar sync into one set-aside item
-- ====================================================
--
-- What this is for
-- ----------------
-- Earlier today the sync stopped losing changes. It used to apply each change
-- Google reported, discard whatever went wrong, and save the new sync token
-- regardless -- and a Google sync token means "you have seen everything up to
-- here", so a change that failed to write into Kin was never sent again. Not
-- delayed: gone. Something a family member did on their phone simply never
-- arrived, and nothing anywhere said so.
--
-- The fix was to hold the token back whenever anything in the batch failed, so
-- Google sends it again and it heals itself. That was the right trade and it
-- carried a stated cost: an event that can NEVER apply -- one that trips a
-- constraint rather than hitting a passing fault -- holds the token still for
-- good, and no later change from that member gets through until somebody
-- looks. Stuck and loud instead of lossy and silent.
--
-- This is what removes the "for good". After a few attempts an event is set
-- aside, the token moves on, and the household is told which item was set
-- aside and why. Stuck becomes one item skipped and visible.
--
-- Worth saying plainly: no sync has ever been observed getting stuck. This is
-- built ahead of the problem because Jonathan asked for it, not because
-- anything is failing.
--
-- Why a table
-- -----------
-- The attempt count has to outlive the request. Everything else about a sync
-- is derivable from Google and from calendar_links; how many times we have
-- already tried one event is the one thing only we know.
--
-- Keyed by (member_id, google_event_id) because an event belongs to one
-- member's calendar -- the same Kin row synced to two members is two Google
-- events with two ids.
--
-- Scoped to the family like calendar_event_links, and for the same reason: the
-- sync runs as whoever triggered it, on the household's behalf, and everyone
-- in the household should be able to see what was set aside. There is nothing
-- private in it -- an event id and an error string -- and hiding it per member
-- would mean the person who could fix it might be the one who cannot see it.

begin;

create table if not exists public.calendar_sync_failures (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  -- Google's id for the event on that member's calendar.
  google_event_id text not null,
  -- How many syncs in a row this event has failed to apply. Reset by deleting
  -- the row, which is what happens the moment it succeeds.
  attempts integer not null default 1,
  -- The last thing that went wrong, as the application saw it. Kept so the
  -- household is told something better than "one item could not be applied".
  last_error text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint calendar_sync_failures_one_per_event unique (member_id, google_event_id)
);

alter table public.calendar_sync_failures enable row level security;

-- Mirrors calendar_event_links: one household, both directions.
drop policy if exists calendar_sync_failures_select on public.calendar_sync_failures;
create policy calendar_sync_failures_select on public.calendar_sync_failures
  for select using (family_id = current_family_id());

drop policy if exists calendar_sync_failures_write on public.calendar_sync_failures;
create policy calendar_sync_failures_write on public.calendar_sync_failures
  for all
  using (family_id = current_family_id())
  with check (family_id = current_family_id());

-- Every read is "what has this member failed on", so index that.
create index if not exists calendar_sync_failures_member_idx
  on public.calendar_sync_failures (member_id);

commit;


-- How to run it
-- =============
--
-- STEP 1 -- run everything above, from `begin;` to `commit;`.
--
-- Expect: "Success. No rows returned". Creating a table returns nothing, so
-- that message is correct here and says nothing about whether it worked.
-- Step 2 is the check. Safe to run twice: every statement is `if not exists`
-- or `drop ... if exists` first.
--
-- STEP 2 -- confirm it exists and is not readable by the whole world.
-- Read-only.
--
--   select c.relrowsecurity as rls_on,
--          (select count(*) from pg_policies p
--            where p.schemaname = 'public'
--              and p.tablename = 'calendar_sync_failures') as policies
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname = 'calendar_sync_failures';
--
-- Expect one row: rls_on = true, policies = 2. If rls_on is false, STOP and
-- say so -- a table without row-level security in this schema is readable
-- across households, and every other table here has it.
--
-- STEP 3 -- nothing. The table starts empty and stays empty unless a calendar
-- change actually fails to apply, which has never yet happened.
--
--
-- What it will look like if it ever fills up
-- ------------------------------------------
--   select m.full_name, f.google_event_id, f.attempts, f.last_error, f.last_seen_at
--     from calendar_sync_failures f
--     join members m on m.id = f.member_id
--    order by f.attempts desc, f.last_seen_at desc;
--
-- attempts below 3 is being retried; 3 or more has been set aside and the
-- sync has moved past it. Deleting a row puts that event back in the queue
-- the next time Google mentions it -- which, once the token has moved past
-- it, will be the next time somebody edits it.
--
-- To roll back: drop table public.calendar_sync_failures;
-- The application treats a missing table as "nothing has ever failed", so the
-- behaviour falls back to holding the token indefinitely -- which is where it
-- is today, and safe.
