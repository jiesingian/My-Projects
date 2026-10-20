-- Health photos' files follow their row.
--
-- Prescription photos (20261015130000) and visit photos (20260926110000) are
-- files in the journal bucket under <family id>/health/<medicine or visit
-- id>/. Their rows are hidden exactly as the medicine or visit is -- a
-- 'parents' or 'private' medicine's slip from a child, say -- but the files
-- were only held to the household by journal_family_rw and
-- journal_family_delete. So a child with a login could list
-- <family>/health/, open each folder, and download or delete Lola's
-- private prescription with their own session.
--
-- A restrictive policy now adds, for select and delete on health/ files:
-- the caller can see a photo row naming the file, or no row names it at all.
-- The second half keeps two moments working that have no visible row: the
-- upload just before addMedicinePhotoAction / addVisitPhotoAction records it,
-- and the clean-up just after the row (or its medicine) is deleted.
-- Everything outside health/, and every other bucket, is untouched.
--
-- Known gap, unchanged in kind: deleting the household removes files as the
-- organizer, so another member's private medicine's slip is left behind (the
-- row cascades away; nobody can read the file after).

create index if not exists health_medicine_photos_path_idx on public.health_medicine_photos (storage_path);
create index if not exists health_visit_photos_path_idx on public.health_visit_photos (storage_path);

-- Does any photo row name this file? Read past RLS on purpose: "no row I can
-- see" must not count as "no row at all".
create or replace function public.health_photo_has_row(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.health_medicine_photos where storage_path = p_name)
      or exists (select 1 from public.health_visit_photos where storage_path = p_name)
$$;

revoke all on function public.health_photo_has_row(text) from public, anon;
grant execute on function public.health_photo_has_row(text) to authenticated;

drop policy if exists journal_health_follows_row_select on storage.objects;
create policy journal_health_follows_row_select on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'journal'
    or split_part(name, '/', 2) <> 'health'
    or exists (select 1 from public.health_medicine_photos p where p.storage_path = objects.name)
    or exists (select 1 from public.health_visit_photos p where p.storage_path = objects.name)
    or not public.health_photo_has_row(name)
  );

drop policy if exists journal_health_follows_row_delete on storage.objects;
create policy journal_health_follows_row_delete on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'journal'
    or split_part(name, '/', 2) <> 'health'
    or exists (select 1 from public.health_medicine_photos p where p.storage_path = objects.name)
    or exists (select 1 from public.health_visit_photos p where p.storage_path = objects.name)
    or not public.health_photo_has_row(name)
  );
