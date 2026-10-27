-- Delete a vault folder, only when it is empty (Janine, 27 October)
-- ==================================================================
--
-- The vault's Documents tab can make folders but never remove one. A folder
-- page now has Delete folder, for an empty folder only: a full one says to
-- move or delete its entries first.
--
-- WHY A FUNCTION, NOT A DELETE FROM THE APP
--
-- "Empty" has to mean empty for everyone. A "Just me" entry is invisible to
-- everybody but its owner, and a "Parents only" one to every adult, so the
-- folder can look empty to the person deleting it while it still holds
-- someone else's papers. doc_entries.folder_id was made on the dashboard,
-- before this folder of migrations, and how it acts on a deleted folder is
-- not written down anywhere here. Counting past RLS, in one statement with
-- the delete, keeps a hidden entry from being taken or orphaned whatever
-- that foreign key does.
--
-- WHO
--
-- A grown-up (parent or adult) of the folder's own household. Children never
-- reach the vault.
--
-- RETURNS 'deleted', 'not_empty' or 'not_found' (no such folder in the
-- caller's household, or the caller is not a grown-up).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create or replace function public.delete_empty_doc_folder(p_folder uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.current_member_role()) not in ('parent', 'adult') then
    return 'not_found';
  end if;
  -- Locked, so an entry filed into it meanwhile waits for this to finish.
  perform 1 from public.doc_folders f
  where f.id = p_folder and f.family_id = (select public.current_family_id())
  for update;
  if not found then
    return 'not_found';
  end if;
  if exists (select 1 from public.doc_entries e where e.folder_id = p_folder) then
    return 'not_empty';
  end if;
  delete from public.doc_folders where id = p_folder;
  return 'deleted';
end;
$$;

revoke execute on function public.delete_empty_doc_folder(uuid) from public, anon;
grant execute on function public.delete_empty_doc_folder(uuid) to authenticated;
