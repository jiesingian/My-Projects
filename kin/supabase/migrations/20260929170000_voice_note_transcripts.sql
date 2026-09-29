-- Written transcripts of voice notes (Janine, 29 September).
--
-- The words are transcribed on the sender's own phone while they record --
-- the browser's speech recognition, the same one Ask Kin's microphone uses
-- (src/lib/speech.ts) -- and stored beside the file they belong to. Nothing
-- new leaves the phone except the text itself, and it is read by exactly the
-- people who can already play the voice note: the column rides the existing
-- row-level security of each attachment table, unchanged.
--
-- Optional and best effort: a browser without speech recognition, a quiet
-- room, or a language it does not follow simply leaves it null.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.family_message_attachments add column if not exists transcript text;
alter table public.family_message_attachments drop constraint if exists family_message_attachments_transcript_length;
alter table public.family_message_attachments
  add constraint family_message_attachments_transcript_length check (transcript is null or char_length(transcript) <= 5000);

alter table public.chat_room_attachments add column if not exists transcript text;
alter table public.chat_room_attachments drop constraint if exists chat_room_attachments_transcript_length;
alter table public.chat_room_attachments
  add constraint chat_room_attachments_transcript_length check (transcript is null or char_length(transcript) <= 5000);
