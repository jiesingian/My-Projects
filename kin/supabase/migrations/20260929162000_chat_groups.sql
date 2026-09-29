-- Group chats and announcement channels (Janine, 29 September --
-- suggestions 5 and 6): "Cousins", "Siblings", "Planning Lola's 80th", or a
-- "Family news" channel where only its admins post.
--
-- WHO CAN BE IN ONE
--
-- A group is made by a person and holds people (people.id). Anyone added
-- must be someone the adder could already reach: a connection of theirs
-- (20260929060000), or someone in their family tree -- their household, or a
-- linked household that shares with relatives (person_in_my_tree). So a
-- group never becomes a way to reach a stranger, and a child can only be
-- added by someone in their family: children cannot hold or use connection
-- codes, so nobody outside the family is ever connected with one.
--
-- WHO SEES WHAT
--
-- Only members read a group, its member list and its messages. Names of the
-- other members come from group_members_of(), for groups the caller is in:
-- being in a group together is what shares a name, as in any messaging app.
-- Leaving, or being removed, closes it at once -- every policy reads the
-- membership row.
--
-- WHO CAN DO WHAT
--
--   * any member: read, react, leave; write, unless it is an announcement
--     channel;
--   * an admin (the maker, and anyone they make admin): write in an
--     announcement channel, add and remove people, rename, make admins.
--
-- All writes that touch membership go through security-definer functions
-- that re-check the caller, because adding someone means writing a row that
-- names a person the caller's own policies cannot see.
--
-- Photos, voice notes, videos and reactions reuse chat_room_attachments and
-- chat_room_reactions (a third kind of message beside family and one to
-- one), and the storage rule extends to them. Realtime topic 'group:<id>',
-- push, unread and mute/pin all learn the 'group:<id>' key.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  announce_only boolean not null default false,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chat_groups_name_length check (char_length(btrim(name)) between 1 and 60)
);

create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null default 'member',
  added_by uuid references public.people(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, person_id),
  constraint chat_group_members_role check (role in ('admin', 'member'))
);

create index if not exists chat_group_members_person_idx on public.chat_group_members (person_id);

create table if not exists public.chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  sender_person_id uuid references public.people(id) on delete set null,
  author_name text not null default '',
  body text not null,
  reply_to uuid references public.chat_group_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chat_group_messages_body_length check (char_length(body) <= 2000)
);

create index if not exists chat_group_messages_group_idx on public.chat_group_messages (group_id, created_at desc);

-- ---------------------------------------------------------------- questions

create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_group_members m
    where m.group_id = p_group and m.person_id = public.current_person_id()
  );
$$;

create or replace function public.is_group_admin(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_group_members m
    where m.group_id = p_group and m.person_id = public.current_person_id() and m.role = 'admin'
  );
$$;

revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.is_group_admin(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;

-- Could the caller add this person? A connection of theirs, or someone in
-- their family tree, with a login.
create or replace function public.can_add_to_group(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_person is not null
    and exists (select 1 from public.people p where p.id = p_person and p.auth_user_id is not null)
    and (
      public.are_connected(public.current_person_id(), p_person)
      or public.person_in_my_tree(p_person)
    );
$$;

revoke execute on function public.can_add_to_group(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_messages enable row level security;

drop policy if exists chat_groups_select on public.chat_groups;
create policy chat_groups_select on public.chat_groups
  for select to authenticated using (public.is_group_member(id));

drop policy if exists chat_group_members_select on public.chat_group_members;
create policy chat_group_members_select on public.chat_group_members
  for select to authenticated using (public.is_group_member(group_id));

drop policy if exists chat_group_messages_select on public.chat_group_messages;
create policy chat_group_messages_select on public.chat_group_messages
  for select to authenticated using (public.is_group_member(group_id));

-- Write: a member, as yourself; in an announcement channel only an admin; a
-- reply only to a message in the same group.
create or replace function public.group_message_allowed(p_group uuid, p_reply uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_group_member(p_group)
    and (not (select g.announce_only from public.chat_groups g where g.id = p_group) or public.is_group_admin(p_group))
    and (p_reply is null or exists (select 1 from public.chat_group_messages r where r.id = p_reply and r.group_id = p_group));
$$;

revoke execute on function public.group_message_allowed(uuid, uuid) from public, anon;
grant execute on function public.group_message_allowed(uuid, uuid) to authenticated;

create or replace function public.chat_group_message_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender_person_id := public.current_person_id();
  new.author_name := coalesce((select m.full_name from public.members m where m.id = public.current_member_id()), '');
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function public.chat_group_message_author() from public, anon, authenticated;

drop trigger if exists chat_group_messages_author on public.chat_group_messages;
create trigger chat_group_messages_author
  before insert on public.chat_group_messages
  for each row execute function public.chat_group_message_author();

drop policy if exists chat_group_messages_insert on public.chat_group_messages;
create policy chat_group_messages_insert on public.chat_group_messages
  for insert to authenticated with check (
    sender_person_id = (select public.current_person_id())
    and public.group_message_allowed(group_id, reply_to)
  );

-- Take back your own; an admin may remove anything in their group.
drop policy if exists chat_group_messages_delete on public.chat_group_messages;
create policy chat_group_messages_delete on public.chat_group_messages
  for delete to authenticated using (
    sender_person_id = (select public.current_person_id()) or public.is_group_admin(group_id)
  );

revoke insert, update, delete on public.chat_groups from anon, authenticated;
revoke insert, update, delete on public.chat_group_members from anon, authenticated;
revoke update on public.chat_group_messages from anon, authenticated;

-- ---------------------------------------------------------------- writes

-- Make a group with its first members. The maker is its first admin.
create or replace function public.create_chat_group(p_name text, p_announce_only boolean, p_people uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_person_id();
  g uuid;
  p uuid;
begin
  if me is null or public.current_member_id() is null then raise exception 'Not a member of any household.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Give the group a name.'; end if;
  insert into public.chat_groups (name, announce_only, created_by) values (btrim(p_name), coalesce(p_announce_only, false), me) returning id into g;
  insert into public.chat_group_members (group_id, person_id, role, added_by) values (g, me, 'admin', me);
  foreach p in array coalesce(p_people, '{}') loop
    if p <> me then
      if not public.can_add_to_group(p) then raise exception 'You can only add your connections and people in your family.'; end if;
      insert into public.chat_group_members (group_id, person_id, added_by) values (g, p, me) on conflict do nothing;
    end if;
  end loop;
  return g;
end;
$$;

create or replace function public.add_chat_group_members(p_group uuid, p_people uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_person_id();
  p uuid;
begin
  if not public.is_group_admin(p_group) then raise exception 'Only an admin of this group can add people.'; end if;
  foreach p in array coalesce(p_people, '{}') loop
    if not public.can_add_to_group(p) then raise exception 'You can only add your connections and people in your family.'; end if;
    insert into public.chat_group_members (group_id, person_id, added_by) values (p_group, p, me) on conflict do nothing;
  end loop;
end;
$$;

-- Remove someone (an admin), or leave (anyone, for themselves). A group
-- whose last admin leaves hands admin to its longest-standing member, so it
-- is never left with nobody able to manage it; the last one out deletes it.
create or replace function public.remove_chat_group_member(p_group uuid, p_person uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_person_id();
begin
  if p_person <> me and not public.is_group_admin(p_group) then raise exception 'Only an admin of this group can remove people.'; end if;
  if not public.is_group_member(p_group) then raise exception 'You are not in that group.'; end if;
  delete from public.chat_group_members where group_id = p_group and person_id = p_person;
  if not exists (select 1 from public.chat_group_members where group_id = p_group) then
    delete from public.chat_groups where id = p_group;
  elsif not exists (select 1 from public.chat_group_members where group_id = p_group and role = 'admin') then
    update public.chat_group_members set role = 'admin'
     where group_id = p_group
       and person_id = (select m.person_id from public.chat_group_members m where m.group_id = p_group order by m.added_at limit 1);
  end if;
end;
$$;

create or replace function public.update_chat_group(p_group uuid, p_name text, p_announce_only boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(p_group) then raise exception 'Only an admin of this group can change it.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Give the group a name.'; end if;
  update public.chat_groups set name = btrim(p_name), announce_only = coalesce(p_announce_only, announce_only) where id = p_group;
end;
$$;

create or replace function public.set_chat_group_admin(p_group uuid, p_person uuid, p_admin boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(p_group) then raise exception 'Only an admin of this group can do that.'; end if;
  update public.chat_group_members set role = case when p_admin then 'admin' else 'member' end
   where group_id = p_group and person_id = p_person;
  if not exists (select 1 from public.chat_group_members where group_id = p_group and role = 'admin') then
    raise exception 'A group needs at least one admin.';
  end if;
end;
$$;

-- Members of a group the caller is in, with names and photos.
create or replace function public.group_members_of(p_group uuid)
returns table (person_id uuid, full_name text, avatar_url text, household_name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.person_id, coalesce(am.full_name, 'Someone'), am.avatar_url, f.name, m.role
  from public.chat_group_members m
  left join lateral (
    select x.full_name, x.avatar_url, x.family_id from public.members x
    where x.person_id = m.person_id and x.status = 'active'
    order by x.created_at desc limit 1
  ) am on true
  left join public.families f on f.id = am.family_id
  where m.group_id = p_group and public.is_group_member(p_group)
  order by m.role, coalesce(am.full_name, '');
$$;

-- Who the caller could add to a group: connections, and family-tree people
-- with a login.
create or replace function public.group_candidates()
returns table (person_id uuid, full_name text, avatar_url text, household_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (x.person_id) x.person_id, x.full_name, x.avatar_url, x.household_name
  from (
    select c.person_id, c.full_name, c.avatar_url, c.household_name from public.connection_candidates() c
    union all
    select m.person_id, m.full_name, m.avatar_url, f.name
    from public.my_connected_person_ids() pid
    join public.members m on m.person_id = pid and m.status = 'active'
    left join public.families f on f.id = m.family_id
  ) x
  order by x.person_id, x.full_name;
$$;

revoke execute on function public.create_chat_group(text, boolean, uuid[]) from public, anon;
revoke execute on function public.add_chat_group_members(uuid, uuid[]) from public, anon;
revoke execute on function public.remove_chat_group_member(uuid, uuid) from public, anon;
revoke execute on function public.update_chat_group(uuid, text, boolean) from public, anon;
revoke execute on function public.set_chat_group_admin(uuid, uuid, boolean) from public, anon;
revoke execute on function public.group_members_of(uuid) from public, anon;
revoke execute on function public.group_candidates() from public, anon;
grant execute on function public.create_chat_group(text, boolean, uuid[]) to authenticated;
grant execute on function public.add_chat_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_chat_group_member(uuid, uuid) to authenticated;
grant execute on function public.update_chat_group(uuid, text, boolean) to authenticated;
grant execute on function public.set_chat_group_admin(uuid, uuid, boolean) to authenticated;
grant execute on function public.group_members_of(uuid) to authenticated;
grant execute on function public.group_candidates() to authenticated;

-- ---------------------------------------------------------------- media and reactions

alter table public.chat_room_attachments
  add column if not exists group_message_id uuid references public.chat_group_messages(id) on delete cascade;
alter table public.chat_room_attachments drop constraint if exists chat_room_attachments_one_message;
alter table public.chat_room_attachments
  add constraint chat_room_attachments_one_message check (num_nonnulls(family_message_id, direct_message_id, group_message_id) = 1);
create index if not exists chat_room_attachments_group_message_idx on public.chat_room_attachments (group_message_id, position) where group_message_id is not null;

drop policy if exists chat_room_attachments_select on public.chat_room_attachments;
create policy chat_room_attachments_select on public.chat_room_attachments
  for select to authenticated using (
    exists (select 1 from public.family_tree_messages m where m.id = family_message_id)
    or exists (select 1 from public.direct_messages d where d.id = direct_message_id)
    or exists (select 1 from public.chat_group_messages g where g.id = group_message_id)
  );

drop policy if exists chat_room_attachments_insert on public.chat_room_attachments;
create policy chat_room_attachments_insert on public.chat_room_attachments
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and (
      exists (select 1 from public.family_tree_messages m where m.id = family_message_id and m.member_id = (select public.current_member_id()))
      or exists (select 1 from public.direct_messages d where d.id = direct_message_id and d.sender_person_id = (select public.current_person_id()))
      or exists (select 1 from public.chat_group_messages g where g.id = group_message_id and g.sender_person_id = (select public.current_person_id()))
    )
  );

drop policy if exists chat_room_attachments_delete on public.chat_room_attachments;
create policy chat_room_attachments_delete on public.chat_room_attachments
  for delete to authenticated using (
    exists (select 1 from public.family_tree_messages m where m.id = family_message_id and m.member_id = (select public.current_member_id()))
    or exists (select 1 from public.direct_messages d where d.id = direct_message_id and d.sender_person_id = (select public.current_person_id()))
    or exists (select 1 from public.chat_group_messages g where g.id = group_message_id and g.sender_person_id = (select public.current_person_id()))
  );

create or replace function public.chat_room_object_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_room_attachments a
    left join public.family_tree_messages m on m.id = a.family_message_id
    left join public.direct_messages d on d.id = a.direct_message_id
    left join public.chat_group_messages g on g.id = a.group_message_id
    where a.storage_path = p_name
      and (
        (m.id is not null
          and (m.family_id = public.current_family_id()
            or public.families_are_linked(m.family_id, public.current_family_id())))
        or (d.id is not null and public.current_person_id() in (d.person_low, d.person_high))
        or (g.id is not null and public.is_group_member(g.group_id))
      )
  );
$$;

alter table public.chat_room_reactions
  add column if not exists group_message_id uuid references public.chat_group_messages(id) on delete cascade;
alter table public.chat_room_reactions drop constraint if exists chat_room_reactions_one_message;
alter table public.chat_room_reactions
  add constraint chat_room_reactions_one_message check (num_nonnulls(family_message_id, direct_message_id, group_message_id) = 1);
create unique index if not exists chat_room_reactions_group_once
  on public.chat_room_reactions (group_message_id, person_id, emoji) where group_message_id is not null;

drop policy if exists chat_room_reactions_select on public.chat_room_reactions;
create policy chat_room_reactions_select on public.chat_room_reactions
  for select to authenticated using (
    (
      exists (select 1 from public.family_tree_messages m where m.id = family_message_id)
      and (family_id = (select public.current_family_id()) or public.families_are_linked(family_id, (select public.current_family_id())))
    )
    or exists (select 1 from public.direct_messages d where d.id = direct_message_id)
    or exists (select 1 from public.chat_group_messages g where g.id = group_message_id)
  );

drop policy if exists chat_room_reactions_insert on public.chat_room_reactions;
create policy chat_room_reactions_insert on public.chat_room_reactions
  for insert to authenticated with check (
    person_id = (select public.current_person_id())
    and (
      exists (select 1 from public.family_tree_messages m where m.id = family_message_id)
      or exists (select 1 from public.direct_messages d where d.id = direct_message_id)
      or exists (select 1 from public.chat_group_messages g where g.id = group_message_id)
    )
  );

-- ---------------------------------------------------------------- keys everywhere else

alter table public.chat_reads drop constraint if exists chat_reads_thread_check;
alter table public.chat_reads
  add constraint chat_reads_thread_check check (thread ~ '^(family|dm:[0-9a-f-]{36}|link:[0-9a-f-]{36}|group:[0-9a-f-]{36})$');

alter table public.chat_thread_prefs drop constraint if exists chat_thread_prefs_thread_check;
alter table public.chat_thread_prefs
  add constraint chat_thread_prefs_thread_check check (thread ~ '^(household|family|dm:[0-9a-f-]{36}|link:[0-9a-f-]{36}|group:[0-9a-f-]{36})$');

create or replace function public.chat_topic_is_mine(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic = 'family-chat:' || current_family_id()::text then true
    when p_topic = 'family-tree:' || current_family_id()::text then true
    when p_topic like 'family-link:%' then exists (
      select 1 from family_links l
      where l.id::text = substr(p_topic, length('family-link:') + 1)
        and l.status = 'accepted'
        and current_family_id() in (l.requester_family_id, l.addressee_family_id)
    )
    when p_topic ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
      current_person_id()::text in (split_part(p_topic, ':', 2), split_part(p_topic, ':', 3))
      and split_part(p_topic, ':', 2) < split_part(p_topic, ':', 3)
    when p_topic ~ '^group:[0-9a-f-]{36}$' then is_group_member(substr(p_topic, 7)::uuid)
    else false
  end
$$;

create or replace function public.chat_push_targets(p_thread text)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cf uuid := public.current_family_id();
  me uuid := public.current_person_id();
  other uuid;
  g uuid;
begin
  if cf is null or me is null then return; end if;

  if p_thread = 'family' then
    return query
      select s.endpoint, s.p256dh, s.auth
      from public.push_subscriptions s
      join public.members m on m.id = s.member_id and m.family_id = s.family_id
      where m.status = 'active'
        and m.person_id <> me
        and (m.family_id = cf or public.families_are_linked(m.family_id, cf))
        and coalesce((m.notification_prefs ->> 'chat')::boolean, true)
        and not public.chat_thread_muted(m.person_id, 'family');
  elsif p_thread ~ '^dm:[0-9a-f-]{36}$' then
    other := substr(p_thread, 4)::uuid;
    if not public.are_connected(me, other) then return; end if;
    return query
      select s.endpoint, s.p256dh, s.auth
      from public.push_subscriptions s
      join public.members m on m.id = s.member_id and m.family_id = s.family_id
      where m.status = 'active'
        and m.person_id = other
        and coalesce((m.notification_prefs ->> 'chat')::boolean, true)
        and not public.chat_thread_muted(m.person_id, 'dm:' || me::text);
  elsif p_thread ~ '^group:[0-9a-f-]{36}$' then
    g := substr(p_thread, 7)::uuid;
    if not public.is_group_member(g) then return; end if;
    return query
      select s.endpoint, s.p256dh, s.auth
      from public.push_subscriptions s
      join public.members m on m.id = s.member_id and m.family_id = s.family_id
      join public.chat_group_members gm on gm.group_id = g and gm.person_id = m.person_id
      where m.status = 'active'
        and m.person_id <> me
        and coalesce((m.notification_prefs ->> 'chat')::boolean, true)
        and not public.chat_thread_muted(m.person_id, p_thread);
  end if;
end;
$$;

create or replace function public.my_chat_unread()
returns table (thread text, unread bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select public.current_person_id() as p),
  r as (select c.thread, c.last_read_at from public.chat_reads c),
  floor_at as (select now() - interval '14 days' as t)
  select 'family'::text, count(*)
  from public.family_tree_messages f, me, floor_at
  where f.person_id is distinct from me.p
    and f.created_at > greatest(floor_at.t, coalesce((select r.last_read_at from r where r.thread = 'family'), floor_at.t))
  union all
  select x.thread, count(*)
  from (
    select 'dm:' || (case when d.person_low = me.p then d.person_high else d.person_low end)::text as thread, d.created_at
    from public.direct_messages d, me
    where d.sender_person_id is distinct from me.p
  ) x, floor_at
  where x.created_at > greatest(floor_at.t, coalesce((select r.last_read_at from r where r.thread = x.thread), floor_at.t))
  group by x.thread
  union all
  select 'group:' || g.group_id::text, count(*)
  from public.chat_group_messages g, me, floor_at
  where g.sender_person_id is distinct from me.p
    and g.created_at > greatest(floor_at.t, coalesce((select r.last_read_at from r where r.thread = 'group:' || g.group_id::text), floor_at.t))
  group by g.group_id;
$$;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication is missing; group tables not added';
    return;
  end if;
  foreach t in array array['chat_group_messages', 'chat_group_members'] loop
    if not exists (
      select 1 from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid and p.pubname = 'supabase_realtime'
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relname = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
