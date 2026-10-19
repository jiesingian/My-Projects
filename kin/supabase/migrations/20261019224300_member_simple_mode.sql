-- Simple Kin: a per-person switch for grown-ups over 60 (Jonathan, 19 October).
--
-- On, it gives that person bigger buttons and tap targets across the app and
-- a Today with only what a lolo or lola reaches for: their medicines to tick,
-- today's plans, calling or messaging the family, and SOS. Text size stays the
-- slider it is (text_scale); turning Simple Kin on raises it to at least 130%.
--
-- Per person, like text_scale and palette, so it follows them to every phone.

alter table public.members
  add column if not exists simple_mode boolean not null default false;

-- No policy change. simple_mode is not on the self-update deny-list
-- (status, is_organiser, role, family_id), so a member may set their own and,
-- as with text size, nobody else's.
