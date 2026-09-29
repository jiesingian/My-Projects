-- Voice notes and short videos in the family-tree room and one-to-one
-- conversations (Janine, 29 September), beside the photos of 20260929120000.
--
-- Same files, same folder, same rules: uploaded from the phone to the
-- sender's own '<household>/chat/' folder (the upload route already takes
-- audio and video up to 50MB for chat), indexed in chat_room_attachments,
-- and readable in another household only through chat_room_objects_select --
-- when the file is attached to a room message they can read. The only change
-- is which kinds of file the table accepts.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.chat_room_attachments drop constraint if exists chat_room_attachments_is_image;
alter table public.chat_room_attachments drop constraint if exists chat_room_attachments_is_media;
alter table public.chat_room_attachments
  add constraint chat_room_attachments_is_media check (mime_type ~ '^(image|video|audio)/');
