-- Opt-in location sharing, finished (roadmap item 10). Built on
-- 20260922071500_member_locations, which already holds the rules that matter
-- most: nobody is on the board until they switch themselves on, a position is
-- only written by the device it belongs to, only the household can read it,
-- and switching off clears it. This adds:
--
-- 1. A pause. paused_until: while it is in the future the device does not
--    report and the position is cleared (the app clears it when pausing).
-- 2. A parent's okay for a child with their own login (child_self).
--    parent_ok: only a parent or another grown-up may change it, and such a
--    child cannot switch sharing on without it. Withdrawing the okay switches
--    sharing off and clears the position in the same write. A grown-up still
--    cannot switch a child's sharing on for them: the child decides, a
--    grown-up only allows it. (A managed profile, with no phone, is unchanged:
--    a grown-up keeps its switch, and it never has a position.)
-- 3. Saved places (household_places): home, school, work. Seen by the
--    household only; added, changed and removed by its grown-ups. A sharing
--    member's row records which place they are at (place_id), so the app can
--    tell an arrival from a stay and say "Ben arrived at School" once.
--
-- No history table. The roadmap allows up to 24 hours of history; nothing
-- needs it -- an arrival is told from the previous row -- so Kin keeps the
-- stricter rule it already had: one row per person, overwritten.

create table if not exists public.household_places (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null default 150 check (radius_m between 50 and 2000),
  notify boolean not null default true,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists household_places_family_id_idx on public.household_places(family_id);

alter table public.household_places enable row level security;

drop policy if exists household_places_select on public.household_places;
create policy household_places_select on public.household_places
  for select using (family_id = public.current_family_id());

drop policy if exists household_places_insert on public.household_places;
create policy household_places_insert on public.household_places
  for insert with check (
    family_id = public.current_family_id()
    and public.current_member_role() in ('parent', 'adult')
    and created_by = public.current_member_id()
  );

drop policy if exists household_places_update on public.household_places;
create policy household_places_update on public.household_places
  for update using (family_id = public.current_family_id() and public.current_member_role() in ('parent', 'adult'))
  with check (family_id = public.current_family_id() and public.current_member_role() in ('parent', 'adult'));

drop policy if exists household_places_delete on public.household_places;
create policy household_places_delete on public.household_places
  for delete using (family_id = public.current_family_id() and public.current_member_role() in ('parent', 'adult'));

alter table public.member_locations
  add column if not exists paused_until timestamptz,
  add column if not exists parent_ok boolean not null default false,
  add column if not exists place_id uuid references public.household_places(id) on delete set null;

-- A grown-up may now also write a child_self row -- to give or withdraw the
-- okay -- but never with a position on it, exactly as for a managed profile.
drop policy if exists member_locations_insert on public.member_locations;
create policy member_locations_insert on public.member_locations
  for insert with check (
    family_id = public.current_family_id()
    and (
      member_id = public.current_member_id()
      or (
        lat is null and lng is null
        and public.current_member_role() in ('parent', 'adult')
        and exists (
          select 1 from public.members m
          where m.id = member_id and m.family_id = public.current_family_id() and m.role in ('child_managed', 'child_self')
        )
      )
    )
  );

drop policy if exists member_locations_update on public.member_locations;
create policy member_locations_update on public.member_locations
  for update using (family_id = public.current_family_id())
  with check (
    family_id = public.current_family_id()
    and (
      member_id = public.current_member_id()
      or (
        lat is null and lng is null
        and public.current_member_role() in ('parent', 'adult')
        and exists (
          select 1 from public.members m
          where m.id = member_id and m.family_id = public.current_family_id() and m.role in ('child_managed', 'child_self')
        )
      )
    )
  );

-- What a policy cannot say, because it cannot see the row as it was.
create or replace function public.member_locations_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := (select m.role from public.members m where m.id = new.member_id);
  v_was_ok boolean := case when tg_op = 'UPDATE' then old.parent_ok else false end;
  v_was_sharing boolean := case when tg_op = 'UPDATE' then old.sharing else false end;
  v_by_self boolean := new.member_id is not distinct from public.current_member_id();
begin
  if new.parent_ok is distinct from v_was_ok
     and coalesce(public.current_member_role(), '') not in ('parent', 'adult') then
    raise exception 'Only a parent or another grown-up can okay a child''s location sharing.' using errcode = '42501';
  end if;

  if v_role = 'child_self' then
    -- The child decides; a grown-up only allows.
    if new.sharing and not v_was_sharing and not v_by_self then
      raise exception 'Only they can choose to share where they are.' using errcode = '42501';
    end if;
    if not new.parent_ok then
      if new.sharing and v_by_self then
        raise exception 'A parent needs to okay location sharing for you first.' using errcode = '42501';
      end if;
      new.sharing := false;
    end if;
  end if;

  if not new.sharing then
    new.lat := null;
    new.lng := null;
    new.accuracy_m := null;
    new.place_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists member_locations_guard on public.member_locations;
create trigger member_locations_guard
  before insert or update on public.member_locations
  for each row execute function public.member_locations_guard();
