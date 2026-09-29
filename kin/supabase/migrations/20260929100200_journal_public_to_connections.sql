-- The Journal's Public feed: an entry its writer marks Public reaches the
-- people they are connected with (20260929060000), and nobody else (Janine,
-- 29 September: "Public" means "Connections only" -- inside or outside the
-- family tree). The Gallery tab becomes this feed.
--
-- * journal_entries.public_at: when the writer marked it Public; null is not.
--   Independent of visibility and shared_at -- a Just-me entry can go to
--   your connections without going to your household, and the reverse.
-- * Only the WRITER may mark it Public. A household entry can be edited by
--   anyone in the household (journal_entries_update), so without the trigger
--   below one person could publish another's entry to strangers. Anyone who
--   may edit the entry may take it back out; narrowing is always allowed.
-- * Readers: the writer, and anyone are_connected() with them right now. The
--   test is live, so removing a connection takes the entries away at once.
--   are_connected() answers only for the caller's own pairs, and is definer
--   so it can read a connections row the policy could not.
-- * Photos: only those the writer added themself (owner_person_id matching
--   the entry's), and only Kin-stored files -- a household's Google Drive
--   is fetched with that household's own token, which a connection has not
--   got, as on the Family feed. Marking an entry Public never publishes a
--   photo somebody else in the household put on it.
-- * Reactions and comments are unchanged: journal_talk_visible() goes by the
--   household and linked households, not this policy, so a connection reads
--   the entry and its photos and cannot write on it.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.journal_entries add column if not exists public_at timestamptz;

comment on column public.journal_entries.public_at is
  'When its writer (owner_person_id) marked it Public: readable by the people they are connected with. Null: not public.';

create index if not exists journal_entries_public_idx
  on public.journal_entries (owner_person_id, entry_date desc) where public_at is not null;

-- Only the writer turns it on.
create or replace function public.journal_public_by_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.public_at is not null
     and (tg_op = 'INSERT' or old.public_at is null)
     and new.owner_person_id is distinct from public.current_person_id()
     and coalesce(current_setting('kin.privileged', true), '') <> 'on' then
    raise exception 'Only the person who wrote this entry can make it public.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.journal_public_by_owner() from public, anon, authenticated;

-- Triggers of the same kind fire in name order: "z_" puts this after
-- journal_entries_set_owner, so on insert the owner is already filled in.
drop trigger if exists journal_entries_z_public_by_owner on public.journal_entries;
create trigger journal_entries_z_public_by_owner
  before insert or update of public_at on public.journal_entries
  for each row execute function public.journal_public_by_owner();

-- Is this entry public to the caller? Definer, like entry_shared_with_me():
-- the photo and file policies below ask it about rows they cannot read.
create or replace function public.entry_public_to_me(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journal_entries e
    where e.id = p_entry_id
      and e.public_at is not null
      and (e.owner_person_id = public.current_person_id()
        or public.are_connected(e.owner_person_id, public.current_person_id()))
  );
$$;

-- A photo, by id: the writer's own Kin-stored photo on an entry public to
-- the caller. Drive-backed rows are left out entirely rather than shown as a
-- photo nobody outside the household can fetch.
create or replace function public.media_public_to_me(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journal_entry_media jem
    join public.journal_media m on m.id = jem.media_id
    join public.journal_entries e on e.id = jem.entry_id
    where jem.media_id = p_media_id
      and m.storage_provider = 'supabase'
      and m.owner_person_id = e.owner_person_id
      and public.entry_public_to_me(e.id)
  );
$$;

-- A file in the journal bucket, by its path.
create or replace function public.journal_object_public_to_me(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journal_media m
    where m.storage_provider = 'supabase' and m.storage_path = p_name
      and public.media_public_to_me(m.id)
  );
$$;

revoke execute on function public.entry_public_to_me(uuid) from public, anon;
revoke execute on function public.media_public_to_me(uuid) from public, anon;
revoke execute on function public.journal_object_public_to_me(text) from public, anon;
grant execute on function public.entry_public_to_me(uuid) to authenticated;
grant execute on function public.media_public_to_me(uuid) to authenticated;
grant execute on function public.journal_object_public_to_me(text) to authenticated;

drop policy if exists journal_entries_select_public on public.journal_entries;
create policy journal_entries_select_public on public.journal_entries
  for select to authenticated using (
    public_at is not null
    and (owner_person_id = (select public.current_person_id())
      or public.are_connected(owner_person_id, (select public.current_person_id())))
  );

drop policy if exists journal_entry_media_select_public on public.journal_entry_media;
create policy journal_entry_media_select_public on public.journal_entry_media
  for select to authenticated using (public.media_public_to_me(media_id));

drop policy if exists journal_media_select_public on public.journal_media;
create policy journal_media_select_public on public.journal_media
  for select to authenticated using (public.media_public_to_me(id));

drop policy if exists journal_objects_select_public on storage.objects;
create policy journal_objects_select_public on storage.objects
  for select to authenticated
  using (bucket_id = 'journal' and public.journal_object_public_to_me(name));
