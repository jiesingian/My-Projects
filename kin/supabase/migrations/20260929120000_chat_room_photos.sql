-- Photos in the family-tree room and one-to-one conversations (Janine,
-- 29 September). The rooms themselves are 20260929090000.
--
-- WHERE THE FILES LIVE
--
-- Where the household chat's already do: the documents bucket, under the
-- sender's own '<household id>/chat/' folder, uploaded straight from the
-- phone. The bucket's existing policies let a household write and read its
-- own folder and nobody else's, so sending needs no new permission.
--
-- WHO MAY READ ONE
--
-- A reader in another household signs the photo's URL in their own session,
-- so without a storage policy they would see a message and a broken image.
-- chat_room_objects_select below lets them read exactly the files that are
-- attached to a room message they can already read:
--
--   * family room -- the message's household is theirs or linked with theirs
--     (the same line as family_tree_messages_select);
--   * one to one -- they are one of the two people.
--
-- Nothing else in anyone's chat/ folder becomes readable: the household
-- chat's own photos are not attached to a room message, so the policy never
-- answers yes for them. Revoking a link or deleting the message closes the
-- file in the same instant, because the policy reads the rows rather than
-- copying anything.
--
-- A message can now be a photo and nothing else, so the rooms' body checks
-- relax from "1 to 2000 characters" to "at most 2000"; the server action
-- still refuses a message with neither words nor a photo.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.family_tree_messages drop constraint if exists family_tree_messages_body_length;
alter table public.family_tree_messages
  add constraint family_tree_messages_body_length check (char_length(body) <= 2000);

alter table public.direct_messages drop constraint if exists direct_messages_body_length;
alter table public.direct_messages
  add constraint direct_messages_body_length check (char_length(body) <= 2000);

create table if not exists public.chat_room_attachments (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one of these: the room message the photo was sent with.
  family_message_id uuid references public.family_tree_messages(id) on delete cascade,
  direct_message_id uuid references public.direct_messages(id) on delete cascade,
  -- The sender's household: whose folder the file is in.
  family_id uuid not null references public.families(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint chat_room_attachments_one_message check (num_nonnulls(family_message_id, direct_message_id) = 1),
  constraint chat_room_attachments_size_positive check (size_bytes > 0),
  constraint chat_room_attachments_name_length check (char_length(file_name) between 1 and 255),
  constraint chat_room_attachments_is_image check (mime_type like 'image/%'),
  -- The file must be in the sender's own chat folder. Otherwise a row could
  -- point at another household's file and ask Storage to open it.
  constraint chat_room_attachments_path_in_family check (storage_path like family_id::text || '/chat/%')
);

create index if not exists chat_room_attachments_family_message_idx on public.chat_room_attachments (family_message_id, position) where family_message_id is not null;
create index if not exists chat_room_attachments_direct_message_idx on public.chat_room_attachments (direct_message_id, position) where direct_message_id is not null;
create index if not exists chat_room_attachments_path_idx on public.chat_room_attachments (storage_path);

alter table public.chat_room_attachments enable row level security;

-- Readable with the message: the subqueries run under the message tables' own
-- row-level security, so this can never be wider than the message.
drop policy if exists chat_room_attachments_select on public.chat_room_attachments;
create policy chat_room_attachments_select on public.chat_room_attachments
  for select to authenticated using (
    exists (select 1 from public.family_tree_messages m where m.id = family_message_id)
    or exists (select 1 from public.direct_messages d where d.id = direct_message_id)
  );

-- Only onto your own message, from your own household's folder.
drop policy if exists chat_room_attachments_insert on public.chat_room_attachments;
create policy chat_room_attachments_insert on public.chat_room_attachments
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and (
      exists (
        select 1 from public.family_tree_messages m
        where m.id = family_message_id and m.member_id = (select public.current_member_id())
      )
      or exists (
        select 1 from public.direct_messages d
        where d.id = direct_message_id and d.sender_person_id = (select public.current_person_id())
      )
    )
  );

drop policy if exists chat_room_attachments_delete on public.chat_room_attachments;
create policy chat_room_attachments_delete on public.chat_room_attachments
  for delete to authenticated using (
    exists (
      select 1 from public.family_tree_messages m
      where m.id = family_message_id and m.member_id = (select public.current_member_id())
    )
    or exists (
      select 1 from public.direct_messages d
      where d.id = direct_message_id and d.sender_person_id = (select public.current_person_id())
    )
  );

revoke update on public.chat_room_attachments from anon, authenticated;

-- For the storage policy: is this file attached to a room message the caller
-- may read? Definer rights because the message rows of another household are
-- exactly what the caller's own policies would otherwise have to be asked
-- about from inside storage; it answers yes or no about the caller only.
create or replace function public.chat_room_object_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_room_attachments a
    left join public.family_tree_messages m on m.id = a.family_message_id
    left join public.direct_messages d on d.id = a.direct_message_id
    where a.storage_path = p_name
      and (
        (m.id is not null
          and (m.family_id = public.current_family_id()
            or public.families_are_linked(m.family_id, public.current_family_id())))
        or (d.id is not null and public.current_person_id() in (d.person_low, d.person_high))
      )
  );
$$;

revoke execute on function public.chat_room_object_visible(text) from public, anon;
grant execute on function public.chat_room_object_visible(text) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects is missing; chat room photo policy not created';
    return;
  end if;
  execute 'drop policy if exists chat_room_objects_select on storage.objects';
  execute $p$
    create policy chat_room_objects_select on storage.objects
      for select to authenticated
      using (bucket_id = 'documents' and public.chat_room_object_visible(name))
  $p$;
end
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication is missing; chat_room_attachments not added';
    return;
  end if;
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid and p.pubname = 'supabase_realtime'
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname = 'chat_room_attachments'
  ) then
    alter publication supabase_realtime add table public.chat_room_attachments;
  end if;
end $$;
