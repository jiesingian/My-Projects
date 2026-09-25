-- Relatives see the family's new memories without anybody having to share
-- each one -- photos included. Decided 25 September: once two households are
-- linked (both sides agreed, 20260922090000_family_links.sql), every new
-- journal entry and milestone reaches the other household automatically, and
-- so do the entry's photographs. One tap still takes a single entry back, and
-- the household switch below turns the automatic part off.
--
-- WHAT CHANGES
--
-- 1. families.share_with_relatives, on by default. While it is on, a new
--    journal entry or milestone is stamped shared_at the moment it is written
--    (a trigger, so every way of creating one -- typed in, added from the
--    planner, anything later -- does the same thing). Nothing already written
--    is touched: entries from before today stay exactly as shared or private
--    as they were.
--
-- 2. Photos of a shared entry cross too. Until now they stayed behind three
--    walls (the 20260922 migration's own words): journal_entry_media,
--    journal_media and the storage bucket. Each gets one additional SELECT
--    policy, and each says the same thing -- this row or file belongs to an
--    entry that is shared, from a household that is linked with the reader's.
--    Policies are OR'd, so nothing already allowed changes, and nothing is
--    writable across the wall: no insert, update or delete policy is added.
--
-- WHAT STILL DOES NOT CROSS
--
-- Who was tagged (journal_entry_people), money, health, documents, members.
-- Photos kept in the household's Google Drive rather than Kin's storage:
-- those are fetched with the household's own Drive connection, which another
-- household does not have and must not borrow. Comments and reactions on
-- photos stay in the household that wrote them (photo_in_my_household).
--
-- Revoking the link, or unsharing the entry, closes all of it at once,
-- because every policy here reads the link and the entry's shared_at live
-- rather than copying anything.

alter table public.families add column if not exists share_with_relatives boolean not null default true;

-- ── new memories are shared by default ─────────────────────────────────────

create or replace function public.share_new_memory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shared_at is null and exists (select 1 from families where id = new.family_id and share_with_relatives) then
    new.shared_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.share_new_memory() from public;

drop trigger if exists journal_entries_share_new on public.journal_entries;
create trigger journal_entries_share_new before insert on public.journal_entries
  for each row execute function public.share_new_memory();

drop trigger if exists milestones_share_new on public.milestones;
create trigger milestones_share_new before insert on public.milestones
  for each row execute function public.share_new_memory();

-- ── an entry's photos cross with it ────────────────────────────────────────

-- The entry is shared, belongs to another household, and that household is
-- linked with the caller's. Security definer so it can read the entry
-- whatever the caller's own policies say; it answers yes or no and nothing
-- else.
create or replace function public.entry_shared_with_me(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from journal_entries e
    where e.id = p_entry_id
      and e.shared_at is not null
      and e.family_id <> current_family_id()
      and families_are_linked(e.family_id, current_family_id())
  )
$$;

create or replace function public.media_shared_with_me(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from journal_entry_media jem
    where jem.media_id = p_media_id and entry_shared_with_me(jem.entry_id)
  )
$$;

-- For the storage policy: a file in the journal bucket, by its path.
create or replace function public.journal_object_shared_with_me(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from journal_media m
    where m.storage_provider = 'supabase' and m.storage_path = p_name and media_shared_with_me(m.id)
  )
$$;

revoke all on function public.entry_shared_with_me(uuid) from public;
revoke all on function public.media_shared_with_me(uuid) from public;
revoke all on function public.journal_object_shared_with_me(text) from public;
grant execute on function public.entry_shared_with_me(uuid) to authenticated;
grant execute on function public.media_shared_with_me(uuid) to authenticated;
grant execute on function public.journal_object_shared_with_me(text) to authenticated;

-- The storage policy looks photos up by path, and the media policy by id
-- through the join table.
create index if not exists journal_media_storage_path_idx on public.journal_media (storage_path) where storage_path is not null;
create index if not exists journal_entry_media_media_idx on public.journal_entry_media (media_id);

drop policy if exists journal_entry_media_select_linked on public.journal_entry_media;
create policy journal_entry_media_select_linked on public.journal_entry_media
  for select using (entry_shared_with_me(entry_id));

drop policy if exists journal_media_select_linked on public.journal_media;
create policy journal_media_select_linked on public.journal_media
  for select using (family_id <> current_family_id() and media_shared_with_me(id));

-- Reading the file itself: signing a URL runs as the reader, so without this
-- the linked household would see a photo row and a broken image.
drop policy if exists journal_objects_select_linked on storage.objects;
create policy journal_objects_select_linked on storage.objects
  for select to authenticated
  using (bucket_id = 'journal' and public.journal_object_shared_with_me(name));
