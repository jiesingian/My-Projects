-- Replies, reactions and "seen" in the family-tree room and one-to-one
-- conversations, and muting or pinning any conversation (Janine,
-- 29 September -- suggestions 2 and 7).
--
-- 1. REPLIES -- reply_to on both room tables. A reply may only quote a
--    message in the same conversation that the writer can already read
--    (chat_reply_allowed, which asks what each table's select policy asks),
--    so a quote can never carry words across a wall.
--
-- 2. REACTIONS -- chat_room_reactions, one per person per message per emoji.
--    Readable where the message is, with the family room's usual extra line:
--    a reaction from a household you are not linked with is not shown to you
--    (the same rule as feed comments, 20260929034700). The reactor's name
--    travels on the row, set by a trigger from the caller.
--
-- 3. SEEN -- one to one only: dm_seen_at() tells you when the other person
--    last read your conversation, nothing more. The family room reaches too
--    many people for "seen by" to mean anything.
--
-- 4. MUTE AND PIN -- chat_thread_prefs, one row per person per conversation
--    ('household', 'family', 'dm:<person>', 'link:<link>'), each readable and
--    writable only by its person. A muted conversation sends that person no
--    notifications until muted_until (null = until unmuted); the chat list
--    shows pinned ones first. chat_push_targets() and push_targets() learn to
--    skip people who have muted the conversation.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- ---------------------------------------------------------------- replies

alter table public.family_tree_messages
  add column if not exists reply_to uuid references public.family_tree_messages(id) on delete set null;
alter table public.direct_messages
  add column if not exists reply_to uuid references public.direct_messages(id) on delete set null;

-- Can the caller quote this message? A definer function, because a policy
-- that reads its own table recurses. It re-asks exactly what each table's
-- select policy asks: the family room's household line, or being one of the
-- pair (and, for one to one, the same pair as the reply).
create or replace function public.chat_reply_allowed(p_family_reply uuid, p_direct_reply uuid, p_low uuid, p_high uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_family_reply is not null then exists (
      select 1 from public.family_tree_messages r
      where r.id = p_family_reply
        and (r.family_id = public.current_family_id() or public.families_are_linked(r.family_id, public.current_family_id()))
    )
    when p_direct_reply is not null then exists (
      select 1 from public.direct_messages r
      where r.id = p_direct_reply and r.person_low = p_low and r.person_high = p_high
        and public.current_person_id() in (r.person_low, r.person_high)
    )
    else true
  end;
$$;

revoke execute on function public.chat_reply_allowed(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.chat_reply_allowed(uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists family_tree_messages_insert on public.family_tree_messages;
create policy family_tree_messages_insert on public.family_tree_messages
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
    and (reply_to is null or public.chat_reply_allowed(reply_to, null, null, null))
  );

drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages
  for insert to authenticated with check (
    sender_person_id = (select public.current_person_id())
    and sender_person_id in (person_low, person_high)
    and public.are_connected(person_low, person_high)
    and (reply_to is null or public.chat_reply_allowed(null, reply_to, person_low, person_high))
  );

-- ---------------------------------------------------------------- reactions

create table if not exists public.chat_room_reactions (
  id uuid primary key default gen_random_uuid(),
  family_message_id uuid references public.family_tree_messages(id) on delete cascade,
  direct_message_id uuid references public.direct_messages(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  author_name text not null default '',
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint chat_room_reactions_one_message check (num_nonnulls(family_message_id, direct_message_id) = 1),
  constraint chat_room_reactions_emoji check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏'))
);

create unique index if not exists chat_room_reactions_family_once
  on public.chat_room_reactions (family_message_id, person_id, emoji) where family_message_id is not null;
create unique index if not exists chat_room_reactions_direct_once
  on public.chat_room_reactions (direct_message_id, person_id, emoji) where direct_message_id is not null;

create or replace function public.chat_room_reaction_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.person_id := public.current_person_id();
  new.family_id := public.current_family_id();
  new.author_name := coalesce((select m.full_name from public.members m where m.id = public.current_member_id()), '');
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function public.chat_room_reaction_author() from public, anon, authenticated;

drop trigger if exists chat_room_reactions_author on public.chat_room_reactions;
create trigger chat_room_reactions_author
  before insert on public.chat_room_reactions
  for each row execute function public.chat_room_reaction_author();

alter table public.chat_room_reactions enable row level security;

drop policy if exists chat_room_reactions_select on public.chat_room_reactions;
create policy chat_room_reactions_select on public.chat_room_reactions
  for select to authenticated using (
    (
      exists (select 1 from public.family_tree_messages m where m.id = family_message_id)
      and (family_id = (select public.current_family_id()) or public.families_are_linked(family_id, (select public.current_family_id())))
    )
    or exists (select 1 from public.direct_messages d where d.id = direct_message_id)
  );

drop policy if exists chat_room_reactions_insert on public.chat_room_reactions;
create policy chat_room_reactions_insert on public.chat_room_reactions
  for insert to authenticated with check (
    person_id = (select public.current_person_id())
    and (
      exists (select 1 from public.family_tree_messages m where m.id = family_message_id)
      or exists (select 1 from public.direct_messages d where d.id = direct_message_id)
    )
  );

drop policy if exists chat_room_reactions_delete on public.chat_room_reactions;
create policy chat_room_reactions_delete on public.chat_room_reactions
  for delete to authenticated using (person_id = (select public.current_person_id()));

revoke update on public.chat_room_reactions from anon, authenticated;

-- ---------------------------------------------------------------- seen

-- When the other person last read your one-to-one conversation. Answers only
-- for a pair the caller is in; null when they have not opened it.
create or replace function public.dm_seen_at(p_other uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select r.last_read_at
  from public.chat_reads r
  where public.current_person_id() is not null
    and r.person_id = p_other
    and r.thread = 'dm:' || public.current_person_id()::text
    and exists (
      select 1 from public.direct_messages d
      where d.person_low = least(p_other, public.current_person_id())
        and d.person_high = greatest(p_other, public.current_person_id())
    );
$$;

revoke execute on function public.dm_seen_at(uuid) from public, anon;
grant execute on function public.dm_seen_at(uuid) to authenticated;

-- ---------------------------------------------------------------- mute and pin

create table if not exists public.chat_thread_prefs (
  person_id uuid not null references public.people(id) on delete cascade,
  thread text not null,
  muted boolean not null default false,
  -- null with muted = true means "until I unmute".
  muted_until timestamptz,
  pinned boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (person_id, thread),
  constraint chat_thread_prefs_thread_check check (thread ~ '^(household|family|dm:[0-9a-f-]{36}|link:[0-9a-f-]{36})$')
);

alter table public.chat_thread_prefs enable row level security;

drop policy if exists chat_thread_prefs_own on public.chat_thread_prefs;
create policy chat_thread_prefs_own on public.chat_thread_prefs
  for all to authenticated
  using (person_id = (select public.current_person_id()))
  with check (person_id = (select public.current_person_id()));

-- Has this person muted this conversation, right now?
create or replace function public.chat_thread_muted(p_person uuid, p_thread text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_thread_prefs p
    where p.person_id = p_person and p.thread = p_thread
      and p.muted and (p.muted_until is null or p.muted_until > now())
  );
$$;

revoke execute on function public.chat_thread_muted(uuid, text) from public, anon, authenticated;

-- 20260929090000's push targets, now skipping anyone who muted the room. The
-- thread key is the recipient's own name for it: 'family', or 'dm:<sender>'.
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
  end if;
end;
$$;

-- 20260924130000's household push targets, unchanged except that a "chat"
-- push skips anyone who muted the household chat.
create or replace function public.push_targets(p_kind text, p_member_ids uuid[] default null)
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth
  from push_subscriptions s
  join members m on m.id = s.member_id
  where s.family_id = current_family_id()
    and m.family_id = current_family_id()
    and m.status = 'active'
    and s.member_id <> current_member_id()
    and (p_member_ids is null or s.member_id = any (p_member_ids))
    and p_kind ~ '^[a-z_]{1,32}$'
    and coalesce((m.notification_prefs ->> p_kind)::boolean, true)
    and not (p_kind = 'chat' and public.chat_thread_muted(m.person_id, 'household'))
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication is missing; chat_room_reactions not added';
    return;
  end if;
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid and p.pubname = 'supabase_realtime'
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname = 'chat_room_reactions'
  ) then
    alter publication supabase_realtime add table public.chat_room_reactions;
  end if;
end $$;
