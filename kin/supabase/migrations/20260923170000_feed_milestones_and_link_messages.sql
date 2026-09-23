-- Distant relatives, part two: milestones on the family feed, and a
-- conversation with each linked household.

-- ── milestones on the family feed ─────────────────────────────────────────
--
-- The family feed already carries journal entries a household chose to share
-- with the households it is linked to (journal_entries.shared_at). Milestones
-- -- a first step, a graduation -- are the thing distant relatives most want
-- to hear about and were the one kind of memory that could not be shared.
-- Same mechanism: a shared_at the household sets, and a read-only policy for
-- linked households. Writing stays with the household that owns the row.
alter table public.milestones add column if not exists shared_at timestamptz;

create index if not exists milestones_shared_idx
  on public.milestones (family_id, milestone_date desc) where shared_at is not null;

drop policy if exists milestones_select_linked on public.milestones;
create policy milestones_select_linked on public.milestones
  for select using (
    shared_at is not null
    and family_id <> current_family_id()
    and public.families_are_linked(family_id, current_family_id())
  );

-- ── a conversation with each linked household ────────────────────────────
--
-- One thread per family link, between the two households on it and nobody
-- else, open only while the link is accepted. The household chat is not used
-- for this: it is the household's own room, and letting another family into
-- it would mean every message there suddenly had a second audience.
create table if not exists public.family_link_messages (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.family_links(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  -- Who said it, as a name. The other household cannot read this household's
  -- members, so the name has to travel with the message -- and it is written
  -- by the trigger below from the caller's own identity, never taken from the
  -- client, so nobody can post under somebody else's name.
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  constraint family_link_messages_body_length check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists family_link_messages_link_idx on public.family_link_messages (link_id, created_at);

-- Sets the author from whoever is calling. It only ever assigns a value and
-- never raises, so it cannot answer a question about a row the caller could
-- not see -- the mistake the chat reply trigger made, and that the polls
-- migration corrected. An insert that is not the caller's own is left for
-- row-level security to refuse.
create or replace function public.link_message_author()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.author_name := coalesce((select full_name from public.members where id = current_member_id()), '');
  return new;
end;
$$;

drop trigger if exists family_link_messages_author on public.family_link_messages;
create trigger family_link_messages_author
  before insert on public.family_link_messages
  for each row execute function public.link_message_author();

alter table public.family_link_messages enable row level security;

-- Read: either household on an accepted link. Revoking the link closes the
-- conversation for both at once.
drop policy if exists family_link_messages_select on public.family_link_messages;
create policy family_link_messages_select on public.family_link_messages
  for select using (
    exists (
      select 1 from public.family_links l
      where l.id = link_id and l.status = 'accepted'
        and current_family_id() in (l.requester_family_id, l.addressee_family_id)
    )
  );

-- Write: as yourself, from your own household, into an accepted link that
-- household is on.
drop policy if exists family_link_messages_insert on public.family_link_messages;
create policy family_link_messages_insert on public.family_link_messages
  for insert with check (
    family_id = current_family_id()
    and member_id = current_member_id()
    and exists (
      select 1 from public.family_links l
      where l.id = link_id and l.status = 'accepted'
        and current_family_id() in (l.requester_family_id, l.addressee_family_id)
    )
  );

-- Take back your own message. Nobody else's, from either household.
drop policy if exists family_link_messages_delete on public.family_link_messages;
create policy family_link_messages_delete on public.family_link_messages
  for delete using (member_id = current_member_id());

do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid and p.pubname = 'supabase_realtime'
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname = 'family_link_messages'
  ) then
    alter publication supabase_realtime add table public.family_link_messages;
  end if;
end $$;
