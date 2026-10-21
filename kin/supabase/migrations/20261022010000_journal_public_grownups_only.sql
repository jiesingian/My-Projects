-- Journal "Public" entries reach grown-ups only (Jonathan, 22 October).
-- 20261021140000 let a Public entry reach the writer's accepted connections
-- and the linked people on the writer's family tree. A child with a login
-- (role child_self, person_is_child) was among both: a child connection
-- (approved by a parent, 20260929163000) and a child placed on the tree.
-- Now neither: Public reaches grown-up connections and tree-linked grown-ups
-- only. The writer always sees their own, a child writer included.
--
-- What children keep: entries shared with the household, or with them
-- directly. Those are other policies (household / linked-household / shared
-- with a person) and are not touched here; this file changes only the Public
-- route, journal_entries_select_public and entry_public_to_me() (photos, their
-- file rows and the journal bucket go through it).
--
-- on_family_tree_as_me() keeps its meaning (is the caller on this tree); the
-- grown-up test sits beside it in public_entry_reaches_me(), which both the
-- policy and entry_public_to_me() now use, so the two cannot drift apart.
-- Definer because person_is_child() is not callable by authenticated.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create or replace function public.public_entry_reaches_me(p_owner uuid, p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_person_id() is not null and (
    p_owner = public.current_person_id()
    or (
      not public.person_is_child(public.current_person_id())
      and (public.are_connected(p_owner, public.current_person_id())
        or public.on_family_tree_as_me(p_family_id))
    )
  );
$$;

revoke execute on function public.public_entry_reaches_me(uuid, uuid) from public, anon;
grant execute on function public.public_entry_reaches_me(uuid, uuid) to authenticated;

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
      and public.public_entry_reaches_me(e.owner_person_id, e.family_id)
  );
$$;

revoke execute on function public.entry_public_to_me(uuid) from public, anon;
grant execute on function public.entry_public_to_me(uuid) to authenticated;

drop policy if exists journal_entries_select_public on public.journal_entries;
create policy journal_entries_select_public on public.journal_entries
  for select to authenticated using (
    public_at is not null
    and public.public_entry_reaches_me(owner_person_id, family_id)
  );
