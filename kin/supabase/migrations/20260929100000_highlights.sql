-- Highlights (29 September, Janine's list): a photo or a short video that
-- the whole household can see for 24 hours, like a story, posted from the
-- button beside the call buttons in Chat.
--
-- Household-visible, and nothing more: the file lives in the documents
-- bucket under '<household id>/highlights/', where the bucket's existing
-- policies (20260928140000) already let a household read, write and delete
-- its own folder and nobody else's.
--
-- Gone after 24 hours, in two ways:
--   * by query -- every read below requires expires_at > now(), so an
--     expired highlight disappears on the minute, whether or not its file
--     has been removed yet;
--   * by removing the file -- done by the app, as a member of the household,
--     the next time anyone in it opens Chat or posts a highlight
--     (sweepExpiredHighlights, src/lib/actions/highlights.ts). The file has
--     to go through the Storage API: deleting from storage.objects in SQL is
--     refused by Supabase and would leave the file behind if it were not.
--     The reminders cron can't do it either, deliberately -- it holds no
--     service-role key and so cannot touch anyone's files.
--     forget_expired_highlights() below lets any household member clear an
--     expired row once its file is gone.
--
-- Size: the upload session caps a photo at 15 MB and a video at 25 MB, and
-- the app refuses a video over 30 seconds before uploading it. duration is
-- recorded, and checked here too.

create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  duration_seconds numeric check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 31)),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint highlights_path_in_household check (storage_path like family_id::text || '/highlights/%'),
  constraint highlights_at_most_a_day check (expires_at <= created_at + interval '24 hours 1 minute')
);

create index if not exists highlights_family_expires on public.highlights (family_id, expires_at);

alter table public.highlights enable row level security;

drop policy if exists highlights_select on public.highlights;
create policy highlights_select on public.highlights
  for select to authenticated using (
    family_id = (select public.current_family_id()) and expires_at > now()
  );

drop policy if exists highlights_insert on public.highlights;
create policy highlights_insert on public.highlights
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
    and expires_at > now()
  );

-- Taking your own down early. (An expired row can't be reached through this:
-- Postgres applies the select policy to a delete's WHERE, and that hides it.
-- Expired rows go through forget_expired_highlights below.)
drop policy if exists highlights_delete on public.highlights;
create policy highlights_delete on public.highlights
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
  );

-- The sweep has to find expired rows to remove their files, and the select
-- policy above hides them. These two answer only for the caller's own
-- household, and only about highlights that have already expired.
create or replace function public.expired_highlights()
returns table (id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.storage_path
  from public.highlights h
  where h.family_id = (select public.current_family_id())
    and h.expires_at <= now()
  order by h.expires_at
  limit 200
$$;

-- Called once their files are gone, so a row never outlives its file
-- unnoticed and a file is never left without the row that finds it.
create or replace function public.forget_expired_highlights(p_ids uuid[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.highlights h
    where h.id = any(p_ids)
      and h.family_id = (select public.current_family_id())
      and h.expires_at <= now()
    returning 1
  )
  select count(*)::integer from gone
$$;

revoke all on function public.expired_highlights() from public;
revoke all on function public.forget_expired_highlights(uuid[]) from public;
grant execute on function public.expired_highlights() to authenticated;
grant execute on function public.forget_expired_highlights(uuid[]) to authenticated;

grant select, insert, delete on public.highlights to authenticated;
