-- Whose are the events a member's Google Calendar brings in (Jonathan, 23
-- October, decision 2 of the Today finalisation). Until now a pulled event
-- landed tagged to the connecting member alone, so the for-me rule (Today
-- and the reminders, 28 September) hid it from the other grown-up: one
-- parent's Google calendar never reached the other's Today. The member now
-- chooses, on Settings -> Connected apps: share_with_family, on to begin
-- with, makes each pulled event the whole family's; off keeps them theirs.
-- Flipping it moves the events already pulled (lib/actions/settings).
--
-- Nothing else changes: the policies on calendar_links (a member reads and
-- updates their own row) already cover the new column.

alter table public.calendar_links
  add column if not exists share_with_family boolean not null default true;
