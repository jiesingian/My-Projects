-- A colour each, chosen by the person it belongs to
-- =================================================
--
-- "Consider colour coding per family member, each family member should be
-- allowed to select or edit his/her colour representation."
--
-- SIX, AND FROM A LIST
--
-- Not a free hex field, for the reason already written into globals.css
-- above the wealth categories: past about seven, colours stop being
-- reliably tellable apart side by side, and a picker that offers sixteen
-- million of them mostly produces two family members in near-identical
-- blue. The six below are checked the same way the --cal-* set was, and
-- each is a token with a light and a dark value rather than one hex that
-- has to work on both.
--
-- It also keeps the calendar readable. The palette there already carries
-- meaning by category -- money, schedule, occasion, home -- and a member
-- colour has to sit alongside that rather than fight it, which it can only
-- do if it is drawn from a set somebody chose on purpose.
--
-- A name is always shown next to the colour, everywhere it appears, so the
-- colour never has to carry the meaning on its own.
--
-- WHY THERE IS NO NEW POLICY HERE
--
-- There does not need to be one, and that is worth stating so nobody adds
-- it later thinking it was forgotten. members_update_self already lets a
-- member write their own row, members_update_managed_by_parent lets a
-- grown-up write a managed child's, and the members_guard_self_update
-- trigger refuses changes to status, is_organiser, role and family_id --
-- a deny list, so a new ordinary column is editable by exactly the people
-- who should edit it, with no further work.

alter table public.members
  add column if not exists color text;

alter table public.members
  drop constraint if exists members_color_check;

alter table public.members
  add constraint members_color_check
  check (color is null or color in ('coral', 'amber', 'teal', 'indigo', 'violet', 'moss'));

comment on column public.members.color is
  'One of six palette tokens, or null to fall back to a colour derived from the member id. See lib/member-colours.ts.';
