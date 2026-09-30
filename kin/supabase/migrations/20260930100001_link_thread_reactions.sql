-- Reactions in the conversation between two linked households (Jonathan,
-- 30 September -- "competitive with Telegram", item 2: reactions on any
-- message).
--
-- Every other conversation already has the same six (the household chat's
-- family_message_reactions; the family room, one to one and groups share
-- chat_room_reactions). They are also the journal feed's six
-- (20260929034700), so the set does not change. The linked-household thread
-- (family_link_messages, 20260923170000) had none; it joins
-- chat_room_reactions as a fourth kind of message.
--
-- Who can see and add one is exactly who can read the message: the
-- select policy on family_link_messages (either household on an accepted
-- link) answers the EXISTS below, so revoking the link hides its reactions
-- at the same moment as its messages. The reactor's name and household are
-- still set by the existing trigger from the caller, never by the client.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.chat_room_reactions
  add column if not exists link_message_id uuid references public.family_link_messages(id) on delete cascade;

alter table public.chat_room_reactions drop constraint if exists chat_room_reactions_one_message;
alter table public.chat_room_reactions
  add constraint chat_room_reactions_one_message
  check (num_nonnulls(family_message_id, direct_message_id, group_message_id, link_message_id) = 1);

create unique index if not exists chat_room_reactions_link_once
  on public.chat_room_reactions (link_message_id, person_id, emoji) where link_message_id is not null;

drop policy if exists chat_room_reactions_select on public.chat_room_reactions;
create policy chat_room_reactions_select on public.chat_room_reactions
  for select to authenticated using (
    (
      exists (select 1 from public.family_tree_messages m where m.id = family_message_id)
      and (family_id = (select public.current_family_id()) or public.families_are_linked(family_id, (select public.current_family_id())))
    )
    or exists (select 1 from public.direct_messages d where d.id = direct_message_id)
    or exists (select 1 from public.chat_group_messages g where g.id = group_message_id)
    or exists (select 1 from public.family_link_messages l where l.id = link_message_id)
  );

drop policy if exists chat_room_reactions_insert on public.chat_room_reactions;
create policy chat_room_reactions_insert on public.chat_room_reactions
  for insert to authenticated with check (
    person_id = (select public.current_person_id())
    and (
      exists (select 1 from public.family_tree_messages m where m.id = family_message_id)
      or exists (select 1 from public.direct_messages d where d.id = direct_message_id)
      or exists (select 1 from public.chat_group_messages g where g.id = group_message_id)
      or exists (select 1 from public.family_link_messages l where l.id = link_message_id)
    )
  );
