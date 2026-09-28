-- Production's storage, reproducible from migrations -- and the one rule it
-- was missing.
--
-- Production's buckets and their policies were made by hand in the dashboard
-- before the migration pipeline existed. 20260926120000 gave dev buckets of
-- its own, with policies written from the documented rule rather than read
-- from production (BACKLOG: "needs its policies read first"). They were read
-- on 28 September. Production has five buckets, not four -- trip-photos was
-- missing from dev entirely -- and sixteen storage policies, one of which
-- (journal_objects_select_linked) a migration already makes.
--
-- This file:
--  1. creates trip-photos where it is missing (private, like the rest);
--  2. creates each of production's policies, by its production name and with
--     its production definition, where no policy of that name exists -- on
--     production that is all of them, so nothing changes there;
--  3. drops the kin_<bucket>_* policies 20260926120000 gave dev, once the
--     production-named ones are in, so dev and production hold the same
--     rules (they never existed on production, so that is a no-op there);
--  4. adds trip_photos_family_delete, the one change production does see.
--     Every other bucket lets the household delete its own files; trip-photos
--     did not, so deleting a household (deleteHouseholdAction) quietly left
--     its trip photos behind. Same household-folder rule as the others.
--
-- Every rule is the one documented in 20260923130000_chat_attachments.sql: a
-- file belongs to the household whose id is the first folder of its path.

do $$
declare
  p record;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'no storage schema here; nothing to do';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  select 'trip-photos', 'trip-photos', false
  where not exists (select 1 from storage.buckets where id = 'trip-photos');

  for p in
    select * from (values
      ('avatars_public_read',        'avatars',       'select', true),
      ('avatars_family_write',       'avatars',       'insert', false),
      ('avatars_family_update',      'avatars',       'update', false),
      ('avatars_family_delete',      'avatars',       'delete', false),
      ('documents_family_rw',        'documents',     'select', false),
      ('documents_family_insert',    'documents',     'insert', false),
      ('documents_family_delete',    'documents',     'delete', false),
      ('journal_family_rw',          'journal',       'select', false),
      ('journal_family_insert',      'journal',       'insert', false),
      ('journal_family_delete',      'journal',       'delete', false),
      ('recipe_photos_family_rw',    'recipe-photos', 'select', false),
      ('recipe_photos_bucket_insert','recipe-photos', 'insert', false),
      ('recipe_photos_bucket_delete','recipe-photos', 'delete', false),
      ('trip_photos_family_rw',      'trip-photos',   'select', false),
      ('trip_photos_family_insert',  'trip-photos',   'insert', false),
      ('trip_photos_family_delete',  'trip-photos',   'delete', false)
    ) as t(name, bucket, cmd, anyone)
  loop
    continue when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = p.name);

    if p.anyone then
      -- avatars is a public bucket: the app builds plain public URLs for it.
      execute format('create policy %I on storage.objects for select using (bucket_id = %L)', p.name, p.bucket);
    elsif p.cmd = 'insert' then
      execute format('create policy %I on storage.objects for insert with check (bucket_id = %L and (storage.foldername(name))[1] = (current_family_id())::text)', p.name, p.bucket);
    else
      execute format('create policy %I on storage.objects for %s using (bucket_id = %L and (storage.foldername(name))[1] = (current_family_id())::text)', p.name, p.cmd, p.bucket);
    end if;
    raise notice 'created storage policy %', p.name;
  end loop;

  -- Dev's stand-ins from 20260926120000, now that the real ones are there.
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname ~ '^kin_(journal|documents|avatars|recipe-photos)_(read|write|update|delete)$'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
    raise notice 'dropped dev stand-in %', p.policyname;
  end loop;
end
$$;
