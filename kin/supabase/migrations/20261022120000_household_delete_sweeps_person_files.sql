-- No file is left behind in a member's own folder when its row goes
-- (BACKLOG, "Also open, older than this", 22 October).
--
-- A photo or video added from "Just me" -- personal, or added to the
-- household later -- has its file under journal/person/<person id>/, and
-- only that person may delete their own folder (journal_person_delete).
-- When its row is deleted by anyone else, or by a cascade, nobody removes
-- the file. Deleting a household is the plain case: every member's journal
-- rows go with it, as its confirmation says, but the organizer's sweep
-- (deleteHouseholdAction) can only reach the household's folders, so
-- members' private photos stayed in Storage for good, nameless and
-- unreadable.
--
-- Not fixed by widening who may delete in person/ folders: an organizer
-- must not be able to remove a member's private files at any other moment.
-- Instead, whenever a journal_media or journal_entry_videos row naming a
-- person/ file is deleted, however it happens, the path is noted in
-- public.storage_sweep in the same transaction; the daily account-deletions
-- job, which already removes files with the service role (20261021020000),
-- removes each one no row still names, and forgets it. Nobody else can read
-- or write the note. A file its owner already removed is simply gone.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.storage_sweep (
  bucket text not null,
  path text not null,
  queued_at timestamptz not null default now(),
  primary key (bucket, path)
);
alter table public.storage_sweep enable row level security;
revoke all on public.storage_sweep from public, anon, authenticated;
grant select, delete on public.storage_sweep to service_role;

/** After a journal photo or video row is deleted: its files in a person's
 * own folder are noted for the daily sweep. */
create or replace function public.queue_person_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old);
begin
  insert into public.storage_sweep (bucket, path)
  select 'journal', p
  from unnest(array[v_old->>'storage_path', v_old->>'poster_path']) p
  where p like 'person/%'
  on conflict do nothing;
  return old;
end;
$$;

do $$
begin
  if to_regclass('public.journal_media') is not null then
    drop trigger if exists journal_media_queue_person_files on public.journal_media;
    create trigger journal_media_queue_person_files after delete on public.journal_media
      for each row execute function public.queue_person_files();
  end if;
  if to_regclass('public.journal_entry_videos') is not null then
    drop trigger if exists journal_entry_videos_queue_person_files on public.journal_entry_videos;
    create trigger journal_entry_videos_queue_person_files after delete on public.journal_entry_videos
      for each row execute function public.queue_person_files();
  end if;
end
$$;

/** What the daily job is to remove: queued files no row still names. For
 * the job only (service role). */
create or replace function public.due_storage_sweep()
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.bucket, s.path from public.storage_sweep s
  where not exists (select 1 from public.journal_media m where m.storage_path = s.path)
    and not exists (select 1 from public.journal_entry_videos v where v.storage_path = s.path or v.poster_path = s.path)
  order by s.queued_at
  limit 1000
$$;

/** The daily job removed these: forget them. A list in the body, not a URL
 * filter, since a path holds whatever the file was called. For the job only
 * (service role). */
create or replace function public.forget_storage_sweep(p_bucket text, p_paths text[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.storage_sweep where bucket = p_bucket and path = any (p_paths) returning 1)
  select count(*)::integer from gone
$$;

revoke all on function public.queue_person_files() from public, anon, authenticated;
revoke all on function public.due_storage_sweep() from public, anon, authenticated;
revoke all on function public.forget_storage_sweep(text, text[]) from public, anon, authenticated;
grant execute on function public.due_storage_sweep() to service_role;
grant execute on function public.forget_storage_sweep(text, text[]) to service_role;
