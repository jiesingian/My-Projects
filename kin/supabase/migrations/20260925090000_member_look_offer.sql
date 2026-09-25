-- Kin's look follows its icon (item 3, agreed 25 September).
--
-- 1. Everyone whose profile is created from now on starts on the icon's warm
--    coral palette ("coral", defined in src/lib/palettes.ts) instead of Kin
--    Classic. Only the column default changes: no existing row is touched,
--    so nobody's look changes under them. Setting a default is a catalogue
--    change -- no table rewrite, no lock beyond an instant.
alter table public.members
  alter column palette set default 'coral';

-- 2. Everyone who already has a profile is offered the new look once, on
--    Today. This records that they answered -- yes or no -- so the offer
--    does not come back, on this device or any other. Null means not asked
--    yet. A nullable column with no default is also catalogue-only.
alter table public.members
  add column if not exists look_offer_answered_at timestamptz;

comment on column public.members.look_offer_answered_at is
  'When this member answered the one-time "try the new look" offer on Today (yes or no). Null: not answered yet.';

-- No policy change. Like palette and text_scale, this is not on the
-- self-update deny-list (status, is_organiser, role, family_id), so a member
-- answers for themselves and nobody else.
