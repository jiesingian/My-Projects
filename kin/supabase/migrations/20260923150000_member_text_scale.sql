-- Text size as a percentage rather than three words.
--
-- Settings offered Small, Default and Large -- 87.5%, 100% and 112.5% -- and
-- the largest of those is not large for anyone who actually needs large text.
-- The control becomes a slider from 85% to 300%, like the interface scale in
-- Telegram's settings, so the step anybody wants is one they can pick.
--
-- A new column rather than a reinterpreted one: text_size is left exactly as it
-- was, so nothing still reading it breaks, and the app stops writing it.

alter table public.members
  add column if not exists text_scale smallint not null default 100;

alter table public.members
  drop constraint if exists members_text_scale_range;
alter table public.members
  add constraint members_text_scale_range check (text_scale between 85 and 300);

-- Carry across what people already chose. The old Small becomes the new
-- floor, which is where the slider now starts; the old Large becomes 115%,
-- the nearest step on a slider that moves in fives.
update public.members set text_scale = 85  where text_size = 'small' and text_scale = 100;
update public.members set text_scale = 115 where text_size = 'large' and text_scale = 100;

-- No policy change. text_scale is not on the self-update deny-list
-- (status, is_organiser, role, family_id), so a member may set their own and,
-- as before, nobody else's.
