-- Medicine alarms by Shortcut, removed (Jonathan, 28 October). The "Kin
-- Alarms" Shortcut link (20261023237000_dose_alarm_link.sql) was a free
-- stopgap until Kin's App Store app rings dose alarms itself (AlarmKit);
-- with the Apple Developer Program coming soon it goes, screen and all.
-- The table holds only link hashes, so nothing a family wrote is lost. The
-- in-app dose alarm (/today/dose, 20261022190000) is untouched.

drop trigger if exists dose_alarm_token_follows_member on public.members;
drop function if exists public.dose_alarm_token_follows_member();
drop function if exists public.dose_alarms_by_link(text, timestamptz);
drop function if exists public.dose_alarm_link_state();
drop function if exists public.clear_dose_alarm_token();
drop function if exists public.set_dose_alarm_token(text);
drop table if exists public.dose_alarm_tokens;
