-- A household's own special days (30 September): a Palace proclamation that
-- Nager.Date has not caught up with yet, a town fiesta, a school's day off.
-- They show beside the public holidays on the Planner and on Today
-- (lib/holidays), and like them have no Done or Skip.
--
-- Everyone in the household sees them; a grown-up adds or removes one --
-- the same line the Planner draws for anything the whole household plans
-- around. Nothing crosses households.

create table if not exists public.household_special_days (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  day date not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint household_special_days_once unique (family_id, day, name)
);

alter table public.household_special_days enable row level security;

drop policy if exists household_special_days_select on public.household_special_days;
create policy household_special_days_select on public.household_special_days
  for select to authenticated using (family_id = (select public.current_family_id()));

drop policy if exists household_special_days_insert on public.household_special_days;
create policy household_special_days_insert on public.household_special_days
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

drop policy if exists household_special_days_delete on public.household_special_days;
create policy household_special_days_delete on public.household_special_days
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

grant select, insert, delete on public.household_special_days to authenticated;
