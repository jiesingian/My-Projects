-- Storage buckets for a database that has none: in practice, dev.
--
-- Production's buckets -- journal, documents, avatars, recipe-photos -- and
-- their policies were made by hand in the dashboard before the migration
-- pipeline existed, so no migration ever created them and dev, built from
-- migrations, has no storage at all: every upload there answers "Bucket not
-- found" (BACKLOG, Next up, since 22 September), which is why photo features
-- could only be tested on production.
--
-- This creates a bucket only where it is missing, and gives policies only to
-- a bucket it has just created. On production every bucket already exists,
-- so this file does nothing there: not a bucket, not a policy, not a row.
--
-- The policies are the rule every bucket here is documented to follow (see
-- 20260923130000_chat_attachments.sql): a file is readable and writable by the
-- household whose id is the first folder of its path, and by nobody else.
-- avatars is public for reading, as the app builds plain public URLs for it
-- (lib/photo-url.ts); the other three are private and read through signed
-- URLs.

do $$
declare
  b record;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'no storage schema here; nothing to do';
    return;
  end if;

  for b in select * from (values ('journal', false), ('documents', false), ('avatars', true), ('recipe-photos', false)) as t(id, is_public) loop
    continue when exists (select 1 from storage.buckets where id = b.id);

    insert into storage.buckets (id, name, public) values (b.id, b.id, b.is_public);

    execute format($p$
      create policy %I on storage.objects for select to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = (select public.current_family_id())::text)
    $p$, 'kin_' || b.id || '_read', b.id);
    execute format($p$
      create policy %I on storage.objects for insert to authenticated
        with check (bucket_id = %L and (storage.foldername(name))[1] = (select public.current_family_id())::text)
    $p$, 'kin_' || b.id || '_write', b.id);
    execute format($p$
      create policy %I on storage.objects for update to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = (select public.current_family_id())::text)
        with check (bucket_id = %L and (storage.foldername(name))[1] = (select public.current_family_id())::text)
    $p$, 'kin_' || b.id || '_update', b.id, b.id);
    execute format($p$
      create policy %I on storage.objects for delete to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = (select public.current_family_id())::text)
    $p$, 'kin_' || b.id || '_delete', b.id);

    raise notice 'created bucket % with household-folder policies', b.id;
  end loop;
end
$$;
