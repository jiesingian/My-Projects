-- The grown-ups of one household are connected from the start.
--
-- A connection (20260929060000) is what lets two people message one to one,
-- and it starts two-sided: nobody is connected until the other says yes.
-- That consent is right between households and for a child; between the two
-- parents of one household it was a form in the way. "New message" on Chat
-- sent a parent to Connections, where their own spouse sat under "In your
-- family" with a Connect button, and a direct message between them was
-- refused at the database until it was accepted (21 October audit).
--
-- This connects, as 'accepted' and via 'tree', every pair of active grown-ups
-- (role parent or adult) of one household who both have a login: once for the
-- households already here, and from now on whenever a grown-up becomes active
-- in a household (joins, is approved, is reinstated). Everything else about a
-- connection stays as it was:
--   - either of them may still remove it (remove_connection), and a pair with
--     any row between them already, live or ended, is never touched again, so
--     a removal is final until one of them asks the other;
--   - children are not connected by this: a child's connections still go
--     through connection_needs_guardian;
--   - are_connected() and my_connected_person_ids() are unchanged, so the
--     Journal's "Public" entries (connections only, 20260929100200) reach a
--     household's other grown-up as they reach any connection. That is the one
--     widening, and it is on purpose: the household already sees the household
--     journal, and a grown-up who wants a Public entry away from their spouse
--     removes the connection like any other.

-- Connects the grown-ups of one household who are not yet connected and have
-- never been. Internal: nothing but the trigger below and this migration's
-- backfill calls it, so no role may execute it.
create or replace function public.connect_household_grownups(p_family uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.connections (requester_person_id, addressee_person_id, status, via, requested_at, decided_at)
  select a.person_id, b.person_id, 'accepted', 'tree', now(), now()
  from public.members a
  join public.members b
    on b.family_id = a.family_id
   and b.person_id > a.person_id
  join public.people pa on pa.id = a.person_id and pa.auth_user_id is not null
  join public.people pb on pb.id = b.person_id and pb.auth_user_id is not null
  where a.family_id = p_family
    and a.status = 'active' and b.status = 'active'
    and a.role in ('parent', 'adult') and b.role in ('parent', 'adult')
    and not exists (
      select 1 from public.connections c
      where (c.requester_person_id = a.person_id and c.addressee_person_id = b.person_id)
         or (c.requester_person_id = b.person_id and c.addressee_person_id = a.person_id)
    );
$$;

revoke execute on function public.connect_household_grownups(uuid) from public, anon, authenticated;

-- A grown-up becoming active in a household (a join approved, a reinstatement,
-- a role changed to grown-up, a login attached) connects them with the
-- household's other grown-ups. Only a change does it: saving a member row with
-- the same status, role and person does not bring a removed connection back.
create or replace function public.members_connect_grownups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and new.role in ('parent', 'adult') and new.person_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.role is distinct from new.role or old.person_id is distinct from new.person_id) then
    perform public.connect_household_grownups(new.family_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.members_connect_grownups() from public, anon, authenticated;

drop trigger if exists members_connect_grownups on public.members;
create trigger members_connect_grownups
  after insert or update of status, role, person_id on public.members
  for each row execute function public.members_connect_grownups();

-- The households already here.
do $$
declare f record;
begin
  for f in select id from public.families loop
    perform public.connect_household_grownups(f.id);
  end loop;
end $$;
