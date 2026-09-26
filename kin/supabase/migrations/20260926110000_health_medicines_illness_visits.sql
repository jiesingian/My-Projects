-- The Health tab's next four things (approved 26 September): medicines with
-- a "taken" tick per dose, an illness log for a sick day, and notes and
-- photos on a doctor's visit. (The emergency card, the weekly summary and
-- the growth charts read what is already here and need no tables.)
--
-- WHO CAN SEE WHAT
--
-- Each new record carries the same visibility the rest of Health uses --
-- 'family', 'parents' (the household's parent role, see KNOWN_RISKS.md for
-- what that means today) or 'private' (whoever wrote it) -- with one
-- addition the older tables lack: a person always sees records about
-- themselves. health_can_see() says it once so the four policies can't
-- drift apart.
--
-- A dose, a visit photo: they belong to a medicine or a visit and are seen
-- by exactly whoever can see that, because their policies ask the parent
-- row under the caller's own RLS rather than restating it.
--
-- Photos sit in the journal bucket under <family id>/health/, which that
-- bucket's policies already confine to the household; the path check below
-- keeps an index row from naming somebody else's file.

create or replace function public.health_can_see(p_family_id uuid, p_member_id uuid, p_visibility text, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_family_id = current_family_id()
    and (
      p_visibility = 'family'
      or p_member_id = current_member_id()
      or p_created_by = current_member_id()
      or (p_visibility = 'parents' and current_member_role() = 'parent')
    )
$$;

revoke all on function public.health_can_see(uuid, uuid, text, uuid) from public;
grant execute on function public.health_can_see(uuid, uuid, text, uuid) to authenticated;

-- ── medicines ──────────────────────────────────────────────────────────────

create table if not exists public.health_medicines (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  dose text check (dose is null or char_length(dose) <= 120),
  -- Times of day as 'HH:MM', in the family's time zone. Empty means "as
  -- needed": listed, never due.
  times text[] not null default '{}' check (array_length(times, 1) is null or array_length(times, 1) <= 8),
  start_date date not null default current_date,
  end_date date,
  notes text check (notes is null or char_length(notes) <= 1000),
  visibility text not null default 'family' check (visibility in ('family', 'parents', 'private')),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint health_medicines_dates check (end_date is null or end_date >= start_date)
);

create index if not exists health_medicines_member_idx on public.health_medicines (member_id);
create index if not exists health_medicines_family_idx on public.health_medicines (family_id);

create table if not exists public.health_medicine_doses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  medicine_id uuid not null references public.health_medicines(id) on delete cascade,
  dose_date date not null,
  dose_time text not null check (dose_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  taken_at timestamptz not null default now(),
  taken_by uuid references public.members(id) on delete set null,
  unique (medicine_id, dose_date, dose_time)
);

create index if not exists health_medicine_doses_family_idx on public.health_medicine_doses (family_id);

-- ── the illness log ────────────────────────────────────────────────────────

create table if not exists public.health_illness_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  logged_at timestamptz not null default now(),
  temperature_c numeric(4, 1) check (temperature_c is null or temperature_c between 30 and 45),
  symptoms text check (symptoms is null or char_length(symptoms) <= 300),
  given text check (given is null or char_length(given) <= 300),
  note text check (note is null or char_length(note) <= 1000),
  visibility text not null default 'family' check (visibility in ('family', 'parents', 'private')),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint health_illness_logs_something check (temperature_c is not null or symptoms is not null or given is not null or note is not null)
);

create index if not exists health_illness_logs_member_idx on public.health_illness_logs (member_id, logged_at desc);
create index if not exists health_illness_logs_family_idx on public.health_illness_logs (family_id);

-- ── for the growth charts ───────────────────────────────────────────────────
-- The WHO growth standards differ for girls and boys, and nothing on a
-- member said which; asked once, on the child's growth chart, and optional.
alter table public.members add column if not exists sex text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_sex_check') then
    alter table public.members add constraint members_sex_check check (sex is null or sex in ('female', 'male'));
  end if;
end
$$;

-- ── notes and photos on a visit ────────────────────────────────────────────

alter table public.health_appointments add column if not exists notes text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'health_appointments_notes_length') then
    alter table public.health_appointments add constraint health_appointments_notes_length check (notes is null or char_length(notes) <= 4000);
  end if;
end
$$;

create table if not exists public.health_visit_photos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  appointment_id uuid not null references public.health_appointments(id) on delete cascade,
  storage_path text not null,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint health_visit_photos_path check (storage_path like family_id::text || '/health/%' and storage_path not like '%..%')
);

create index if not exists health_visit_photos_appointment_idx on public.health_visit_photos (appointment_id);
create index if not exists health_visit_photos_family_idx on public.health_visit_photos (family_id);

-- ── row-level security ─────────────────────────────────────────────────────

alter table public.health_medicines enable row level security;
alter table public.health_medicine_doses enable row level security;
alter table public.health_illness_logs enable row level security;
alter table public.health_visit_photos enable row level security;

-- Medicines and the illness log: seen per visibility; written in your own
-- household, as yourself, about a member of it; changed or removed by
-- anyone who can see the row.
drop policy if exists health_medicines_select on public.health_medicines;
create policy health_medicines_select on public.health_medicines for select to authenticated
  using (health_can_see(family_id, member_id, visibility, created_by));
drop policy if exists health_medicines_insert on public.health_medicines;
create policy health_medicines_insert on public.health_medicines for insert to authenticated
  with check (
    family_id = (select current_family_id()) and created_by = (select current_member_id())
    and exists (select 1 from members m where m.id = member_id and m.family_id = (select current_family_id()))
    and (visibility <> 'parents' or (select current_member_role()) = 'parent')
  );
drop policy if exists health_medicines_update on public.health_medicines;
create policy health_medicines_update on public.health_medicines for update to authenticated
  using (health_can_see(family_id, member_id, visibility, created_by))
  with check (family_id = (select current_family_id()) and exists (select 1 from members m where m.id = member_id and m.family_id = (select current_family_id())));
drop policy if exists health_medicines_delete on public.health_medicines;
create policy health_medicines_delete on public.health_medicines for delete to authenticated
  using (health_can_see(family_id, member_id, visibility, created_by));

drop policy if exists health_illness_logs_select on public.health_illness_logs;
create policy health_illness_logs_select on public.health_illness_logs for select to authenticated
  using (health_can_see(family_id, member_id, visibility, created_by));
drop policy if exists health_illness_logs_insert on public.health_illness_logs;
create policy health_illness_logs_insert on public.health_illness_logs for insert to authenticated
  with check (
    family_id = (select current_family_id()) and created_by = (select current_member_id())
    and exists (select 1 from members m where m.id = member_id and m.family_id = (select current_family_id()))
    and (visibility <> 'parents' or (select current_member_role()) = 'parent')
  );
drop policy if exists health_illness_logs_delete on public.health_illness_logs;
create policy health_illness_logs_delete on public.health_illness_logs for delete to authenticated
  using (health_can_see(family_id, member_id, visibility, created_by));

-- Doses and visit photos: whoever can see the medicine or the visit.
drop policy if exists health_medicine_doses_select on public.health_medicine_doses;
create policy health_medicine_doses_select on public.health_medicine_doses for select to authenticated
  using (family_id = (select current_family_id()) and exists (select 1 from health_medicines m where m.id = medicine_id));
drop policy if exists health_medicine_doses_insert on public.health_medicine_doses;
create policy health_medicine_doses_insert on public.health_medicine_doses for insert to authenticated
  with check (
    family_id = (select current_family_id()) and taken_by = (select current_member_id())
    and exists (select 1 from health_medicines m where m.id = medicine_id and m.family_id = (select current_family_id()))
  );
drop policy if exists health_medicine_doses_delete on public.health_medicine_doses;
create policy health_medicine_doses_delete on public.health_medicine_doses for delete to authenticated
  using (family_id = (select current_family_id()) and exists (select 1 from health_medicines m where m.id = medicine_id));

drop policy if exists health_visit_photos_select on public.health_visit_photos;
create policy health_visit_photos_select on public.health_visit_photos for select to authenticated
  using (family_id = (select current_family_id()) and exists (select 1 from health_appointments a where a.id = appointment_id));
drop policy if exists health_visit_photos_insert on public.health_visit_photos;
create policy health_visit_photos_insert on public.health_visit_photos for insert to authenticated
  with check (
    family_id = (select current_family_id()) and created_by = (select current_member_id())
    and exists (select 1 from health_appointments a where a.id = appointment_id and a.family_id = (select current_family_id()))
  );
drop policy if exists health_visit_photos_delete on public.health_visit_photos;
create policy health_visit_photos_delete on public.health_visit_photos for delete to authenticated
  using (family_id = (select current_family_id()) and exists (select 1 from health_appointments a where a.id = appointment_id));
