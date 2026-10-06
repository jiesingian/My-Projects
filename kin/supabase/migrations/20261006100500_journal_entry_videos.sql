-- A video made from an entry's photos (approved by Jonathan, 30 September):
-- the "same-day edit" -- a title card, the photos with a slow zoom, a
-- crossfade, an end card, a little music -- made in the browser on the phone
-- and kept as the entry's cover. No video service is involved; the photos
-- never leave Kin.
--
-- One video per entry, in its own table rather than as another journal_media
-- row, for one reason: who may see it. A journal_media row is seen through a
-- chain of rules written for photos (household, personal, shared with linked
-- households, Public to connections), and a video there would also show up in
-- the Gallery and in every photo strip. Here the rule is a single line: you
-- may read the video exactly when you may read its entry. The subquery on
-- journal_entries runs with the reader's own rights, so every one of the
-- entry's policies -- today's and any added later -- decides for the video
-- too, and nothing has to be kept in step.
--
-- The files live in the journal bucket, under the household's folder
-- (<family>/videos/...) or, for a Just-me entry, the writer's own
-- (person/<person>/videos/...). Both already count toward the household's
-- Kin storage in family_storage_bytes(), so a video is paid for like a
-- photo, Free or Plus. The poster -- a still of the title card, shown before
-- the video loads -- sits beside it and is read by the same rule.
--
-- Nothing existing changes. Two storage policies are added:
-- * journal_video_read: a file a video row points at is readable by whoever
--   can read that row, i.e. whoever can read the entry. Needed for a linked
--   household (Family feed), a connection (Public), and the household reading
--   a video its writer made while the entry was still Just me.
-- * journal_video_household_delete: the household may delete the files of a
--   video on one of its own entries even when they sit in the writer's
--   folder, so replacing someone else's video does not leave the old one
--   behind, unreachable and still counted.

create table if not exists public.journal_entry_videos (
  entry_id uuid primary key references public.journal_entries(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  storage_path text not null,
  poster_path text not null,
  mime_type text not null check (mime_type ~ '^video/'),
  width int not null check (width between 16 and 4096),
  height int not null check (height between 16 and 4096),
  duration_seconds numeric not null check (duration_seconds > 0 and duration_seconds <= 90),
  look text not null default 'warm',
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists journal_entry_videos_storage_path_idx on public.journal_entry_videos (storage_path);
create index if not exists journal_entry_videos_poster_path_idx on public.journal_entry_videos (poster_path);
create index if not exists journal_entry_videos_family_idx on public.journal_entry_videos (family_id);

alter table public.journal_entry_videos enable row level security;

-- A file of this household's, or of the person making it.
create or replace function public.journal_video_path_ok(p_path text, p_family uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select split_part(p_path, '/', 1) = p_family::text
      or (split_part(p_path, '/', 1) = 'person'
          and split_part(p_path, '/', 2) = (select public.current_person_id())::text);
$$;

revoke execute on function public.journal_video_path_ok(text, uuid) from public, anon;
grant execute on function public.journal_video_path_ok(text, uuid) to authenticated;

drop policy if exists journal_entry_videos_select on public.journal_entry_videos;
create policy journal_entry_videos_select on public.journal_entry_videos
  for select to authenticated using (
    exists (select 1 from public.journal_entries e where e.id = journal_entry_videos.entry_id)
  );

drop policy if exists journal_entry_videos_insert on public.journal_entry_videos;
create policy journal_entry_videos_insert on public.journal_entry_videos
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and exists (
      select 1 from public.journal_entries e
      where e.id = journal_entry_videos.entry_id and e.family_id = journal_entry_videos.family_id
    )
    and public.journal_video_path_ok(storage_path, family_id)
    and public.journal_video_path_ok(poster_path, family_id)
  );

drop policy if exists journal_entry_videos_update on public.journal_entry_videos;
create policy journal_entry_videos_update on public.journal_entry_videos
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.journal_entries e where e.id = journal_entry_videos.entry_id and e.family_id = journal_entry_videos.family_id)
  )
  with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.journal_entries e where e.id = journal_entry_videos.entry_id and e.family_id = journal_entry_videos.family_id)
    and public.journal_video_path_ok(storage_path, family_id)
    and public.journal_video_path_ok(poster_path, family_id)
  );

drop policy if exists journal_entry_videos_delete on public.journal_entry_videos;
create policy journal_entry_videos_delete on public.journal_entry_videos
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.journal_entries e where e.id = journal_entry_videos.entry_id and e.family_id = journal_entry_videos.family_id)
  );

drop policy if exists journal_video_read on storage.objects;
create policy journal_video_read on storage.objects
  for select to authenticated using (
    bucket_id = 'journal'
    and exists (
      select 1 from public.journal_entry_videos v
      where v.storage_path = storage.objects.name or v.poster_path = storage.objects.name
    )
  );

drop policy if exists journal_video_household_delete on storage.objects;
create policy journal_video_household_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'journal'
    and exists (
      select 1 from public.journal_entry_videos v
      where (v.storage_path = storage.objects.name or v.poster_path = storage.objects.name)
        and v.family_id = (select public.current_family_id())
    )
  );
