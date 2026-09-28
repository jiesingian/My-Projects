-- The journal in three layers (approved by Jonathan, 28 September, BACKLOG
-- item 3): Mine / Household / Family feed. Step 1 of 3.
--
-- 20260928185000_people_and_personal_space.sql already has the model: an
-- entry or photo is 'household' or 'personal', and a personal photo's file
-- lives under journal/person/<person id>/ where only its owner may read it.
-- What this adds is what happens when a person ADDS a personal entry to the
-- household journal: its photos become household photos, and the household
-- has to be able to read files that are still under the owner's folder.
--
-- * journal_person_household_read: a household member reads a file under
--   person/ only when a household photo in their own household points at it
--   (journal_media.visibility = 'household'). The owner's own read policy is
--   unchanged. Linked households still read through
--   journal_object_shared_with_me(), which already goes by the photo row.
-- * journal_person_household_delete: the same household may delete such a
--   file, as it may any household photo.
-- * journal_person_delete is narrowed: the owner may no longer delete a file
--   that a household photo of ANOTHER household points at -- after a move,
--   a photo they gave the old household stays theirs to keep.
--
-- * family_storage_bytes() counts personal photos toward the household's
--   Kin storage, like every other file the household keeps there.
--
-- Nothing moves, no rows change.

drop policy if exists journal_person_household_read on storage.objects;
create policy journal_person_household_read on storage.objects
  for select to authenticated using (
    bucket_id = 'journal'
    and (storage.foldername(name))[1] = 'person'
    and exists (
      select 1 from public.journal_media m
      where m.storage_provider = 'supabase'
        and m.storage_path = storage.objects.name
        and m.visibility = 'household'
        and m.family_id = (select public.current_family_id())
    )
  );

-- Asked with definer rights on purpose: after a move the owner can no longer
-- read the old household's photo rows, so a plain subquery in the policy
-- would find nothing and let the delete through (found by the dev probe).
create or replace function public.journal_file_kept_by_another_household(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journal_media m
    where m.storage_path = p_name
      and m.visibility = 'household'
      and m.family_id is distinct from public.current_family_id()
  );
$$;

revoke execute on function public.journal_file_kept_by_another_household(text) from public, anon;
grant execute on function public.journal_file_kept_by_another_household(text) to authenticated;

drop policy if exists journal_person_delete on storage.objects;
create policy journal_person_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'journal'
    and (storage.foldername(name))[1] = 'person'
    and (storage.foldername(name))[2] = (select public.current_person_id())::text
    and not public.journal_file_kept_by_another_household(name)
  );

-- And, as with every household photo, anyone in the household may delete one
-- -- file included, even when it sits in the writer's folder. Otherwise the
-- row would go and the file would stay, unreachable and still counted.
drop policy if exists journal_person_household_delete on storage.objects;
create policy journal_person_household_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'journal'
    and (storage.foldername(name))[1] = 'person'
    and exists (
      select 1 from public.journal_media m
      where m.storage_provider = 'supabase'
        and m.storage_path = storage.objects.name
        and m.visibility = 'household'
        and m.family_id = (select public.current_family_id())
    )
  );

-- Finding a photo row by its path is what both policies do.
create index if not exists journal_media_storage_path_idx on public.journal_media (storage_path);

-- Personal photos count toward the household's Kin storage, the same as its
-- other files (20260928150000_kin_free_and_plus.sql): a person's files sit
-- under journal/person/<person id>/, so the sum takes in the folders of the
-- people in this household as well as the household's own folder.
create or replace function public.family_storage_bytes()
returns bigint
language sql
stable
security definer
set search_path = public, storage
as $$
  with fam as (
    select m.family_id from public.members m
    where m.auth_user_id = auth.uid() and m.status = 'active'
    limit 1
  )
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
  from storage.objects o, fam
  where (storage.foldername(o.name))[1] = fam.family_id::text
     or (o.bucket_id = 'journal'
         and (storage.foldername(o.name))[1] = 'person'
         and (storage.foldername(o.name))[2] in (
           select m.person_id::text from public.members m
           where m.family_id = fam.family_id and m.status in ('active', 'managed')
         ));
$$;

revoke execute on function public.family_storage_bytes() from public, anon;
grant execute on function public.family_storage_bytes() to authenticated;
