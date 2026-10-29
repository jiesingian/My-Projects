-- Government ID numbers move to their own table, readable only by the person
-- and their household's grown-ups (Jonathan, 29 October: legal readiness,
-- "Keep, grown-ups only", then "Yes, move them").
--
-- SSS, PhilHealth, Pag-IBIG and TIN numbers sat on members, and every login
-- in a household reads every member row (a child's own login included), so
-- a column could not be kept from anyone. Government ID numbers are
-- sensitive personal information under the Data Privacy Act, and a leak of
-- them enables identity fraud.
--
-- member_ids is keyed by person, so the numbers follow someone who moves
-- household (copy_membership needs nothing). Who:
--   reads:  the person; a parent or adult of a household they are in.
--   writes: the person; their household's organizer; a parent or adult for a
--           managed child (no login) -- the same people who may edit the
--           rest of a profile (actions/profile.ts).
-- The old columns are emptied and held empty by a check, and stay only so
-- that older functions naming them (copy_membership, the deletion job) keep
-- working.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- Present on dev and production since before September; named here so a
-- database built from the migrations alone (the PGlite probes) has them too.
alter table public.members add column if not exists sss_number text;
alter table public.members add column if not exists philhealth_number text;
alter table public.members add column if not exists pagibig_number text;
alter table public.members add column if not exists tin_number text;
alter table public.members add column if not exists is_organiser boolean not null default false;

create table if not exists public.member_ids (
  person_id uuid primary key references public.people(id) on delete cascade,
  sss_number text check (sss_number is null or char_length(sss_number) <= 30),
  philhealth_number text check (philhealth_number is null or char_length(philhealth_number) <= 30),
  pagibig_number text check (pagibig_number is null or char_length(pagibig_number) <= 30),
  tin_number text check (tin_number is null or char_length(tin_number) <= 30),
  updated_at timestamptz not null default now()
);

alter table public.member_ids enable row level security;

create or replace function public.can_read_member_ids(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_person = public.current_person_id()
      or exists (
        select 1
          from public.members me
          join public.members them on them.family_id = me.family_id
         where me.auth_user_id = auth.uid() and me.status = 'active' and me.role in ('parent', 'adult')
           and them.person_id = p_person and them.status in ('active', 'managed')
      );
$$;

create or replace function public.can_write_member_ids(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_person = public.current_person_id()
      or exists (
        select 1
          from public.members me
          join public.members them on them.family_id = me.family_id
         where me.auth_user_id = auth.uid() and me.status = 'active'
           and them.person_id = p_person and them.status in ('active', 'managed')
           and (me.is_organiser or (me.role in ('parent', 'adult') and them.status = 'managed'))
      );
$$;

revoke all on function public.can_read_member_ids(uuid) from public, anon;
revoke all on function public.can_write_member_ids(uuid) from public, anon;
grant execute on function public.can_read_member_ids(uuid) to authenticated;
grant execute on function public.can_write_member_ids(uuid) to authenticated;

drop policy if exists member_ids_select on public.member_ids;
create policy member_ids_select on public.member_ids for select to authenticated
  using (public.can_read_member_ids(person_id));
drop policy if exists member_ids_insert on public.member_ids;
create policy member_ids_insert on public.member_ids for insert to authenticated
  with check (public.can_write_member_ids(person_id));
drop policy if exists member_ids_update on public.member_ids;
create policy member_ids_update on public.member_ids for update to authenticated
  using (public.can_write_member_ids(person_id))
  with check (public.can_write_member_ids(person_id));
drop policy if exists member_ids_delete on public.member_ids;
create policy member_ids_delete on public.member_ids for delete to authenticated
  using (public.can_write_member_ids(person_id));

grant select, insert, update, delete on public.member_ids to authenticated;

-- Move what is there. Where one person has more than one member row (moved
-- household), the active one wins, then the most recent.
insert into public.member_ids (person_id, sss_number, philhealth_number, pagibig_number, tin_number)
select distinct on (m.person_id) m.person_id,
       nullif(btrim(m.sss_number), ''), nullif(btrim(m.philhealth_number), ''),
       nullif(btrim(m.pagibig_number), ''), nullif(btrim(m.tin_number), '')
  from public.members m
 where coalesce(nullif(btrim(m.sss_number), ''), nullif(btrim(m.philhealth_number), ''),
                nullif(btrim(m.pagibig_number), ''), nullif(btrim(m.tin_number), '')) is not null
 order by m.person_id, (m.status = 'active') desc, m.created_at desc
on conflict (person_id) do nothing;

update public.members
   set sss_number = null, philhealth_number = null, pagibig_number = null, tin_number = null
 where sss_number is not null or philhealth_number is not null or pagibig_number is not null or tin_number is not null;

alter table public.members drop constraint if exists members_ids_live_in_member_ids;
alter table public.members add constraint members_ids_live_in_member_ids
  check (sss_number is null and philhealth_number is null and pagibig_number is null and tin_number is null);

-- A deleted account's numbers go with it: when the job makes them a Former
-- member (no login, not active), as spending_budgets does (20261026100000).
create or replace function public.member_ids_sweep_former_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.member_ids where person_id = new.person_id;
  return new;
end;
$$;

revoke execute on function public.member_ids_sweep_former_member() from public, anon, authenticated;

drop trigger if exists member_ids_sweep_former_member on public.members;
create trigger member_ids_sweep_former_member
  after update of auth_user_id on public.members
  for each row
  when (old.auth_user_id is not null and new.auth_user_id is null and new.status <> 'active')
  execute function public.member_ids_sweep_former_member();
