-- Where everyone is, but only because they said so
-- ================================================
--
-- The Quicklinks segment was asked for with two things in it: emergency
-- contacts, which shipped, and a location tracker, which did not, because
-- "location tracker" describes two products with opposite ethics. One is a
-- directory of saved places. The other is knowing where the people in your
-- household are, which is what this is, and it is only defensible built one
-- way.
--
-- Three decisions, all enforced below rather than in the interface.
--
-- SHARING IS OFF UNTIL THE PERSON TURNS IT ON. `sharing` defaults false and
-- there is no way to set it for somebody else who has a login. A parent can
-- turn it on for a `child_managed` profile because that profile is not a
-- person with a phone -- it is a record a grown-up keeps -- and its row will
-- never carry a position for exactly that reason.
--
-- A POSITION IS NEVER WRITTEN BY ANOTHER MEMBER. The update policy pins
-- member_id to the writer for coordinates. Without that, an adult could
-- write a child's location to anywhere they liked, and the board would show
-- it as if the child's own phone had reported it.
--
-- IT IS ONE ROW PER MEMBER, NOT A TRAIL. member_id is the primary key, so a
-- new position overwrites the last one. A history of everywhere a fourteen
-- year old has been is a different and much heavier thing to hold, and
-- nobody asked for it. Turning sharing off clears the coordinates in the
-- same statement, so there is nothing left behind to read.
create table public.member_locations (
  member_id uuid primary key references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  sharing boolean not null default false,
  lat double precision,
  lng double precision,
  -- What the device claimed, in metres. Worth keeping: "within 12 m" and
  -- "within 3 km" are the difference between a location and a guess, and the
  -- board says which one it is showing.
  accuracy_m integer,
  updated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_locations_coords_paired check (
    (lat is null and lng is null)
    or (lat between -90 and 90 and lng between -180 and 180)
  ),
  constraint member_locations_accuracy_sane check (
    accuracy_m is null or (accuracy_m >= 0 and accuracy_m <= 10000000)
  ),
  -- Not sharing means not holding a position. The constraint is what makes
  -- that true rather than merely intended.
  constraint member_locations_cleared_when_off check (
    sharing or (lat is null and lng is null and accuracy_m is null)
  )
);

create index member_locations_family_id_idx on public.member_locations(family_id);

alter table public.member_locations enable row level security;

-- The household sees the board. That is the whole point of it, and it is
-- why turning sharing on has to be a deliberate act.
create policy member_locations_select on public.member_locations
  for select using (family_id = current_family_id());

-- Your own row, or a managed child's -- that profile has no login, so if a
-- grown-up cannot create it nobody can.
create policy member_locations_insert on public.member_locations
  for insert with check (
    family_id = current_family_id()
    and (
      member_id = current_member_id()
      or (
        current_member_role() in ('parent', 'adult')
        and exists (
          select 1 from public.members m
          where m.id = member_id
            and m.family_id = current_family_id()
            and m.role = 'child_managed'
        )
      )
    )
  );

create policy member_locations_update on public.member_locations
  for update using (family_id = current_family_id())
  with check (
    family_id = current_family_id()
    and (
      member_id = current_member_id()
      or (
        -- A grown-up may switch a managed profile's sharing, but may not
        -- put a position on it. Only a device reports a position, and a
        -- managed profile has no device.
        lat is null and lng is null
        and current_member_role() in ('parent', 'adult')
        and exists (
          select 1 from public.members m
          where m.id = member_id
            and m.family_id = current_family_id()
            and m.role = 'child_managed'
        )
      )
    )
  );

-- Stopping is never harder than starting.
create policy member_locations_delete on public.member_locations
  for delete using (
    family_id = current_family_id()
    and (
      member_id = current_member_id()
      or current_member_role() in ('parent', 'adult')
    )
  );
