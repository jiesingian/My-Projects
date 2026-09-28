-- Albums for photos sent in the family chat (28 September), so they don't
-- disappear up the thread. After photos are sent, the sender is asked
-- whether to keep them in an album; albums are browsed from Chat -> Albums.
--
-- An album only points at photos already in the chat
-- (family_message_attachments), so the files and their household-folder
-- storage rules are unchanged, and a photo withdrawn from the chat leaves its
-- albums with it (on delete cascade).
--
-- Seen by the whole household. Anyone in it may start an album or add a
-- photo, as themselves. An album is renamed or removed by whoever started it
-- or a parent; a photo is taken out by whoever added it, the album's
-- starter, or a parent.

create table if not exists public.chat_albums (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chat_albums_name_length check (char_length(btrim(name)) between 1 and 80)
);

create index if not exists chat_albums_family_idx on public.chat_albums (family_id, created_at desc);

create table if not exists public.chat_album_photos (
  album_id uuid not null references public.chat_albums(id) on delete cascade,
  attachment_id uuid not null references public.family_message_attachments(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  added_by uuid references public.members(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (album_id, attachment_id)
);

create index if not exists chat_album_photos_attachment_idx on public.chat_album_photos (attachment_id);
create index if not exists chat_album_photos_family_idx on public.chat_album_photos (family_id);

alter table public.chat_albums enable row level security;
alter table public.chat_album_photos enable row level security;

drop policy if exists chat_albums_select on public.chat_albums;
create policy chat_albums_select on public.chat_albums for select to authenticated
  using (family_id = (select current_family_id()));

drop policy if exists chat_albums_insert on public.chat_albums;
create policy chat_albums_insert on public.chat_albums for insert to authenticated
  with check (family_id = (select current_family_id()) and created_by = (select current_member_id()));

drop policy if exists chat_albums_update on public.chat_albums;
create policy chat_albums_update on public.chat_albums for update to authenticated
  using (family_id = (select current_family_id()) and (created_by = (select current_member_id()) or (select current_member_role()) = 'parent'))
  with check (family_id = (select current_family_id()));

drop policy if exists chat_albums_delete on public.chat_albums;
create policy chat_albums_delete on public.chat_albums for delete to authenticated
  using (family_id = (select current_family_id()) and (created_by = (select current_member_id()) or (select current_member_role()) = 'parent'));

drop policy if exists chat_album_photos_select on public.chat_album_photos;
create policy chat_album_photos_select on public.chat_album_photos for select to authenticated
  using (family_id = (select current_family_id()));

-- Only this household's album, only this household's photo, and as yourself.
drop policy if exists chat_album_photos_insert on public.chat_album_photos;
create policy chat_album_photos_insert on public.chat_album_photos for insert to authenticated
  with check (
    family_id = (select current_family_id())
    and added_by = (select current_member_id())
    and exists (select 1 from public.chat_albums a where a.id = album_id and a.family_id = (select current_family_id()))
    and exists (
      select 1 from public.family_message_attachments f
      where f.id = attachment_id and f.family_id = (select current_family_id()) and f.mime_type like 'image/%'
    )
  );

drop policy if exists chat_album_photos_delete on public.chat_album_photos;
create policy chat_album_photos_delete on public.chat_album_photos for delete to authenticated
  using (
    family_id = (select current_family_id())
    and (
      added_by = (select current_member_id())
      or (select current_member_role()) = 'parent'
      or exists (select 1 from public.chat_albums a where a.id = album_id and a.created_by = (select current_member_id()))
    )
  );
