-- Emergency contacts, under Family's new Quicklinks segment
-- ============================================================
--
-- A short list a household keeps for exactly the moment it can least afford
-- to go looking for a phone number: the pediatrician, poison control, the
-- upstairs neighbour who has a spare key, a grandparent who lives five
-- minutes away. None of that is a Kin member -- it needs its own table
-- rather than a repurposed one.
--
-- Visibility follows the milestones/family_tree_people convention: any
-- signed-in member of the family can see and edit every row, because a list
-- like this is something a household keeps together, not something one
-- person owns -- the same reasoning that keeps it off the family_addresses
-- pattern, where only the organiser may write.
create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  relationship text not null,
  phone text not null,
  note text,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);

alter table public.emergency_contacts enable row level security;

create policy emergency_contacts_select on public.emergency_contacts
  for select using (family_id = current_family_id());

create policy emergency_contacts_insert on public.emergency_contacts
  for insert with check (family_id = current_family_id());

create policy emergency_contacts_update on public.emergency_contacts
  for update using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy emergency_contacts_delete on public.emergency_contacts
  for delete using (family_id = current_family_id());
