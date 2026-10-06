-- Saved messages: a private note-to-self conversation (Jonathan, 30 September
-- -- "competitive with Telegram", item 8).
--
-- One conversation per person, readable and writable by that person and
-- nobody else -- not their household, not a parent. It follows the person
-- (people.id), like chat_reads, so it goes with them if they start a
-- household of their own. Words, photos, videos and voice notes; anything in
-- another conversation can be forwarded here (the forward label travels).
--
-- 1. saved_messages -- person_id defaults to the caller and the policy
--    refuses any other, so a row can never be written into someone else's.
--
-- 2. Its photos go in chat_room_attachments like every room's, with a fourth
--    message column (saved_message_id). The attachment policies and
--    chat_room_object_visible (20260929162000, restated here with the one
--    new line each) let only the owner see, add or remove them; the path
--    rule (the sender's own household's chat folder) is unchanged.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.saved_messages (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null default public.current_person_id() references public.people(id) on delete cascade,
  body text not null default '',
  forwarded_from text,
  created_at timestamptz not null default now(),
  constraint saved_messages_body_length check (char_length(body) <= 4000),
  constraint saved_messages_forwarded_from_length check (forwarded_from is null or char_length(forwarded_from) between 1 and 60)
);

create index if not exists saved_messages_person_idx on public.saved_messages (person_id, created_at desc);

alter table public.saved_messages enable row level security;

drop policy if exists saved_messages_own on public.saved_messages;
create policy saved_messages_own on public.saved_messages
  for all to authenticated
  using (person_id = (select public.current_person_id()))
  with check (person_id = (select public.current_person_id()));

revoke update on public.saved_messages from anon, authenticated;

-- ---------------------------------------------------------------- photos

alter table public.chat_room_attachments
  add column if not exists saved_message_id uuid references public.saved_messages(id) on delete cascade;
alter table public.chat_room_attachments drop constraint if exists chat_room_attachments_one_message;
alter table public.chat_room_attachments
  add constraint chat_room_attachments_one_message
  check (num_nonnulls(family_message_id, direct_message_id, group_message_id, saved_message_id) = 1);
create index if not exists chat_room_attachments_saved_message_idx
  on public.chat_room_attachments (saved_message_id, position) where saved_message_id is not null;

drop policy if exists chat_room_attachments_select on public.chat_room_attachments;
create policy chat_room_attachments_select on public.chat_room_attachments
  for select to authenticated using (
    exists (select 1 from public.family_tree_messages m where m.id = family_message_id)
    or exists (select 1 from public.direct_messages d where d.id = direct_message_id)
    or exists (select 1 from public.chat_group_messages g where g.id = group_message_id)
    or exists (select 1 from public.saved_messages s where s.id = saved_message_id)
  );

drop policy if exists chat_room_attachments_insert on public.chat_room_attachments;
create policy chat_room_attachments_insert on public.chat_room_attachments
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and (
      exists (select 1 from public.family_tree_messages m where m.id = family_message_id and m.member_id = (select public.current_member_id()))
      or exists (select 1 from public.direct_messages d where d.id = direct_message_id and d.sender_person_id = (select public.current_person_id()))
      or exists (select 1 from public.chat_group_messages g where g.id = group_message_id and g.sender_person_id = (select public.current_person_id()))
      or exists (select 1 from public.saved_messages s where s.id = saved_message_id and s.person_id = (select public.current_person_id()))
    )
  );

drop policy if exists chat_room_attachments_delete on public.chat_room_attachments;
create policy chat_room_attachments_delete on public.chat_room_attachments
  for delete to authenticated using (
    exists (select 1 from public.family_tree_messages m where m.id = family_message_id and m.member_id = (select public.current_member_id()))
    or exists (select 1 from public.direct_messages d where d.id = direct_message_id and d.sender_person_id = (select public.current_person_id()))
    or exists (select 1 from public.chat_group_messages g where g.id = group_message_id and g.sender_person_id = (select public.current_person_id()))
    or exists (select 1 from public.saved_messages s where s.id = saved_message_id and s.person_id = (select public.current_person_id()))
  );

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
    left join public.chat_group_messages g on g.id = a.group_message_id
    left join public.saved_messages sv on sv.id = a.saved_message_id
    where a.storage_path = p_name
      and (
        (m.id is not null
          and (m.family_id = public.current_family_id()
            or public.families_are_linked(m.family_id, public.current_family_id())))
        or (d.id is not null and public.current_person_id() in (d.person_low, d.person_high))
        or (g.id is not null and public.is_group_member(g.group_id))
        or (sv.id is not null and sv.person_id = public.current_person_id())
      )
  );
$$;
