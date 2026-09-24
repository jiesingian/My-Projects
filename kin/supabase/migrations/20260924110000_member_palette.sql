-- A colour theme per member, picked in Settings → Appearance.
--
-- Separate from `theme`, which stays the light / dark / system switch: a
-- palette is which colours, the switch is which half of them. The list of
-- palettes lives in src/lib/palettes.ts; the check below only has to keep
-- the value to a short, plain id, so adding a palette is a code change and
-- not a migration. An id the app does not know falls back to Kin Classic.

alter table public.members
  add column if not exists palette text not null default 'classic';

alter table public.members
  drop constraint if exists members_palette_shape;
alter table public.members
  add constraint members_palette_shape check (palette ~ '^[a-z][a-z0-9-]{0,31}$');

-- No policy change. palette is not on the self-update deny-list
-- (status, is_organiser, role, family_id), so a member sets their own and
-- nobody else's, the same as text_scale.
