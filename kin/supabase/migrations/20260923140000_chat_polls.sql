-- Polls in chat: "what's for dinner", "who's free Saturday".
--
-- A poll hangs off a message, so it lives in the thread where the question was
-- asked -- scrolls with it, can be replied to, pinned and withdrawn like any
-- other message -- rather than in a place of its own that nobody opens.

create table if not exists public.family_polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.family_messages(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  question text not null,
  allow_multiple boolean not null default false,
  created_at timestamptz not null default now(),
  constraint family_polls_question_length check (char_length(btrim(question)) between 1 and 200)
);

create table if not exists public.family_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.family_polls(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  label text not null,
  position smallint not null default 0,
  constraint family_poll_options_label_length check (char_length(btrim(label)) between 1 and 100),
  -- The target of the composite foreign key below. It is what lets a vote
  -- name an option *of a particular poll*, rather than any option anywhere.
  constraint family_poll_options_poll_option unique (poll_id, id)
);

create table if not exists public.family_poll_votes (
  poll_id uuid not null references public.family_polls(id) on delete cascade,
  option_id uuid not null,
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, member_id),
  -- A vote for option X on poll Y only if X is one of Y's options. Without
  -- this a vote could say it was on one poll and count towards another's
  -- option, and no amount of row-level security would notice, because both
  -- rows are this household's.
  constraint family_poll_votes_option_of_poll
    foreign key (poll_id, option_id) references public.family_poll_options (poll_id, id) on delete cascade
);

create index if not exists family_poll_options_poll_idx on public.family_poll_options (poll_id, position);
create index if not exists family_poll_votes_poll_idx on public.family_poll_votes (poll_id);

-- One answer each on a single-choice poll. A partial unique index cannot see
-- the poll's allow_multiple, so this is a trigger. The server action changes
-- a vote by removing the old one first; this is what stops the browser, which
-- holds the anon key, from simply inserting a second.
--
-- SECURITY INVOKER, and a vote that is not the caller's own is waved through
-- to be refused by row-level security instead. Both matter, and the probe
-- that ships with this found why: a BEFORE trigger runs *before* the policy's
-- WITH CHECK. Written first as SECURITY DEFINER, it read votes the caller
-- could not see, and its refusal said so -- aimed at another household's poll
-- with one of their members' ids, "one answer each" would have confirmed that
-- that person had voted. As the invoker it can only see this household's
-- votes, and it only ever speaks about the caller's own.
create or replace function public.poll_single_choice()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.member_id is distinct from current_member_id() then
    return new;
  end if;
  if not coalesce((select allow_multiple from public.family_polls where id = new.poll_id), true)
     and exists (
       select 1 from public.family_poll_votes v
       where v.poll_id = new.poll_id and v.member_id = new.member_id and v.option_id <> new.option_id
     )
  then
    raise exception 'This poll takes one answer each.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists family_poll_votes_single_choice on public.family_poll_votes;
create trigger family_poll_votes_single_choice
  before insert on public.family_poll_votes
  for each row execute function public.poll_single_choice();

alter table public.family_polls enable row level security;
alter table public.family_poll_options enable row level security;
alter table public.family_poll_votes enable row level security;

-- ── polls and their options: the household reads; only the asker writes ──
drop policy if exists family_polls_read on public.family_polls;
create policy family_polls_read on public.family_polls
  for select using (family_id = current_family_id());

-- On a message of your own, for the same reason attachments are: otherwise a
-- member could hang a poll off somebody else's message and it would render as
-- theirs.
drop policy if exists family_polls_insert on public.family_polls;
create policy family_polls_insert on public.family_polls
  for insert with check (
    family_id = current_family_id()
    and exists (
      select 1 from public.family_messages m
      where m.id = message_id and m.family_id = current_family_id() and m.member_id = current_member_id()
    )
  );

drop policy if exists family_poll_options_read on public.family_poll_options;
create policy family_poll_options_read on public.family_poll_options
  for select using (family_id = current_family_id());

drop policy if exists family_poll_options_insert on public.family_poll_options;
create policy family_poll_options_insert on public.family_poll_options
  for insert with check (
    family_id = current_family_id()
    and exists (
      select 1 from public.family_polls p
      join public.family_messages m on m.id = p.message_id
      where p.id = poll_id and p.family_id = current_family_id() and m.member_id = current_member_id()
    )
  );

-- ── votes: everyone sees them; each person casts and takes back their own ──
drop policy if exists family_poll_votes_read on public.family_poll_votes;
create policy family_poll_votes_read on public.family_poll_votes
  for select using (family_id = current_family_id());

-- The poll has to be this household's too. Foreign keys are checked without
-- row-level security, so without the exists() a member who had a poll's id
-- could vote on another household's poll -- invisibly, since the vote would
-- carry their own family_id, but still a row that should not exist.
drop policy if exists family_poll_votes_insert on public.family_poll_votes;
create policy family_poll_votes_insert on public.family_poll_votes
  for insert with check (
    family_id = current_family_id()
    and member_id = current_member_id()
    and exists (select 1 from public.family_polls p where p.id = poll_id and p.family_id = current_family_id())
  );

drop policy if exists family_poll_votes_delete on public.family_poll_votes;
create policy family_poll_votes_delete on public.family_poll_votes
  for delete using (family_id = current_family_id() and member_id = current_member_id());

do $$
declare
  t text;
begin
  foreach t in array array['family_polls', 'family_poll_votes']
  loop
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

-- ── the same fix, applied to the reply trigger from the first chat migration ─
--
-- chat_reply_stays_in_family was written SECURITY DEFINER too, and runs before
-- row-level security in the same way. Its refusal is the same message whether
-- or not a foreign message exists, but an insert claiming *another*
-- household's family_id went two different ways: past the trigger and into
-- RLS's refusal if the reply_to existed in that household, or out through the
-- trigger's own error if it did not. Narrow -- it needs both ids already --
-- but an existence oracle across households all the same.
--
-- Rewritten as the invoker, it can only see this household's messages, so a
-- reply to anything else is simply not found; and an insert that is not into
-- the caller's own household is left for RLS to refuse. The earlier migration
-- is not edited: it has run on both databases, and a migration that has run is
-- a record, not a draft.
create or replace function public.chat_reply_stays_in_family()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.family_id is distinct from current_family_id() then
    return new;
  end if;
  if new.reply_to is not null
     and not exists (
       select 1 from public.family_messages m
       where m.id = new.reply_to and m.family_id = new.family_id
     )
  then
    raise exception 'A reply must point at a message in the same household.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
