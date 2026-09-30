-- Forwarding a message to another conversation (Jonathan, 30 September --
-- "competitive with Telegram", item 1).
--
-- A forward is an ordinary new message, written by the person forwarding it
-- into a conversation they can already write in, through each table's own
-- insert policy. Nothing about who may read it changes: the copy is read by
-- the new conversation's people, under the new conversation's rules, and the
-- original stays exactly where it was.
--
-- The one new thing is a label: forwarded_from, the first name of whoever
-- wrote the original ("Forwarded from Mama"). It is text on purpose rather
-- than a reference to the original row. A reference would point across a
-- wall -- a message forwarded from a one-to-one into the household chat
-- would carry the id of a row nobody in the household may read -- and the
-- label is all anybody needs.
--
-- It is set by the server action from the original it has just read under
-- the forwarder's own session, so an honest forward is labelled truthfully.
-- A client using the anon key directly could write any name there; that is
-- no more than it could already type into the message itself ("Mama said:"),
-- so it is bounded (a first name, 60 characters) and not treated as proof.
--
-- Photos, videos and voice notes are copied, not shared: the server action
-- copies each file into the forwarder's own chat folder before attaching it,
-- so deleting the original never empties the forward, and the attachment
-- tables' existing checks (the path must be in the sender's own household's
-- folder) apply unchanged.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.family_messages add column if not exists forwarded_from text;
alter table public.family_tree_messages add column if not exists forwarded_from text;
alter table public.direct_messages add column if not exists forwarded_from text;
alter table public.chat_group_messages add column if not exists forwarded_from text;

alter table public.family_messages drop constraint if exists family_messages_forwarded_from_length;
alter table public.family_messages add constraint family_messages_forwarded_from_length
  check (forwarded_from is null or char_length(forwarded_from) between 1 and 60);
alter table public.family_tree_messages drop constraint if exists family_tree_messages_forwarded_from_length;
alter table public.family_tree_messages add constraint family_tree_messages_forwarded_from_length
  check (forwarded_from is null or char_length(forwarded_from) between 1 and 60);
alter table public.direct_messages drop constraint if exists direct_messages_forwarded_from_length;
alter table public.direct_messages add constraint direct_messages_forwarded_from_length
  check (forwarded_from is null or char_length(forwarded_from) between 1 and 60);
alter table public.chat_group_messages drop constraint if exists chat_group_messages_forwarded_from_length;
alter table public.chat_group_messages add constraint chat_group_messages_forwarded_from_length
  check (forwarded_from is null or char_length(forwarded_from) between 1 and 60);
