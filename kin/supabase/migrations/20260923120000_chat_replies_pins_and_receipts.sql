-- Chat: replying to a message, a pinned message per household, read receipts,
-- and two corrections to what was already there.
--
-- Everything below is additive to family_messages except one policy, which is
-- replaced because it was too loose. Nothing is dropped and no data moves.

-- ── replies ──────────────────────────────────────────────────────────────
--
-- A self-reference. ON DELETE SET NULL rather than CASCADE on purpose: a
-- withdrawn message keeps its place in the thread -- getChatThread blanks the
-- body and leaves the row, so the conversation around it still reads -- and an
-- answer to a question is still part of the conversation after the question is
-- gone. CASCADE would delete the answer along with it.
alter table public.family_messages
  add column if not exists reply_to uuid references public.family_messages(id) on delete set null;

create index if not exists family_messages_reply_to_idx
  on public.family_messages (reply_to)
  where reply_to is not null;

-- A reply has to point at a message in the same household. This cannot be a
-- CHECK constraint -- those cannot see another row -- and it cannot be left to
-- the server action, because Kin ships the anon key to the browser, so anything
-- a server action enforces is a suggestion and only the database is a rule.
--
-- What it actually prevents is small: row-level security already stops anyone
-- reading a message from another family, so a foreign reply_to would render as
-- no quote at all. It is here because "small" is not "nothing" -- an insert
-- that succeeds tells you a uuid exists -- and because a column that can only
-- ever hold one household's ids is easier to reason about later than one that
-- happens not to hold others today.
create or replace function public.chat_reply_stays_in_family()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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

drop trigger if exists family_messages_guard_reply_to on public.family_messages;
create trigger family_messages_guard_reply_to
  before insert or update of reply_to on public.family_messages
  for each row execute function public.chat_reply_stays_in_family();

-- ── the pinned message ───────────────────────────────────────────────────
--
-- One per household, which is why family_id is the primary key rather than a
-- column on it. Telegram allows several and then needs a list to manage them;
-- a household wants "the thing on the fridge door", and one of those makes
-- pinning and unpinning unambiguous.
--
-- Deliberately not columns on family_messages: pinning is an act on somebody
-- else's message, and family_messages_update_own only lets a member touch
-- their own row. Splitting the pin out means neither policy has to be widened.
create table if not exists public.family_chat_pins (
  family_id uuid primary key references public.families(id) on delete cascade,
  message_id uuid not null references public.family_messages(id) on delete cascade,
  pinned_by uuid not null references public.members(id) on delete cascade,
  pinned_at timestamptz not null default now()
);

alter table public.family_chat_pins enable row level security;

drop policy if exists family_chat_pins_read on public.family_chat_pins;
create policy family_chat_pins_read on public.family_chat_pins
  for select using (family_id = current_family_id());

-- Anyone in the household may pin or unpin. Five people do not need a
-- moderator, and the thing being pinned is already visible to all of them.
-- pinned_by must be yourself, so the banner cannot credit somebody else.
drop policy if exists family_chat_pins_write on public.family_chat_pins;
create policy family_chat_pins_write on public.family_chat_pins
  for all
  using (family_id = current_family_id())
  with check (family_id = current_family_id() and pinned_by = current_member_id());

-- ── read receipts ────────────────────────────────────────────────────────
--
-- No new table. family_message_reads already carries one last_read_at per
-- member, and "seen by" is exactly that read against a message's created_at --
-- a row per member per message would store the same fact many thousands of
-- times over.
--
-- What is missing is permission: family_message_reads_rw is scoped to
-- member_id = current_member_id(), so a member can read only their own marker.
-- This adds a second, select-only policy for the household. The two are
-- permissive and therefore OR together; the write side stays exactly as narrow
-- as it was.
drop policy if exists family_message_reads_read_family on public.family_message_reads;
create policy family_message_reads_read_family on public.family_message_reads
  for select using (family_id = current_family_id());

-- ── correction 1: a member could post as somebody else ───────────────────
--
-- family_messages_insert checked only that the message landed in your own
-- household, not that it came from you, so a member could insert a row with
-- another member's member_id and it would render in the thread under their
-- name and photograph. In a household with children and parents that is not a
-- theoretical problem.
--
-- member_id stays nullable -- it is ON DELETE SET NULL, so a departed member's
-- messages keep their place with no author -- but an insert must now claim
-- itself.
drop policy if exists family_messages_insert on public.family_messages;
create policy family_messages_insert on public.family_messages
  for insert
  with check (family_id = current_family_id() and member_id = current_member_id());

-- ── correction 2: dev had no realtime at all ─────────────────────────────
--
-- chat-thread.tsx subscribes to postgres_changes on family_messages and
-- family_message_reactions. Production has both in the supabase_realtime
-- publication; dev's publication was empty, so in dev those events never
-- fired and the thread only updated when something else refreshed the route.
-- The subscription looked fine and did nothing -- the same shape as the text
-- size setting.
--
-- Guarded rather than plain ALTER PUBLICATION ... ADD TABLE, which errors if
-- the table is already a member, and this file has to run cleanly against
-- both databases.
do $$
declare
  t text;
begin
  foreach t in array array['family_messages', 'family_message_reactions', 'family_chat_pins']
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
