-- "Start here" on Today (approved by Jonathan, 28 September).
--
-- A new family's first days on Today get a card with four first steps:
-- add an event, invite someone, add this month's bills (or, on Kin Free, a
-- chore for the kids), start the grocery list. Each ticks itself off from the
-- family's own records; nothing here tracks them. The card goes away when all
-- four are done, after the household's first 30 days, or when a member hides
-- it -- and that last one is what this column remembers, per member, so it
-- stays hidden on every phone they use. Null: not hidden.
--
-- Same shape as look_offer_answered_at (20260925090000): a nullable column
-- with no default, catalogue-only, no table rewrite. Not on the self-update
-- deny-list (status, is_organiser, role, family_id), so a member hides it for
-- themselves and nobody else. No policy change.
alter table public.members
  add column if not exists start_here_dismissed_at timestamptz;

comment on column public.members.start_here_dismissed_at is
  'When this member hid the "Start here" card on Today. Null: not hidden.';
