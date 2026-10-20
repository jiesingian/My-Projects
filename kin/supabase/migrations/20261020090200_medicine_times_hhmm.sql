-- A medicine's dose times are always HH:MM, 00:00 to 23:59.
--
-- due_reminders (20261019090001) and due_missed_dose_alerts (20261014200000)
-- cast each of health_medicines.times to time. parseTimes in the app only
-- ever writes "08:00", but RLS lets any member PATCH the column directly,
-- and one "8am" made '8am'::time raise inside due_reminders -- for every
-- household, on every tick, until someone fixed the row. The table now
-- refuses what the cast cannot read. Dev and production held no such value
-- when this was written (counted 20 October), so it is checked in full.

create or replace function public.times_are_hhmm(p_times text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from unnest(p_times) t
    where t is null or t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  )
$$;

alter table public.health_medicines drop constraint if exists health_medicines_times_hhmm;
alter table public.health_medicines add constraint health_medicines_times_hhmm check (public.times_are_hhmm(times));
