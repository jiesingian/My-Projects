-- Pets (Jonathan, 29 October): the dog and the cat are family too, and they
-- have their own vaccines, vet visits and food. A household keeps each pet
-- with its kind, birthday, vet, and when its next vaccine and vet visit are
-- due; Today reminds the week before and on the day. Feeding is a chore
-- (routines, taking turns) and food goes on To-Buy, so neither needs a
-- table here.
--
-- Everyone in the household reads and keeps its pets, children included:
-- nothing here is private, and a child is often the one who knows when the
-- dog was last at the vet. Another household sees none of them.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  kind text not null default 'dog' check (kind in ('dog', 'cat', 'bird', 'fish', 'rabbit', 'other')),
  birthday date,
  food text check (food is null or char_length(food) <= 80),
  vet text check (vet is null or char_length(vet) <= 120),
  next_vaccine_on date,
  next_vet_on date,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pets_family_idx on public.pets (family_id);

alter table public.pets enable row level security;
revoke all on public.pets from public, anon, authenticated;
grant select, insert, update, delete on public.pets to authenticated;

drop policy if exists pets_select on public.pets;
create policy pets_select on public.pets for select to authenticated
  using (family_id = (select public.current_family_id()));

drop policy if exists pets_insert on public.pets;
create policy pets_insert on public.pets for insert to authenticated
  with check (family_id = (select public.current_family_id()));

drop policy if exists pets_update on public.pets;
create policy pets_update on public.pets for update to authenticated
  using (family_id = (select public.current_family_id()))
  with check (family_id = (select public.current_family_id()));

drop policy if exists pets_delete on public.pets;
create policy pets_delete on public.pets for delete to authenticated
  using (family_id = (select public.current_family_id()));

-- Who added a pet comes from the caller; the household and the date never move.
create or replace function public.pets_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := public.current_member_id();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.family_id := old.family_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.pets_stamp() from public, anon, authenticated;

drop trigger if exists pets_stamp on public.pets;
create trigger pets_stamp before insert or update on public.pets
  for each row execute function public.pets_stamp();
