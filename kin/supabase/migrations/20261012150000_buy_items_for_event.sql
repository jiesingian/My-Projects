-- Things to buy, grouped under the household's events (12 October, Janine).
--
-- A line on the Household tab's list can now say which event it is for --
-- the balloons for Robin's birthday, the ice for the reunion -- and the list
-- can be read grouped by event as well as by aisle. Optional: most of the
-- weekly shop is for no event at all, and stays event_id null.
--
-- Deleting the event leaves the line on the list, just no longer grouped
-- under it (on delete set null): what still needs buying does not vanish
-- because the party was taken off the calendar.
--
-- Row-level security: buy_items' own policies already keep a line inside its
-- household. What they cannot see is the event a line points at, so a trigger
-- checks it: the event must be in the same household as the line. It runs as
-- the caller (not security definer) on purpose -- an event the caller cannot
-- read is one they cannot attach to -- and compares family_id itself rather
-- than trusting visibility alone, because a linked family's shared occasions
-- are readable but are not this household's events.

alter table public.buy_items
  add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists buy_items_event_idx on public.buy_items (event_id) where event_id is not null;

create or replace function public.buy_items_event_same_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_id is not null and not exists (
    select 1 from public.events e where e.id = new.event_id and e.family_id = new.family_id
  ) then
    raise exception 'That event is not one of this household''s.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists buy_items_event_same_household on public.buy_items;
create trigger buy_items_event_same_household
  before insert or update of event_id, family_id on public.buy_items
  for each row execute function public.buy_items_event_same_household();
