-- The family-tree chat and one-to-one messages (Janine, 29 September).
--
-- Two new conversations beside the household's own chat (family_messages)
-- and the conversation each pair of linked households already has
-- (family_link_messages, 20260923170000):
--
-- 1. FAMILY -- family_tree_messages
--
-- One room for your household and every household linked with it. A message
-- is written by a person in one household and read by that household and
-- every household linked with it:
--
--     readable when family_id = mine, or families_are_linked(family_id, mine)
--
-- Links are pairs, not groups, so in a chain (A-B, B-C, but not A-C) B sees
-- everybody while A and C see B's words and not each other's. Nobody sees
-- words from a household they have not linked with. That is the same line
-- the family feed's comments draw (20260929034700), and it follows the link:
-- revoke it and each side stops seeing the other's messages at once.
--
-- The writer's name travels on the row (author_name), set by the database
-- from the caller -- the members table stays unreadable across households.
--
-- 2. ONE TO ONE -- direct_messages
--
-- Between two people (people.id) who are connected (20260929060000). The
-- pair is stored in order (person_low < person_high) so the two directions
-- are one conversation. Only the two people can read it; writing needs the
-- connection to be live. After a connection is removed the history stays
-- readable by the two of them and nobody else, and neither can add to it.
--
-- 3. UNREAD -- chat_reads
--
-- One marker per person per conversation ('family', 'dm:<person>',
-- 'link:<link>'), each readable and writable only by its person. The
-- household chat keeps its own family_message_reads, which drives its seen-by
-- receipts.
--
-- 4. LIVE AND PUSH
--
-- Both tables join the realtime publication, and chat_topic_is_mine() learns
-- two private topics: 'family-tree:<my household>' and
-- 'dm:<low person>:<high person>' when I am one of them. chat_push_targets()
-- finds the devices a new message should reach, across households, with the
-- same "chat" notification switch the household chat uses.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- ---------------------------------------------------------------- family

create table if not exists public.family_tree_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  constraint family_tree_messages_body_length check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists family_tree_messages_family_idx on public.family_tree_messages (family_id, created_at desc);
create index if not exists family_tree_messages_created_idx on public.family_tree_messages (created_at desc);

-- Who wrote it, from the caller. Only ever assigns; an insert that is not the
-- caller's own is refused by the policy below, not answered here.
create or replace function public.family_tree_message_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.member_id := public.current_member_id();
  new.family_id := coalesce(public.current_family_id(), new.family_id);
  new.person_id := public.current_person_id();
  new.author_name := coalesce((select m.full_name from public.members m where m.id = new.member_id), '');
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function public.family_tree_message_author() from public, anon, authenticated;

drop trigger if exists family_tree_messages_author on public.family_tree_messages;
create trigger family_tree_messages_author
  before insert on public.family_tree_messages
  for each row execute function public.family_tree_message_author();

alter table public.family_tree_messages enable row level security;

drop policy if exists family_tree_messages_select on public.family_tree_messages;
create policy family_tree_messages_select on public.family_tree_messages
  for select to authenticated using (
    family_id = (select public.current_family_id())
    or public.families_are_linked(family_id, (select public.current_family_id()))
  );

drop policy if exists family_tree_messages_insert on public.family_tree_messages;
create policy family_tree_messages_insert on public.family_tree_messages
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
  );

-- Take back your own. Nobody else's, from any household.
drop policy if exists family_tree_messages_delete on public.family_tree_messages;
create policy family_tree_messages_delete on public.family_tree_messages
  for delete to authenticated using (member_id = (select public.current_member_id()));

revoke update on public.family_tree_messages from anon, authenticated;

-- ---------------------------------------------------------------- one to one

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  person_low uuid not null references public.people(id) on delete cascade,
  person_high uuid not null references public.people(id) on delete cascade,
  sender_person_id uuid references public.people(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint direct_messages_pair_order check (person_low < person_high),
  constraint direct_messages_body_length check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists direct_messages_pair_idx on public.direct_messages (person_low, person_high, created_at desc);
create index if not exists direct_messages_high_idx on public.direct_messages (person_high, created_at desc);

create or replace function public.direct_message_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender_person_id := public.current_person_id();
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function public.direct_message_sender() from public, anon, authenticated;

drop trigger if exists direct_messages_sender on public.direct_messages;
create trigger direct_messages_sender
  before insert on public.direct_messages
  for each row execute function public.direct_message_sender();

alter table public.direct_messages enable row level security;

drop policy if exists direct_messages_select on public.direct_messages;
create policy direct_messages_select on public.direct_messages
  for select to authenticated using (
    (select public.current_person_id()) in (person_low, person_high)
  );

drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages
  for insert to authenticated with check (
    sender_person_id = (select public.current_person_id())
    and sender_person_id in (person_low, person_high)
    and public.are_connected(person_low, person_high)
  );

drop policy if exists direct_messages_delete on public.direct_messages;
create policy direct_messages_delete on public.direct_messages
  for delete to authenticated using (sender_person_id = (select public.current_person_id()));

revoke update on public.direct_messages from anon, authenticated;

-- ---------------------------------------------------------------- unread

create table if not exists public.chat_reads (
  person_id uuid not null references public.people(id) on delete cascade,
  thread text not null,
  last_read_at timestamptz not null default now(),
  primary key (person_id, thread),
  constraint chat_reads_thread_check check (thread ~ '^(family|dm:[0-9a-f-]{36}|link:[0-9a-f-]{36})$')
);

alter table public.chat_reads enable row level security;

drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads
  for all to authenticated
  using (person_id = (select public.current_person_id()))
  with check (person_id = (select public.current_person_id()));

-- ---------------------------------------------------------------- live

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication is missing; chat tables not added';
    return;
  end if;
  foreach t in array array['family_tree_messages', 'direct_messages'] loop
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

-- The private topics a member may join: the two from 20260926130000, plus
-- the family-tree room of their own household and the one-to-one rooms they
-- are in. The dm topic names the pair in order, so there is one per pair.
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
    else false
  end
$$;

-- ---------------------------------------------------------------- push

-- The devices a new message in 'family' or 'dm:<person>' should reach, other
-- than the sender's own, where the "chat" notification switch is on. Across
-- households, so definer rights; it answers only for conversations the
-- caller is in, and returns delivery addresses, never names.
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
        and coalesce((m.notification_prefs ->> 'chat')::boolean, true);
  elsif p_thread ~ '^dm:[0-9a-f-]{36}$' then
    other := substr(p_thread, 4)::uuid;
    if not public.are_connected(me, other) then return; end if;
    return query
      select s.endpoint, s.p256dh, s.auth
      from public.push_subscriptions s
      join public.members m on m.id = s.member_id and m.family_id = s.family_id
      where m.status = 'active'
        and m.person_id = other
        and coalesce((m.notification_prefs ->> 'chat')::boolean, true);
  end if;
end;
$$;

revoke execute on function public.chat_push_targets(text) from public, anon;
grant execute on function public.chat_push_targets(text) to authenticated;

-- The one-to-one conversations a person is in, with the other person's name
-- and photo only while they are connected (the same rule as my_connections).
create or replace function public.my_direct_threads()
returns table (person_id uuid, full_name text, avatar_url text, household_name text, connected boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_person_id();
  r record;
  mem public.members;
begin
  if me is null then return; end if;
  for r in
    select distinct case when d.person_low = me then d.person_high else d.person_low end as other
    from public.direct_messages d
    where me in (d.person_low, d.person_high)
    union
    select x from public.my_connected_person_ids() x
  loop
    mem := public.person_active_member(r.other);
    person_id := r.other;
    connected := public.are_connected(me, r.other);
    full_name := case when connected then coalesce(mem.full_name, 'Someone') else 'Former connection' end;
    avatar_url := case when connected then mem.avatar_url end;
    household_name := case when connected and mem.family_id is not null then (select f.name from public.families f where f.id = mem.family_id) end;
    return next;
  end loop;
end;
$$;

revoke execute on function public.my_direct_threads() from public, anon;
grant execute on function public.my_direct_threads() to authenticated;

-- What is waiting unread for the caller in the family room and each
-- one-to-one conversation. The household chat has its own (getChatUnread);
-- the linked-household threads are not counted yet, because their page lives
-- with the Journal and does not mark them read -- chat_reads already accepts
-- 'link:<id>' for when it does. Security INVOKER: row-
-- level security already decides which messages the caller can see, so this
-- only counts -- it cannot count anything the caller could not read. A
-- conversation never opened counts the last fortnight rather than all of
-- history, so a thread that has been going for months does not arrive with
-- hundreds "unread" the day this ships.
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
  group by x.thread;
$$;

revoke execute on function public.my_chat_unread() from public, anon;
grant execute on function public.my_chat_unread() to authenticated;
