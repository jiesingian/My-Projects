-- Journal "Public" entries: connections only, strictly (Jonathan, 21
-- October). A Public entry reaches someone only if they are an accepted
-- connection of its writer (are_connected: mutual and live, so pending,
-- declined and removed ones do not count; the household's other grown-up
-- counts, #824 connects them from the start), or a linked person on the
-- writer's family tree. Nobody else: not a connection's connections, not a
-- one-way request, not a stranger.
--
-- Audit of every read path (21 October), against that rule:
-- * journal_entries_select_public (20260929100200) and entry_public_to_me()
--   (the photos, their file rows and the journal bucket go through it) let
--   in the writer and are_connected() only. Narrower than the rule: the
--   tree-linked person was missing. Added here, nothing else changed.
-- * Comments and reactions (journal_talk_visible) do not follow Public at
--   all; on purpose (20260929100200), unchanged.
-- * Everything else that reads entries filters to the reader's own household
--   (On this day, the week in numbers, digests, the year book, the
--   assistant's search) or to linked households' shared_at entries (the
--   Family feed, a relative's moments), so a Public row from elsewhere never
--   reaches them. No push and no definer function returns entries.
--
-- "Linked person on the writer's tree": a person on the tree of the entry's
-- household (family_tree_people) who is the reader's own active member row
-- (member_id), or one matched (family_tree_matches, accepted) to the
-- reader's own row on their household's tree while the two households are
-- still linked. Unlinking the households, or taking the person off the tree,
-- takes the entries away at once, as removing a connection does.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.journal_entries add column if not exists public_at timestamptz;

-- Is the caller a linked person on this household's family tree? Definer:
-- the tree, the matches and the other household's members are not the
-- caller's to read. Answers only about the caller.
create or replace function public.on_family_tree_as_me(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_family_id is not null and public.current_person_id() is not null and (
    exists (
      select 1 from public.family_tree_people t
      join public.members m on m.id = t.member_id
      where t.family_id = p_family_id
        and m.person_id = public.current_person_id()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.family_tree_matches fm
      join public.family_tree_people mine
        on mine.id = case when fm.offer_family_id = p_family_id then fm.to_person_id else fm.offer_person_id end
      join public.members m on m.id = mine.member_id
      where fm.status = 'accepted'
        and p_family_id in (fm.offer_family_id, fm.to_family_id)
        and mine.family_id = case when fm.offer_family_id = p_family_id then fm.to_family_id else fm.offer_family_id end
        and m.family_id = mine.family_id
        and m.person_id = public.current_person_id()
        and m.status = 'active'
        and public.families_are_linked(fm.offer_family_id, fm.to_family_id)
    )
  );
$$;

revoke execute on function public.on_family_tree_as_me(uuid) from public, anon;
grant execute on function public.on_family_tree_as_me(uuid) to authenticated;

create or replace function public.entry_public_to_me(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journal_entries e
    where e.id = p_entry_id
      and e.public_at is not null
      and (e.owner_person_id = public.current_person_id()
        or public.are_connected(e.owner_person_id, public.current_person_id())
        or public.on_family_tree_as_me(e.family_id))
  );
$$;

revoke execute on function public.entry_public_to_me(uuid) from public, anon;
grant execute on function public.entry_public_to_me(uuid) to authenticated;

drop policy if exists journal_entries_select_public on public.journal_entries;
create policy journal_entries_select_public on public.journal_entries
  for select to authenticated using (
    public_at is not null
    and (owner_person_id = (select public.current_person_id())
      or public.are_connected(owner_person_id, (select public.current_person_id()))
      or public.on_family_tree_as_me(family_id))
  );
