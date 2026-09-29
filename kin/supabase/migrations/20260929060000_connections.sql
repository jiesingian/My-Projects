-- Connections: one person to another (Janine, 29 September).
--
-- A connection is between two PEOPLE (people.id, 20260928185000), not two
-- memberships, so it survives moving house: someone who starts their own
-- household keeps the people they are connected with. It is also what the
-- Journal's future "Connections only" audience reads -- are_connected() and
-- my_connected_person_ids() below are the two questions it needs, asked in
-- the database so the feed and the chat can never disagree about who is in.
--
-- HOW TWO PEOPLE CONNECT
--
--   * Inside the family tree: anyone in your own household, or in a household
--     linked with yours that shares with relatives (can_see_occasions_of --
--     the same people whose names already reach you on the family feed and on
--     a relative's profile). connection_candidates() lists them.
--   * Outside it: by a personal code (or a link carrying it) that the other
--     person chose to hand you. Holding the code is the permission to ASK,
--     not to connect -- it makes a request like any other.
--
-- Either way a connection starts 'pending' and does nothing until the person
-- asked accepts it. Either side can end it at any time, alone. That is the
-- same consent shape as family_links: two-sided to start, one-sided to stop.
--
-- WHAT A CONNECTION REVEALS, AND TO WHOM
--
-- The connections table is readable only by the two people on a row. Names
-- and photos never come from it: my_connections() looks them up with definer
-- rights and returns them only for
--   * an accepted connection (both said yes), and
--   * a request made TO you (the asker revealed themselves by asking), and
--   * a request you made to someone whose name you could already see (your
--     household, or a linked household sharing with relatives).
-- A request you made by code shows as "Request sent" with no name until they
-- accept -- so a code that leaks, or is guessed, never turns into a lookup of
-- whose it is.
--
-- CHILDREN
--
-- A child with a login may connect inside the family tree only. Codes are for
-- grown-ups: a child can neither have one nor use one, so nobody outside the
-- family can reach a child through this.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_person_id uuid not null references public.people(id) on delete cascade,
  addressee_person_id uuid not null references public.people(id) on delete cascade,
  status text not null default 'pending',
  -- 'tree' or 'code': how it was asked, which decides whether the asker may
  -- see the other's name before they accept.
  via text not null default 'tree',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  ended_by uuid references public.people(id) on delete set null,
  constraint connections_status_check check (status in ('pending', 'accepted', 'declined', 'removed')),
  constraint connections_via_check check (via in ('tree', 'code')),
  constraint connections_not_self check (requester_person_id <> addressee_person_id)
);

-- One live connection per pair, whichever way round it was asked. Declined
-- and removed rows stay as history and do not block asking again.
create unique index if not exists connections_pair_live_idx
  on public.connections (least(requester_person_id, addressee_person_id), greatest(requester_person_id, addressee_person_id))
  where status in ('pending', 'accepted');

create index if not exists connections_requester_idx on public.connections (requester_person_id);
create index if not exists connections_addressee_idx on public.connections (addressee_person_id);

alter table public.connections enable row level security;

drop policy if exists connections_select on public.connections;
create policy connections_select on public.connections
  for select to authenticated using (
    (select public.current_person_id()) in (requester_person_id, addressee_person_id)
  );

-- Every write goes through the functions below, so there is deliberately no
-- insert, update or delete policy: nobody can write a row naming a stranger
-- and call it accepted.
revoke insert, update, delete on public.connections from anon, authenticated;

-- A person's own code for being asked from outside the family. Readable only
-- by its owner; made and replaced by the functions below.
create table if not exists public.connection_codes (
  person_id uuid primary key references public.people(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint connection_codes_code_check check (code ~ '^[A-Z2-9]{8}$')
);

alter table public.connection_codes enable row level security;

drop policy if exists connection_codes_select on public.connection_codes;
create policy connection_codes_select on public.connection_codes
  for select to authenticated using (person_id = (select public.current_person_id()));

revoke insert, update, delete on public.connection_codes from anon, authenticated;

-- ---------------------------------------------------------------- questions

-- Are these two people connected right now? Definer rights because the row
-- is only readable by the two on it, and the Journal will ask this about an
-- author and a reader. It answers only when the caller is one of the two --
-- about anybody else's pair it says false, so it cannot be used to map who
-- knows whom.
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null
    and public.current_person_id() in (a, b)
    and exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_person_id = a and c.addressee_person_id = b)
        or (c.requester_person_id = b and c.addressee_person_id = a))
  );
$$;

revoke execute on function public.are_connected(uuid, uuid) from public, anon;
grant execute on function public.are_connected(uuid, uuid) to authenticated;

-- Everyone the caller is connected with, as people ids.
create or replace function public.my_connected_person_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.requester_person_id = public.current_person_id() then c.addressee_person_id else c.requester_person_id end
  from public.connections c
  where c.status = 'accepted'
    and public.current_person_id() in (c.requester_person_id, c.addressee_person_id);
$$;

revoke execute on function public.my_connected_person_ids() from public, anon;
grant execute on function public.my_connected_person_ids() to authenticated;

-- The membership a person is known by: their active one, newest first.
create or replace function public.person_active_member(p_person_id uuid)
returns public.members
language sql
stable
security definer
set search_path = ''
as $$
  select m.* from public.members m
  where m.person_id = p_person_id and m.status = 'active'
  order by m.created_at desc
  limit 1;
$$;

-- Internal: names travel only through the functions in this file.
revoke execute on function public.person_active_member(uuid) from public, anon, authenticated;

-- Could the caller already see this person's name without a connection? Their
-- own household, or a linked household that shares with relatives.
create or replace function public.person_in_my_tree(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.person_id = p_person_id
      and m.status = 'active'
      and public.can_see_occasions_of(m.family_id)
  );
$$;

revoke execute on function public.person_in_my_tree(uuid) from public, anon;
grant execute on function public.person_in_my_tree(uuid) to authenticated;

-- The caller's connections and open requests, with the name and photo of the
-- other person only where the rules at the top allow it.
create or replace function public.my_connections()
returns table (
  id uuid,
  person_id uuid,
  member_id uuid,
  full_name text,
  avatar_url text,
  household_name text,
  status text,
  incoming boolean,
  via text,
  requested_at timestamptz,
  decided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_person_id();
  r record;
  other uuid;
  mem public.members;
  named boolean;
begin
  if me is null then return; end if;
  for r in
    select c.* from public.connections c
    where c.status in ('pending', 'accepted') and me in (c.requester_person_id, c.addressee_person_id)
    order by c.status, coalesce(c.decided_at, c.requested_at) desc
  loop
    other := case when r.requester_person_id = me then r.addressee_person_id else r.requester_person_id end;
    mem := public.person_active_member(other);
    named := r.status = 'accepted'
      or r.addressee_person_id = me
      or (r.via = 'tree' and public.person_in_my_tree(other));

    id := r.id;
    person_id := other;
    member_id := case when named then mem.id end;
    full_name := case when named then coalesce(mem.full_name, 'Someone') end;
    avatar_url := case when named then mem.avatar_url end;
    household_name := case when named and mem.family_id is not null then (select f.name from public.families f where f.id = mem.family_id) end;
    status := r.status;
    incoming := r.addressee_person_id = me;
    via := r.via;
    requested_at := r.requested_at;
    decided_at := r.decided_at;
    return next;
  end loop;
end;
$$;

revoke execute on function public.my_connections() from public, anon;
grant execute on function public.my_connections() to authenticated;

-- People in the caller's family tree who have a login and are not already
-- connected with them or waiting on a request: the list "Connect" offers.
create or replace function public.connection_candidates()
returns table (person_id uuid, member_id uuid, full_name text, avatar_url text, household_name text, same_household boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.person_id, m.id, m.full_name, m.avatar_url, f.name, m.family_id = public.current_family_id()
  from public.members m
  join public.families f on f.id = m.family_id
  join public.people p on p.id = m.person_id
  where m.status = 'active'
    and p.auth_user_id is not null
    and m.person_id <> public.current_person_id()
    and public.can_see_occasions_of(m.family_id)
    and not exists (
      select 1 from public.connections c
      where c.status in ('pending', 'accepted')
        and ((c.requester_person_id = public.current_person_id() and c.addressee_person_id = m.person_id)
          or (c.requester_person_id = m.person_id and c.addressee_person_id = public.current_person_id()))
    )
  order by m.family_id = public.current_family_id() desc, f.name, m.full_name;
$$;

revoke execute on function public.connection_candidates() from public, anon;
grant execute on function public.connection_candidates() to authenticated;

-- ------------------------------------------------------------------- writes

-- Who is calling, as a person with an active membership; raises otherwise.
create or replace function public.connection_caller()
returns public.members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me public.members;
begin
  select m.* into me from public.members m
  where m.auth_user_id = auth.uid() and m.status = 'active'
  limit 1;
  if me.id is null then raise exception 'Not a member of any household.'; end if;
  return me;
end;
$$;

revoke execute on function public.connection_caller() from public, anon, authenticated;

-- Shared by both ways of asking. A request the other person had already made
-- to the caller is accepted instead: two people asking each other agree.
create or replace function public.connection_open(p_me uuid, p_target uuid, p_via text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing public.connections;
  new_id uuid;
begin
  if p_target = p_me then raise exception 'That is you.'; end if;

  select c.* into existing from public.connections c
  where c.status in ('pending', 'accepted')
    and ((c.requester_person_id = p_me and c.addressee_person_id = p_target)
      or (c.requester_person_id = p_target and c.addressee_person_id = p_me));

  if existing.id is not null then
    if existing.status = 'pending' and existing.addressee_person_id = p_me then
      update public.connections set status = 'accepted', decided_at = now() where id = existing.id;
    end if;
    return existing.id;
  end if;

  insert into public.connections (requester_person_id, addressee_person_id, via)
  values (p_me, p_target, p_via)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.connection_open(uuid, uuid, text) from public, anon, authenticated;

-- Ask someone in the family tree.
create or replace function public.request_connection(p_person_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me public.members := public.connection_caller();
begin
  if not exists (
    select 1 from public.members m join public.people p on p.id = m.person_id
    where m.person_id = p_person_id and m.status = 'active' and p.auth_user_id is not null
      and public.can_see_occasions_of(m.family_id)
  ) then
    raise exception 'That person is not in your family tree.';
  end if;
  return public.connection_open(me.person_id, p_person_id, 'tree');
end;
$$;

revoke execute on function public.request_connection(uuid) from public, anon;
grant execute on function public.request_connection(uuid) to authenticated;

-- Ask someone by the code they gave you.
create or replace function public.request_connection_by_code(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me public.members := public.connection_caller();
  target uuid;
begin
  if me.role not in ('parent', 'adult') then raise exception 'Codes are for grown-ups.'; end if;
  select cc.person_id into target from public.connection_codes cc where cc.code = upper(btrim(p_code));
  -- The owner of a code must still be a grown-up with an active membership.
  if target is null or not exists (
    select 1 from public.members m where m.person_id = target and m.status = 'active' and m.role in ('parent', 'adult')
  ) then
    raise exception 'No one has that code.';
  end if;
  return public.connection_open(me.person_id, target, 'code');
end;
$$;

revoke execute on function public.request_connection_by_code(text) from public, anon;
grant execute on function public.request_connection_by_code(text) to authenticated;

-- Answer a request made to you. Only the person asked may.
create or replace function public.respond_connection(p_id uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me public.members := public.connection_caller();
  found int;
begin
  update public.connections
     set status = case when p_accept then 'accepted' else 'declined' end,
         decided_at = now(),
         ended_by = case when p_accept then null else me.person_id end
   where id = p_id and status = 'pending' and addressee_person_id = me.person_id;
  get diagnostics found = row_count;
  if found = 0 then raise exception 'That request is no longer open.'; end if;
end;
$$;

revoke execute on function public.respond_connection(uuid, boolean) from public, anon;
grant execute on function public.respond_connection(uuid, boolean) to authenticated;

-- End a connection, or withdraw a request you made. Either side, alone.
create or replace function public.remove_connection(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me public.members := public.connection_caller();
  found int;
begin
  update public.connections
     set status = 'removed', decided_at = now(), ended_by = me.person_id
   where id = p_id
     and (status = 'accepted' or (status = 'pending' and requester_person_id = me.person_id))
     and me.person_id in (requester_person_id, addressee_person_id);
  get diagnostics found = row_count;
  if found = 0 then raise exception 'That connection is not yours to change.'; end if;
end;
$$;

revoke execute on function public.remove_connection(uuid) from public, anon;
grant execute on function public.remove_connection(uuid) to authenticated;

-- Your code, made the first time you ask for it. Grown-ups only.
create or replace function public.my_connection_code(p_new boolean default false)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me public.members := public.connection_caller();
  c text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  tries int := 0;
begin
  if me.role not in ('parent', 'adult') then raise exception 'Codes are for grown-ups.'; end if;
  if not p_new then
    select cc.code into c from public.connection_codes cc where cc.person_id = me.person_id;
    if c is not null then return c; end if;
  end if;
  loop
    tries := tries + 1;
    -- Eight characters from 32, drawn from the fully random bytes of a v4
    -- uuid (random() is not meant for secrets). 256 is a multiple of 32, so
    -- the modulo favours no letter. 40 bits: guessing one blind is hopeless.
    with b as (select uuid_send(gen_random_uuid()) as raw)
    select string_agg(substr(alphabet, 1 + get_byte(b.raw, i) % 32, 1), '' order by i) into c
    from b, unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i;
    begin
      insert into public.connection_codes (person_id, code) values (me.person_id, c)
      on conflict (person_id) do update set code = excluded.code, created_at = now();
      return c;
    exception when unique_violation then
      if tries > 5 then raise; end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.my_connection_code(boolean) from public, anon;
grant execute on function public.my_connection_code(boolean) to authenticated;
