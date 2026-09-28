-- The journal in three layers (approved by Jonathan, 28 September, BACKLOG
-- item 3), step 3: the family feed gets reactions and comments.
--
-- An entry on the feed can be seen by its own household and, once shared,
-- by every household linked with it. Reactions and comments on it follow
-- the same line -- with one more condition, because a comment carries its
-- writer's name:
--
--   you see a reaction or comment on an entry when you can see the entry,
--   AND it was written in your household, or the entry is your household's,
--   or the writer's household is linked with yours.
--
-- So the entry's household sees everything said about its memory; a linked
-- household sees its own words and the entry household's; and a THIRD
-- household (linked with the entry's household but not with the writer's)
-- does not see a stranger's name and words under it.
--
-- Names cross households the way link messages already do
-- (20260923170000): stored on the row when it is written, from the writer's
-- own member row. The members table stays unreadable across households.
--
-- journal_comments has existed since 20260928185000 but nothing wrote to it
-- (0 rows in production on 29 September); its policies are replaced here:
--   * read    -- the rule above
--   * write   -- as yourself, from your own household, on an entry you see
--   * edit    -- your own comment only (it was anyone in the household)
--   * delete  -- your own, or any on your household's entry (it was anyone
--                in the comment's household)
-- journal_reactions is new: one reaction per person per entry.

-- The rule, asked with definer rights: whether the entry is visible to the
-- caller has to be answered for entries of other households too, and the
-- entry row itself is what RLS would otherwise hide.
create or replace function public.journal_talk_visible(p_entry_id uuid, p_writer_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journal_entries e
    where e.id = p_entry_id
      and (
        -- An entry of my own household: a household one, or my own personal one.
        (e.family_id = public.current_family_id()
          and (e.visibility = 'household' or e.owner_person_id = public.current_person_id()))
        or public.entry_shared_with_me(e.id)
      )
      and (
        p_writer_family = public.current_family_id()
        or e.family_id = public.current_family_id()
        or public.families_are_linked(p_writer_family, public.current_family_id())
      )
  );
$$;

revoke execute on function public.journal_talk_visible(uuid, uuid) from public, anon;
grant execute on function public.journal_talk_visible(uuid, uuid) to authenticated;

-- Whose entry it is, for "delete any comment on your household's entry".
create or replace function public.journal_entry_is_ours(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journal_entries e
    where e.id = p_entry_id and e.family_id = public.current_family_id()
  );
$$;

revoke execute on function public.journal_entry_is_ours(uuid) from public, anon;
grant execute on function public.journal_entry_is_ours(uuid) to authenticated;

-- Who wrote it, set by the database rather than trusted from the app.
create or replace function public.journal_talk_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.member_id := public.current_member_id();
  new.family_id := public.current_family_id();
  new.author_name := coalesce((select m.full_name from public.members m where m.id = new.member_id), '');
  return new;
end;
$$;

revoke execute on function public.journal_talk_author() from public, anon, authenticated;

-- ---------------------------------------------------------------- comments

alter table public.journal_comments
  add column if not exists author_name text not null default '';

alter table public.journal_comments drop constraint if exists journal_comments_body_length;
alter table public.journal_comments
  add constraint journal_comments_body_length check (char_length(body) between 1 and 1000);

-- A comment outlives its writer's membership (the name is on the row).
alter table public.journal_comments drop constraint if exists journal_comments_member_id_fkey;
alter table public.journal_comments
  add constraint journal_comments_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

create index if not exists journal_comments_entry_id_idx on public.journal_comments (entry_id, created_at);
create index if not exists journal_comments_member_id_idx on public.journal_comments (member_id);

drop trigger if exists journal_comments_author on public.journal_comments;
create trigger journal_comments_author
  before insert on public.journal_comments
  for each row execute function public.journal_talk_author();

drop policy if exists journal_comments_select on public.journal_comments;
create policy journal_comments_select on public.journal_comments
  for select to authenticated using (
    (select public.journal_talk_visible(entry_id, family_id))
  );

drop policy if exists journal_comments_insert on public.journal_comments;
create policy journal_comments_insert on public.journal_comments
  for insert to authenticated with check (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
    and (select public.journal_talk_visible(entry_id, family_id))
  );

drop policy if exists journal_comments_update on public.journal_comments;
create policy journal_comments_update on public.journal_comments
  for update to authenticated
  using (member_id = (select public.current_member_id()))
  with check (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
    and (select public.journal_talk_visible(entry_id, family_id))
  );

drop policy if exists journal_comments_delete on public.journal_comments;
create policy journal_comments_delete on public.journal_comments
  for delete to authenticated using (
    member_id = (select public.current_member_id())
    or (select public.journal_entry_is_ours(entry_id))
  );

-- Only the words can change; who, where and on what stay as written.
revoke update on public.journal_comments from authenticated;
grant update (body) on public.journal_comments to authenticated;

-- --------------------------------------------------------------- reactions

create table if not exists public.journal_reactions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  author_name text not null default '',
  emoji text not null check (emoji in ('❤️', '😂', '😮', '😢', '👍', '🙏')),
  created_at timestamptz not null default now(),
  unique (entry_id, member_id)
);

comment on table public.journal_reactions is
  'One reaction per person per journal entry, on the family feed. Visible by journal_talk_visible(): who can see the entry, limited to households linked with the one it came from.';

create index if not exists journal_reactions_member_id_idx on public.journal_reactions (member_id);
create index if not exists journal_reactions_family_id_idx on public.journal_reactions (family_id);

alter table public.journal_reactions enable row level security;

drop trigger if exists journal_reactions_author on public.journal_reactions;
create trigger journal_reactions_author
  before insert on public.journal_reactions
  for each row execute function public.journal_talk_author();

drop policy if exists journal_reactions_select on public.journal_reactions;
create policy journal_reactions_select on public.journal_reactions
  for select to authenticated using (
    (select public.journal_talk_visible(entry_id, family_id))
  );

drop policy if exists journal_reactions_insert on public.journal_reactions;
create policy journal_reactions_insert on public.journal_reactions
  for insert to authenticated with check (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
    and (select public.journal_talk_visible(entry_id, family_id))
  );

drop policy if exists journal_reactions_update on public.journal_reactions;
create policy journal_reactions_update on public.journal_reactions
  for update to authenticated
  using (member_id = (select public.current_member_id()))
  with check (member_id = (select public.current_member_id()));

drop policy if exists journal_reactions_delete on public.journal_reactions;
create policy journal_reactions_delete on public.journal_reactions
  for delete to authenticated using (member_id = (select public.current_member_id()));

revoke all on public.journal_reactions from anon;
grant select, insert, delete on public.journal_reactions to authenticated;
grant update (emoji) on public.journal_reactions to authenticated;
