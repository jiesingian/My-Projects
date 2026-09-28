-- The phone's own button, pointed at Kin (src/lib/quick-button.ts).
--
-- A Shortcut on the iPhone's Action Button or Back Tap opens one of three
-- fixed links -- /go/tap, /go/double, /go/hold -- and this column says where
-- each lands for this member, plus which button they set up (which only
-- changes the steps Settings shows). Shape:
--   {"button": "action", "tap": "open", "double": "ask", "hold": "talk"}
-- Empty means the defaults; the app fills in anything missing or unknown.
--
-- Written by the member themselves through members_update_self, like theme,
-- palette and text_scale. Nothing secret in it.

alter table public.members
  add column if not exists quick_actions jsonb not null default '{}'::jsonb;

alter table public.members
  drop constraint if exists members_quick_actions_object;
alter table public.members
  add constraint members_quick_actions_object
  check (jsonb_typeof(quick_actions) = 'object' and pg_column_size(quick_actions) < 1024);
