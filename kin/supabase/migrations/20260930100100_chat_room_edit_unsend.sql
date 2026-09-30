-- Edit and unsend in the family room, one to one and groups (Jonathan,
-- 30 September -- "competitive with Telegram", item 3). The household chat
-- has had both since 20260923 (family_messages.edited_at / deleted_at); this
-- gives the other three conversations the same, the same way.
--
-- 1. COLUMNS -- edited_at and deleted_at on each table. A removed message
--    keeps its row and its place in the thread ("Message removed"), so the
--    replies around it still read; its words are blanked by the trigger
--    below, not left for the client to hide.
--
-- 2. WHO -- the writer, and only the writer: an update policy per table
--    matching the insert policy's "this is me" line. A group admin keeps the
--    delete they already had (chat_group_messages_delete) for anybody's
--    message; that is moderation, not unsending.
--
-- 3. WHAT -- only body and deleted_at may be written by a client (a
--    column-level grant). The author, the pair, the group, the reply, the
--    forwarded-from label and the timestamps stay as they were sent, whatever
--    the client asks. The trigger sets edited_at and deleted_at from the
--    clock, blanks a removed message, refuses an empty edit, and refuses any
--    change to a message already removed -- unsend is one way.
--
-- No time limit: the household chat has none, and one conversation behaving
-- differently from the next is worse than either rule.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.family_tree_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;
alter table public.direct_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;
alter table public.chat_group_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create or replace function public.chat_room_message_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'That message was removed.' using errcode = 'check_violation';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';
    new.edited_at := old.edited_at;
  else
    new.deleted_at := null;
    if new.body is distinct from old.body then
      if btrim(new.body) = '' then
        raise exception 'An edit needs some words. Unsend it instead.' using errcode = 'check_violation';
      end if;
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.chat_room_message_changed() from public, anon, authenticated;

drop trigger if exists family_tree_messages_changed on public.family_tree_messages;
create trigger family_tree_messages_changed
  before update on public.family_tree_messages
  for each row execute function public.chat_room_message_changed();
drop trigger if exists direct_messages_changed on public.direct_messages;
create trigger direct_messages_changed
  before update on public.direct_messages
  for each row execute function public.chat_room_message_changed();
drop trigger if exists chat_group_messages_changed on public.chat_group_messages;
create trigger chat_group_messages_changed
  before update on public.chat_group_messages
  for each row execute function public.chat_room_message_changed();

revoke update on public.family_tree_messages from anon, authenticated;
revoke update on public.direct_messages from anon, authenticated;
revoke update on public.chat_group_messages from anon, authenticated;
grant update (body, deleted_at) on public.family_tree_messages to authenticated;
grant update (body, deleted_at) on public.direct_messages to authenticated;
grant update (body, deleted_at) on public.chat_group_messages to authenticated;

drop policy if exists family_tree_messages_update_own on public.family_tree_messages;
create policy family_tree_messages_update_own on public.family_tree_messages
  for update to authenticated
  using (member_id = (select public.current_member_id()))
  with check (member_id = (select public.current_member_id()));

drop policy if exists direct_messages_update_own on public.direct_messages;
create policy direct_messages_update_own on public.direct_messages
  for update to authenticated
  using (sender_person_id = (select public.current_person_id()))
  with check (sender_person_id = (select public.current_person_id()));

drop policy if exists chat_group_messages_update_own on public.chat_group_messages;
create policy chat_group_messages_update_own on public.chat_group_messages
  for update to authenticated
  using (sender_person_id = (select public.current_person_id()))
  with check (sender_person_id = (select public.current_person_id()));
