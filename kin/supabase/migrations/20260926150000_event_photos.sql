-- Photos on a calendar event (26 September): the venue, the invitation card,
-- the day itself. Several per event, added from the event's own screen.
--
-- The files go in the journal bucket under <family id>/events/<event id>/,
-- which that bucket's policies confine to the household (as visit photos
-- do); the path check keeps an index row from naming another household's
-- file. Seen by the household, added by any member as themselves, removed by
-- any member of the household -- an event is the household's, not one
-- person's.
--
-- (events.photo_storage_path, a single "trip-photos" path from the old trip
-- card, was never written by anything and stays as it is.)

create table if not exists public.event_photos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  storage_path text not null,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint event_photos_path check (storage_path like family_id::text || '/events/%' and storage_path not like '%..%')
);

create index if not exists event_photos_event_idx on public.event_photos (event_id, created_at);
create index if not exists event_photos_family_idx on public.event_photos (family_id);

alter table public.event_photos enable row level security;

drop policy if exists event_photos_select on public.event_photos;
create policy event_photos_select on public.event_photos for select to authenticated
  using (family_id = (select current_family_id()));

drop policy if exists event_photos_insert on public.event_photos;
create policy event_photos_insert on public.event_photos for insert to authenticated
  with check (
    family_id = (select current_family_id())
    and created_by = (select current_member_id())
    and exists (select 1 from events e where e.id = event_id and e.family_id = (select current_family_id()))
  );

drop policy if exists event_photos_delete on public.event_photos;
create policy event_photos_delete on public.event_photos for delete to authenticated
  using (family_id = (select current_family_id()));
