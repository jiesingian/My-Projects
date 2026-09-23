-- Photos and files in chat.
--
-- The bytes go straight from the browser to Storage -- the documents bucket,
-- under <family_id>/chat/ -- the same way task attachments already do, which
-- keeps them clear of Vercel's 4.5MB request body cap. This table only indexes
-- them against the message they were sent with.
--
-- No storage policy change: every bucket here is already scoped by
-- (storage.foldername(name))[1] = current_family_id(), so a path under this
-- household's own prefix is readable and writable by this household and by
-- nobody else, whichever feature put it there.

create table if not exists public.family_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.family_messages(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  -- The order they were picked in, which is the order they are shown in.
  position smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint family_message_attachments_size_positive check (size_bytes > 0),
  constraint family_message_attachments_name_length check (char_length(file_name) between 1 and 255),

  -- The routine attachments check this in the server action. Here it is the
  -- table's own rule, because the browser holds the anon key and can insert
  -- a row without going through any action at all: an index row pointing at
  -- another household's file would be a way to ask Storage for a signed URL
  -- to something this household cannot otherwise name.
  constraint family_message_attachments_path_in_family
    check (split_part(storage_path, '/', 1) = family_id::text)
);

create index if not exists family_message_attachments_message_idx
  on public.family_message_attachments (message_id, position);

alter table public.family_message_attachments enable row level security;

drop policy if exists family_message_attachments_read on public.family_message_attachments;
create policy family_message_attachments_read on public.family_message_attachments
  for select using (family_id = current_family_id());

-- Only onto a message of your own. Without the ownership half, anyone in the
-- household could hang a file off somebody else's message and it would render
-- under their name -- the same hole the last migration closed for the message
-- itself, one table over.
drop policy if exists family_message_attachments_insert on public.family_message_attachments;
create policy family_message_attachments_insert on public.family_message_attachments
  for insert
  with check (
    family_id = current_family_id()
    and exists (
      select 1 from public.family_messages m
      where m.id = message_id
        and m.family_id = current_family_id()
        and m.member_id = current_member_id()
    )
  );

drop policy if exists family_message_attachments_delete on public.family_message_attachments;
create policy family_message_attachments_delete on public.family_message_attachments
  for delete
  using (
    family_id = current_family_id()
    and exists (
      select 1 from public.family_messages m
      where m.id = message_id
        and m.member_id = current_member_id()
    )
  );

-- A message may now be a photo and nothing else, so the body can be empty.
-- It was already NOT NULL with no length rule, so '' was always storable; this
-- is only the server action's check being relaxed, noted here so the schema
-- and the code do not disagree about what a message is.

do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid and p.pubname = 'supabase_realtime'
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname = 'family_message_attachments'
  ) then
    alter publication supabase_realtime add table public.family_message_attachments;
  end if;
end $$;
