-- Regular income groups (Janine, 22 October)
-- ==========================================
--
-- WHAT IT IS
--
-- A regular income -- a salary, the rice business, rent from the bodega --
-- set up once: its name, source, usual amount, how often it comes, and if
-- wanted a monthly target. Each payment of it is an income_schedules row
-- carrying group_id, so it is expected, received and settled exactly as any
-- other income; when one is received the app lines up the next one. What a
-- group brought in this month is summed from those rows, never stored.
--
-- WHO SEES IT
--
-- The household's grown-ups (parents and adults), like utang and
-- paluwagan (20261019110000). Children and other households see nothing.
-- The payments themselves stay income_schedules rows under that table's
-- own policies, unchanged.
--
-- KIN PLUS
--
-- Wealth is Kin Plus, so the table carries require_kin_plus.

create table if not exists public.income_groups (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  category text,
  usual_amount numeric(14, 2) not null,
  frequency text not null default 'monthly',
  monthly_target numeric(14, 2),
  account_id uuid references public.accounts(id) on delete set null,
  recorded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint income_groups_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint income_groups_category_length check (category is null or char_length(category) <= 100),
  constraint income_groups_amount_positive check (usual_amount > 0 and usual_amount <= 100000000),
  constraint income_groups_target_positive check (monthly_target is null or (monthly_target > 0 and monthly_target <= 100000000)),
  constraint income_groups_frequency check (frequency in ('monthly', 'quarterly', 'yearly'))
);

create index if not exists income_groups_family_idx on public.income_groups (family_id);
create index if not exists income_groups_account_idx on public.income_groups (account_id);
create index if not exists income_groups_recorded_by_idx on public.income_groups (recorded_by);

alter table public.income_schedules add column if not exists group_id uuid references public.income_groups(id) on delete set null;
create index if not exists income_schedules_group_idx on public.income_schedules (group_id);

-- A payment's group must be its own household's: a forged group_id cannot
-- file one household's income under another's group.
create or replace function public.income_schedule_group_in_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.group_id is not null
    and not exists (select 1 from public.income_groups g where g.id = new.group_id and g.family_id = new.family_id) then
    raise exception 'income_group_not_in_family' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.income_schedule_group_in_family() from public, anon, authenticated;

drop trigger if exists income_schedule_group_in_family on public.income_schedules;
create trigger income_schedule_group_in_family
  before insert or update of group_id, family_id on public.income_schedules
  for each row execute function public.income_schedule_group_in_family();

alter table public.income_groups enable row level security;

drop policy if exists income_groups_select on public.income_groups;
create policy income_groups_select on public.income_groups
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

drop policy if exists income_groups_insert on public.income_groups;
create policy income_groups_insert on public.income_groups
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and recorded_by = (select public.current_member_id())
  );

drop policy if exists income_groups_update on public.income_groups;
create policy income_groups_update on public.income_groups
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  )
  with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

drop policy if exists income_groups_delete on public.income_groups;
create policy income_groups_delete on public.income_groups
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

drop trigger if exists require_kin_plus on public.income_groups;
create trigger require_kin_plus before insert on public.income_groups
  for each row execute function public.require_kin_plus('Wealth');
