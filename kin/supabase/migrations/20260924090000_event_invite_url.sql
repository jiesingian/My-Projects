-- A link to an event's invitation: an Evite, a Facebook event, a Paperless
-- Post, a wedding website.
--
-- Only the address is stored. The card the Planner shows for it -- title,
-- description, thumbnail -- is worked out on the server from the page itself
-- each time, the way chat's link previews are, and deliberately not kept
-- here: Kin ships the anon key to the browser, so a stored preview could be
-- written by any member to say anything, including a convincing card on a
-- link that goes somewhere else. Computed, it can only say what the page
-- says.
--
-- Nullable, additive, no backfill: no existing event has an invitation.
--
-- The CHECK is the floor under the server action's own validation: an http
-- or https address of sensible length, so nothing else -- a javascript: URL
-- above all, which would run when the card is tapped -- can be stored even by
-- a client writing to the table directly.

alter table public.events
  add column if not exists invite_url text;

alter table public.events
  drop constraint if exists events_invite_url_web;
alter table public.events
  add constraint events_invite_url_web check (
    invite_url is null or (invite_url ~* '^https?://' and length(invite_url) <= 2048)
  );

-- No policy change. events is family-scoped for select, insert, update and
-- delete, and a new column inherits all four.
