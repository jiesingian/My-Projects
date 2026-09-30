-- Polls in any group (Jonathan, 30 September -- "competitive with Telegram",
-- item 9). The household chat has had polls since 20260923140000
-- (family_polls, household-scoped by family_id); a group spans households, so
-- its polls get their own tables, scoped by the group instead.
--
-- 1. group_polls / group_poll_options -- the question and its answers, hung
--    off a chat_group_messages row so the poll sits in the thread like any
--    message. Readable by the group's members only. Not writable directly:
--    create_group_poll() writes the message, the poll and its options in one
--    go, after asking group_message_allowed() the same question the message
--    insert policy asks (a member; in an announcement channel, an admin).
--
-- 2. group_poll_votes -- one row per person per option, the voter's first
--    name set by a trigger from the caller (members is unreadable across
--    households, so names travel on the row). Any member may vote, in a
--    channel too; only for themselves; and a single-choice poll takes one
--    answer each (the household's rule, 20260923140000).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.group_polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.chat_group_messages(id) on delete cascade,
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  question text not null,
  allow_multiple boolean not null default false,
  created_at timestamptz not null default now(),
  constraint group_polls_question_length check (char_length(btrim(question)) between 1 and 200)
);

create table if not exists public.group_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.group_polls(id) on delete cascade,
  label text not null,
  position smallint not null default 0,
  constraint group_poll_options_label_length check (char_length(btrim(label)) between 1 and 100),
  constraint group_poll_options_poll_option unique (poll_id, id)
);

create table if not exists public.group_poll_votes (
  poll_id uuid not null references public.group_polls(id) on delete cascade,
  option_id uuid not null,
  person_id uuid not null default public.current_person_id() references public.people(id) on delete cascade,
  voter_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (option_id, person_id),
  constraint group_poll_votes_option_of_poll
    foreign key (poll_id, option_id) references public.group_poll_options (poll_id, id) on delete cascade
);

create index if not exists group_polls_group_idx on public.group_polls (group_id);
create index if not exists group_poll_options_poll_idx on public.group_poll_options (poll_id, position);
create index if not exists group_poll_votes_poll_idx on public.group_poll_votes (poll_id);

alter table public.group_polls enable row level security;
alter table public.group_poll_options enable row level security;
alter table public.group_poll_votes enable row level security;

drop policy if exists group_polls_read on public.group_polls;
create policy group_polls_read on public.group_polls
  for select to authenticated using (public.is_group_member(group_id));

drop policy if exists group_poll_options_read on public.group_poll_options;
create policy group_poll_options_read on public.group_poll_options
  for select to authenticated using (exists (select 1 from public.group_polls p where p.id = poll_id));

drop policy if exists group_poll_votes_read on public.group_poll_votes;
create policy group_poll_votes_read on public.group_poll_votes
  for select to authenticated using (exists (select 1 from public.group_polls p where p.id = poll_id));

drop policy if exists group_poll_votes_insert on public.group_poll_votes;
create policy group_poll_votes_insert on public.group_poll_votes
  for insert to authenticated with check (
    person_id = (select public.current_person_id())
    and exists (select 1 from public.group_polls p where p.id = poll_id)
  );

drop policy if exists group_poll_votes_delete on public.group_poll_votes;
create policy group_poll_votes_delete on public.group_poll_votes
  for delete to authenticated using (person_id = (select public.current_person_id()));

revoke insert, update, delete on public.group_polls from anon, authenticated;
revoke insert, update, delete on public.group_poll_options from anon, authenticated;
revoke update on public.group_poll_votes from anon, authenticated;

-- The voter, from the caller; and one answer each unless the poll says more.
create or replace function public.group_poll_vote_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.person_id := public.current_person_id();
  new.voter_name := split_part(coalesce((select m.full_name from public.members m where m.id = public.current_member_id()), ''), ' ', 1);
  new.created_at := now();
  if not coalesce((select p.allow_multiple from public.group_polls p where p.id = new.poll_id), true)
     and exists (
       select 1 from public.group_poll_votes v
       where v.poll_id = new.poll_id and v.person_id = new.person_id and v.option_id <> new.option_id
     )
  then
    raise exception 'This poll takes one answer each.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.group_poll_vote_before() from public, anon, authenticated;

drop trigger if exists group_poll_votes_before on public.group_poll_votes;
create trigger group_poll_votes_before
  before insert on public.group_poll_votes
  for each row execute function public.group_poll_vote_before();

create or replace function public.create_group_poll(p_group uuid, p_question text, p_options text[], p_allow_multiple boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  q text := btrim(coalesce(p_question, ''));
  opts text[];
  msg uuid;
  poll uuid;
  i int;
begin
  if public.current_person_id() is null or not public.group_message_allowed(p_group, null) then
    raise exception 'Only this group''s members can ask here.' using errcode = '42501';
  end if;
  select coalesce(array_agg(btrim(o) order by n), '{}') into opts
    from unnest(coalesce(p_options, '{}')) with ordinality as t(o, n)
    where btrim(o) <> '';
  if char_length(q) not between 1 and 200 then
    raise exception 'A poll needs a question.' using errcode = 'check_violation';
  end if;
  if cardinality(opts) not between 2 and 10 then
    raise exception 'A poll needs between 2 and 10 answers.' using errcode = 'check_violation';
  end if;

  -- The message itself goes in as the caller, through the author trigger,
  -- so it reads as theirs exactly like anything they type.
  insert into public.chat_group_messages (group_id, body) values (p_group, '📊 ' || q) returning id into msg;
  insert into public.group_polls (message_id, group_id, question, allow_multiple)
    values (msg, p_group, q, coalesce(p_allow_multiple, false)) returning id into poll;
  for i in 1 .. cardinality(opts) loop
    insert into public.group_poll_options (poll_id, label, position) values (poll, left(opts[i], 100), i - 1);
  end loop;
  return msg;
end;
$$;

revoke execute on function public.create_group_poll(uuid, text, text[], boolean) from public, anon;
grant execute on function public.create_group_poll(uuid, text, text[], boolean) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication is missing; group_poll_votes not added';
    return;
  end if;
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid and p.pubname = 'supabase_realtime'
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname = 'group_poll_votes'
  ) then
    alter publication supabase_realtime add table public.group_poll_votes;
  end if;
end $$;
