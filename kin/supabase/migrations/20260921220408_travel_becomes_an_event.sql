-- Travel folded into events
-- =========================
--
-- A trip was its own table, its own form and its own button, and the only
-- thing it really had that an event did not was a second date. Everything
-- else -- who is going, a budget, a photo, a link to the journal entry it
-- became -- is a thing an event could just as well carry. The Planner had
-- already stopped showing them apart: the Events tab lists trips and events
-- in one date-sorted run.
--
-- So events grow the columns a trip needs, and travel becomes a kind of
-- event rather than a separate species.
--
-- This is the expand-and-migrate half. The trips tables are left in place,
-- holding what they held, and nothing reads them afterwards -- dropping them
-- is a later migration, once this has been live long enough to trust. A drop
-- in the same breath as a cutover is how a mistake becomes unrecoverable.

alter table public.events add column if not exists end_date date;
alter table public.events add column if not exists budget_amount numeric;
alter table public.events add column if not exists photo_storage_path text;
alter table public.events add column if not exists drive_file_id text;
alter table public.events add column if not exists drive_view_link text;
alter table public.events add column if not exists storage_provider text not null default 'supabase';
alter table public.events add column if not exists packed_count integer not null default 0;
alter table public.events add column if not exists packed_total integer not null default 0;
alter table public.events add column if not exists journal_entry_id uuid references public.journal_entries(id) on delete set null;

-- An end before its start is not a date range, it is a typo that reads as a
-- trip going backwards in the agenda.
alter table public.events drop constraint if exists events_end_after_start;
alter table public.events add constraint events_end_after_start
  check (end_date is null or end_date >= event_date);

-- 'travel' joins the kinds. The old list is kept exactly as it was.
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind = any (array['birthday', 'anniversary', 'school', 'health', 'travel', 'other']));

-- Every trip becomes an event, keeping its own id. Keeping the id is what
-- makes this safe to repeat and what keeps anything that referenced a trip
-- by id -- a ledger row, a calendar link -- pointing at the same thing.
insert into public.events (
  id, family_id, title, event_date, end_date, kind, recurs_yearly,
  applies_to_whole_family, budget_amount, photo_storage_path, drive_file_id,
  drive_view_link, storage_provider, packed_count, packed_total,
  journal_entry_id, created_by, created_at
)
select
  t.id, t.family_id, t.title, t.start_date, t.end_date, 'travel', false,
  t.applies_to_whole_family, t.budget_amount, t.photo_storage_path, t.drive_file_id,
  t.drive_view_link, coalesce(t.storage_provider, 'supabase'), t.packed_count, t.packed_total,
  t.journal_entry_id, t.created_by, t.created_at
from public.trips t
on conflict (id) do nothing;

-- ...and everyone who was travelling is now someone the event is for.
insert into public.event_members (event_id, member_id)
select tt.trip_id, tt.member_id
from public.trip_travellers tt
where exists (select 1 from public.events e where e.id = tt.trip_id)
on conflict do nothing;
