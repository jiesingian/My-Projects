-- Comments and reactions on photos: a journal photo, a profile picture, or
-- the household's background photo -- the way Facebook and Instagram let
-- people answer a picture rather than only look at it.
--
-- Each row points at exactly one photo, through a real foreign key per kind
-- rather than a (kind, id) pair nothing could enforce: the database knows the
-- photo exists, and deleting the photo deletes what was said about it
-- (on delete cascade). The CHECK insists on exactly one.
--
-- Who can do what, all of it household-scoped the way everything else is:
--   * read   -- anyone in the household (family_id = current_family_id()).
--   * write  -- only as yourself, only in your own household, and only about
--               a photo that is itself in your household. The last part is
--               the one that matters: without it a member could attach a
--               comment row to another household's photo id and, while never
--               able to read it back, still leave something there.
--   * delete -- your own, only.
--   * reactions: one per person per photo (the unique indexes), changed in
--     place (update, your own only), or taken back (delete).
--
-- Nothing crosses to a linked household. A shared journal entry already
-- crosses as its title, date and note and not its photos (see
-- 20260922090000_family_links.sql), so there is nothing over there to answer.
--
-- The policies wrap current_family_id() / current_member_id() in a SELECT so
-- each is evaluated once per statement rather than once per row.

create table if not exists public.photo_comments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  journal_media_id uuid references public.journal_media(id) on delete cascade,
  member_avatar_id uuid references public.member_avatars(id) on delete cascade,
  family_background_id uuid references public.family_backgrounds(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint photo_comments_one_photo check (num_nonnulls(journal_media_id, member_avatar_id, family_background_id) = 1),
  constraint photo_comments_body_length check (char_length(btrim(body)) between 1 and 1000)
);

create table if not exists public.photo_reactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  journal_media_id uuid references public.journal_media(id) on delete cascade,
  member_avatar_id uuid references public.member_avatars(id) on delete cascade,
  family_background_id uuid references public.family_backgrounds(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint photo_reactions_one_photo check (num_nonnulls(journal_media_id, member_avatar_id, family_background_id) = 1),
  constraint photo_reactions_emoji_length check (char_length(emoji) between 1 and 16)
);

-- Reads go by photo; the partial indexes double as the foreign-key indexes.
create index if not exists photo_comments_journal_media_idx on public.photo_comments (journal_media_id, created_at) where journal_media_id is not null;
create index if not exists photo_comments_member_avatar_idx on public.photo_comments (member_avatar_id, created_at) where member_avatar_id is not null;
create index if not exists photo_comments_family_background_idx on public.photo_comments (family_background_id, created_at) where family_background_id is not null;
create index if not exists photo_comments_family_idx on public.photo_comments (family_id);
create index if not exists photo_comments_member_idx on public.photo_comments (member_id);

-- One reaction per person per photo.
create unique index if not exists photo_reactions_journal_media_uniq on public.photo_reactions (journal_media_id, member_id) where journal_media_id is not null;
create unique index if not exists photo_reactions_member_avatar_uniq on public.photo_reactions (member_avatar_id, member_id) where member_avatar_id is not null;
create unique index if not exists photo_reactions_family_background_uniq on public.photo_reactions (family_background_id, member_id) where family_background_id is not null;
create index if not exists photo_reactions_family_idx on public.photo_reactions (family_id);
create index if not exists photo_reactions_member_idx on public.photo_reactions (member_id);

alter table public.photo_comments enable row level security;
alter table public.photo_reactions enable row level security;

-- The photo being answered is in the caller's own household. Security
-- definer so it can look the photo up whatever each photo table's own select
-- policy says; it reveals nothing but a yes/no about the caller's household.
create or replace function public.photo_in_my_household(p_journal_media_id uuid, p_member_avatar_id uuid, p_family_background_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_journal_media_id is not null then exists (select 1 from journal_media where id = p_journal_media_id and family_id = current_family_id())
    when p_member_avatar_id is not null then exists (select 1 from member_avatars where id = p_member_avatar_id and family_id = current_family_id())
    when p_family_background_id is not null then exists (select 1 from family_backgrounds where id = p_family_background_id and family_id = current_family_id())
    else false
  end
$$;

revoke all on function public.photo_in_my_household(uuid, uuid, uuid) from public;
grant execute on function public.photo_in_my_household(uuid, uuid, uuid) to authenticated;

drop policy if exists photo_comments_select on public.photo_comments;
create policy photo_comments_select on public.photo_comments
  for select using (family_id = (select current_family_id()));

drop policy if exists photo_comments_insert on public.photo_comments;
create policy photo_comments_insert on public.photo_comments
  for insert with check (
    family_id = (select current_family_id())
    and member_id = (select current_member_id())
    and photo_in_my_household(journal_media_id, member_avatar_id, family_background_id)
  );

drop policy if exists photo_comments_delete on public.photo_comments;
create policy photo_comments_delete on public.photo_comments
  for delete using (member_id = (select current_member_id()));

drop policy if exists photo_reactions_select on public.photo_reactions;
create policy photo_reactions_select on public.photo_reactions
  for select using (family_id = (select current_family_id()));

drop policy if exists photo_reactions_insert on public.photo_reactions;
create policy photo_reactions_insert on public.photo_reactions
  for insert with check (
    family_id = (select current_family_id())
    and member_id = (select current_member_id())
    and photo_in_my_household(journal_media_id, member_avatar_id, family_background_id)
  );

-- Changing a reaction changes only the emoji: the photo and the person stay
-- put, which the WITH CHECK re-asserts.
drop policy if exists photo_reactions_update on public.photo_reactions;
create policy photo_reactions_update on public.photo_reactions
  for update using (member_id = (select current_member_id()))
  with check (
    member_id = (select current_member_id())
    and family_id = (select current_family_id())
    and photo_in_my_household(journal_media_id, member_avatar_id, family_background_id)
  );

drop policy if exists photo_reactions_delete on public.photo_reactions;
create policy photo_reactions_delete on public.photo_reactions
  for delete using (member_id = (select current_member_id()));
