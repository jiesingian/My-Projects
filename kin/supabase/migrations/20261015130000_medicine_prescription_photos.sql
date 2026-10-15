-- Photos of a medicine's prescription (15 October, Janine): on a medicine's
-- card, "Prescription" takes a photo with the phone's camera or picks one
-- already taken, so the doctor's slip is there at the pharmacy counter.
--
-- WHO CAN SEE WHAT
--
-- Exactly whoever can see the medicine, as doses and visit photos are
-- (20260926110000): every policy here asks for the medicine under the
-- caller's own RLS, so a 'parents' or 'private' medicine's prescription is
-- hidden from the same people the medicine is. Only the household's own
-- members; nothing reaches a linked household.
--
-- The files sit in the journal bucket under <family id>/health/<medicine
-- id>/, as visit photos sit under the visit's id; that bucket's policies
-- confine them to the household, and the path check below keeps a row from
-- naming another household's file or another medicine's folder. New rows
-- are Kin Plus, like the medicine.

create table if not exists public.health_medicine_photos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  medicine_id uuid not null references public.health_medicines(id) on delete cascade,
  storage_path text not null,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint health_medicine_photos_path check (
    storage_path like family_id::text || '/health/' || medicine_id::text || '/%'
    and storage_path not like '%..%'
  )
);

create index if not exists health_medicine_photos_medicine_idx on public.health_medicine_photos (medicine_id);
create index if not exists health_medicine_photos_family_idx on public.health_medicine_photos (family_id);

alter table public.health_medicine_photos enable row level security;

drop policy if exists health_medicine_photos_select on public.health_medicine_photos;
create policy health_medicine_photos_select on public.health_medicine_photos for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.health_medicines m where m.id = medicine_id and m.family_id = (select public.current_family_id()))
  );

drop policy if exists health_medicine_photos_insert on public.health_medicine_photos;
create policy health_medicine_photos_insert on public.health_medicine_photos for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and exists (select 1 from public.health_medicines m where m.id = medicine_id and m.family_id = (select public.current_family_id()))
  );

drop policy if exists health_medicine_photos_delete on public.health_medicine_photos;
create policy health_medicine_photos_delete on public.health_medicine_photos for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.health_medicines m where m.id = medicine_id and m.family_id = (select public.current_family_id()))
  );

grant select, insert, delete on public.health_medicine_photos to authenticated;

drop trigger if exists require_kin_plus on public.health_medicine_photos;
create trigger require_kin_plus
  before insert on public.health_medicine_photos
  for each row execute function public.require_kin_plus('Medicines');
