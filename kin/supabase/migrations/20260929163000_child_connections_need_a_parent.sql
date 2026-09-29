-- A child's connections need a parent's yes (Janine, 29 September --
-- suggestion 10).
--
-- Children could already connect only inside the family tree -- no codes
-- (20260929060000). This adds the family apps' usual second step: when either
-- side of a connection is a child (a member whose role is child_self), the
-- other person's "accept" is not the end of it (unless they are a grown-up
-- of the child's own household). The connection waits, in
-- 'awaiting_guardian', until a grown-up (parent or adult) of the child's own
-- household approves. Until then it is not a connection: are_connected() is
-- still false, so no one-to-one messages and no group adds through it.
--
-- A grown-up of the child's household can also see every connection the
-- child has (children_connections()) and remove any of them
-- (guardian_remove_connection) -- the point of the step is that a parent
-- knows who their child talks to.
--
-- Nothing changes for connections between two grown-ups, and connections
-- that already exist are left as they are.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.connections drop constraint if exists connections_status_check;
alter table public.connections
  add constraint connections_status_check check (status in ('pending', 'awaiting_guardian', 'accepted', 'declined', 'removed'));

alter table public.connections add column if not exists guardian_decided_by uuid references public.people(id) on delete set null;

drop index if exists public.connections_pair_live_idx;
create unique index if not exists connections_pair_live_idx
  on public.connections (least(requester_person_id, addressee_person_id), greatest(requester_person_id, addressee_person_id))
  where status in ('pending', 'awaiting_guardian', 'accepted');

-- Is this person a child with a login, by their active membership?
create or replace function public.person_is_child(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((public.person_active_member(p_person)).role = 'child_self', false);
$$;

revoke execute on function public.person_is_child(uuid) from public, anon, authenticated;

-- Is the caller a grown-up of this child's household?
create or replace function public.is_guardian_of(p_child uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.person_is_child(p_child)
    and exists (
      select 1 from public.members g
      where g.auth_user_id = auth.uid() and g.status = 'active' and g.role in ('parent', 'adult')
        and g.family_id = (public.person_active_member(p_child)).family_id
    );
$$;

revoke execute on function public.is_guardian_of(uuid) from public, anon, authenticated;

-- Does a connection between these two need a parent's yes? When one is a
-- child -- unless the other is a grown-up of that child's own household,
-- who would only be approving themselves.
create or replace function public.connection_needs_guardian(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    public.person_is_child(p_a)
    and not coalesce((public.person_active_member(p_b)).role in ('parent', 'adult')
      and (public.person_active_member(p_b)).family_id = (public.person_active_member(p_a)).family_id, false)
  ) or (
    public.person_is_child(p_b)
    and not coalesce((public.person_active_member(p_a)).role in ('parent', 'adult')
      and (public.person_active_member(p_a)).family_id = (public.person_active_member(p_b)).family_id, false)
  );
$$;

revoke execute on function public.connection_needs_guardian(uuid, uuid) from public, anon, authenticated;

-- Answer a request made to you (20260929060000), now stopping at
-- 'awaiting_guardian' when either side is a child.
create or replace function public.respond_connection(p_id uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me public.members := public.connection_caller();
  c public.connections;
begin
  select * into c from public.connections
   where id = p_id and status = 'pending' and addressee_person_id = me.person_id;
  if c.id is null then raise exception 'That request is no longer open.'; end if;
  update public.connections
     set status = case
                    when not p_accept then 'declined'
                    when public.connection_needs_guardian(c.requester_person_id, c.addressee_person_id) then 'awaiting_guardian'
                    else 'accepted'
                  end,
         decided_at = now(),
         ended_by = case when p_accept then null else me.person_id end
   where id = p_id;
end;
$$;

-- Two people asking each other agree -- but a child's still waits for a
-- parent.
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
  where c.status in ('pending', 'awaiting_guardian', 'accepted')
    and ((c.requester_person_id = p_me and c.addressee_person_id = p_target)
      or (c.requester_person_id = p_target and c.addressee_person_id = p_me));

  if existing.id is not null then
    if existing.status = 'pending' and existing.addressee_person_id = p_me then
      update public.connections
         set status = case when public.connection_needs_guardian(p_me, p_target) then 'awaiting_guardian' else 'accepted' end,
             decided_at = now()
       where id = existing.id;
    end if;
    return existing.id;
  end if;

  insert into public.connections (requester_person_id, addressee_person_id, via)
  values (p_me, p_target, p_via)
  returning id into new_id;
  return new_id;
end;
$$;

-- Either side may still withdraw or end it; a connection waiting on a parent
-- counts as live for that.
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
     and (status in ('accepted', 'awaiting_guardian') or (status = 'pending' and requester_person_id = me.person_id))
     and me.person_id in (requester_person_id, addressee_person_id);
  get diagnostics found = row_count;
  if found = 0 then raise exception 'That connection is not yours to change.'; end if;
end;
$$;

-- A grown-up's yes or no to a child's connection.
create or replace function public.guardian_decide_connection(p_id uuid, p_approve boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me public.members := public.connection_caller();
  c public.connections;
begin
  select * into c from public.connections where id = p_id and status = 'awaiting_guardian';
  if c.id is null then raise exception 'That request is no longer open.'; end if;
  if not (public.is_guardian_of(c.requester_person_id) or public.is_guardian_of(c.addressee_person_id)) then
    raise exception 'Only a parent or another adult of the child''s household can decide this.';
  end if;
  update public.connections
     set status = case when p_approve then 'accepted' else 'declined' end,
         guardian_decided_by = me.person_id,
         decided_at = now(),
         ended_by = case when p_approve then null else me.person_id end
   where id = p_id;
end;
$$;

create or replace function public.guardian_remove_connection(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me public.members := public.connection_caller();
  c public.connections;
begin
  select * into c from public.connections where id = p_id and status in ('pending', 'awaiting_guardian', 'accepted');
  if c.id is null or not (public.is_guardian_of(c.requester_person_id) or public.is_guardian_of(c.addressee_person_id)) then
    raise exception 'Only a parent or another adult of the child''s household can do that.';
  end if;
  update public.connections set status = 'removed', decided_at = now(), ended_by = me.person_id where id = p_id;
end;
$$;

-- Every live connection of the children in the caller's household, for a
-- grown-up of it: the child, the other person, and where it stands.
create or replace function public.children_connections()
returns table (id uuid, child_person_id uuid, child_name text, other_person_id uuid, other_name text, other_household text, status text, requested_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with kids as (
    select m.person_id, m.full_name
    from public.members m
    join public.members g on g.family_id = m.family_id
    where g.auth_user_id = auth.uid() and g.status = 'active' and g.role in ('parent', 'adult')
      and m.status = 'active' and m.role = 'child_self'
  )
  select c.id, k.person_id, k.full_name,
         o.person_id, coalesce(o.full_name, 'Someone'), f.name,
         c.status, c.requested_at
  from public.connections c
  join kids k on k.person_id in (c.requester_person_id, c.addressee_person_id)
  left join lateral (
    select x.person_id, x.full_name, x.family_id from public.members x
    where x.person_id = case when c.requester_person_id = k.person_id then c.addressee_person_id else c.requester_person_id end
      and x.status = 'active'
    order by x.created_at desc limit 1
  ) o on true
  left join public.families f on f.id = o.family_id
  where c.status in ('pending', 'awaiting_guardian', 'accepted')
  order by c.status = 'awaiting_guardian' desc, c.requested_at desc;
$$;

revoke execute on function public.guardian_decide_connection(uuid, boolean) from public, anon;
revoke execute on function public.guardian_remove_connection(uuid) from public, anon;
revoke execute on function public.children_connections() from public, anon;
grant execute on function public.guardian_decide_connection(uuid, boolean) to authenticated;
grant execute on function public.guardian_remove_connection(uuid) to authenticated;
grant execute on function public.children_connections() to authenticated;

-- my_connections() shows 'awaiting_guardian' too, so both sides see that it
-- is waiting on a parent rather than silently disappearing. Same naming rule
-- as before; an awaiting one was accepted by the other side, so it is named.
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
    where c.status in ('pending', 'awaiting_guardian', 'accepted') and me in (c.requester_person_id, c.addressee_person_id)
    order by c.status, coalesce(c.decided_at, c.requested_at) desc
  loop
    other := case when r.requester_person_id = me then r.addressee_person_id else r.requester_person_id end;
    mem := public.person_active_member(other);
    named := r.status in ('accepted', 'awaiting_guardian')
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

-- connection_candidates() leaves out people already waiting on a parent.
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
      where c.status in ('pending', 'awaiting_guardian', 'accepted')
        and ((c.requester_person_id = public.current_person_id() and c.addressee_person_id = m.person_id)
          or (c.requester_person_id = m.person_id and c.addressee_person_id = public.current_person_id()))
    )
  order by m.family_id = public.current_family_id() desc, f.name, m.full_name;
$$;
