-- A thread on each event (Janine, 14 October): comments on the event's own
-- screen, by anyone who can see the event -- children included -- with the
-- author and the time; each person may edit or delete their own.
--
-- Who sees a comment: exactly whoever sees its event. The policies ask the
-- events table under its own policies, as event_rsvps does
-- (20261014090000) and asset_items asks assets (20261012190000), so a
-- comment can never be seen where its event is not. Events are household
-- only today, so nothing crosses to a linked household.
--
-- Written only in one's own name (member_id = current_member_id()). An edit
-- changes the body only: a trigger keeps the event, the author and the time
-- it was written, and stamps edited_at. Deleting the event takes its thread
-- with it.
--
-- The push for a new comment goes from the app (sendPush, kind "events"),
-- so the "Events and schedules" switch mutes it like every event push.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint event_comments_body_length check (char_length(btrim(body)) between 1 and 1000)
);

create index if not exists event_comments_event_idx on public.event_comments (event_id, created_at);
create index if not exists event_comments_family_idx on public.event_comments (family_id);
create index if not exists event_comments_member_idx on public.event_comments (member_id);

alter table public.event_comments enable row level security;

drop policy if exists event_comments_select on public.event_comments;
create policy event_comments_select on public.event_comments
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.events e where e.id = event_id and e.family_id = event_comments.family_id)
  );

drop policy if exists event_comments_insert on public.event_comments;
create policy event_comments_insert on public.event_comments
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
    and exists (select 1 from public.events e where e.id = event_id and e.family_id = event_comments.family_id)
  );

drop policy if exists event_comments_update on public.event_comments;
create policy event_comments_update on public.event_comments
  for update to authenticated
  using (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
    and exists (select 1 from public.events e where e.id = event_id and e.family_id = event_comments.family_id)
  )
  with check (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
    and exists (select 1 from public.events e where e.id = event_id and e.family_id = event_comments.family_id)
  );

drop policy if exists event_comments_delete on public.event_comments;
create policy event_comments_delete on public.event_comments
  for delete to authenticated
  using (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
  );

grant select, insert, update, delete on public.event_comments to authenticated;

-- An edit is to the words only.
create or replace function public.event_comments_fixed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_id is distinct from old.event_id
     or new.family_id is distinct from old.family_id
     or new.member_id is distinct from old.member_id
     or new.created_at is distinct from old.created_at then
    raise exception 'A comment stays on its event, with its author and time.';
  end if;
  if new.body is distinct from old.body then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

drop trigger if exists event_comments_fixed on public.event_comments;
create trigger event_comments_fixed before update on public.event_comments
  for each row execute function public.event_comments_fixed();
