-- Delete my account, finished properly (#810's open risk: "a table holds a
-- non-cascading reference to a personal-space row").
--
-- An audit of every reference to a person, a member or a personal-space row
-- (dev's schema, read 22 October; the PR lists each one and what happens to
-- it) found that 20261021020000_delete_my_account.sql:
--
-- 1. deleted household records it meant to keep. journal_set_owner() stamps
--    owner_person_id on every journal entry and photo a person writes,
--    household ones included, so "delete where owner_person_id = them" took
--    their household memories, and everyone's comments on them, too. Worse,
--    a household trip pointing at one of those entries (trips.journal_entry_id,
--    no action) would refuse the delete, so the job failed for that person
--    every night and their account was never deleted. Now only what is
--    theirs alone goes: personal entries and photos, non-joint goals, notes.
-- 2. left personal data behind. The member row is kept as "Former member",
--    so nothing that cascades from members ever fires: their locations, SOS
--    alerts, passkeys, calendar and import tokens, photo album, highlights,
--    check-ins, budgets, savings, game scores, RSVPs and the rest stayed.
--    Each is now deleted here (list below). Rows that copied their name for
--    other people to read (chat authors, comments, reactions, potluck
--    claims, stories told, letters written, the vault's emergency log) now
--    say "Former member" instead -- through three triggers that had undone
--    or refused that. Private money and private documents that nobody else
--    could see go with their files. A membership they had moved out of kept
--    their name and details; it is emptied too.
-- 3. would have deleted children's profiles: a household left with only
--    children was deleted. It is now kept, children and all
--    ('children_stay'); only a household with nobody left in it is deleted,
--    by whoever leaves it last.
--
-- Files: finalize hands back every file to remove (photo album, highlights,
-- private documents, personal journal photos, health photos) and the files
-- under the person's folder that a household entry still uses (an entry
-- added from "Just me" to the household keeps its photos where they were),
-- so the route's sweep of person/<id>/ leaves those alone.

/** Whether public.<table> has <column>. Lets this file name tables that a
 * database may not have (PGlite has only stand-ins). */
create or replace function public.account_deletion_has_column(p_table text, p_column text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass('public.' || quote_ident(p_table)) and a.attname = p_column and a.attnum > 0 and not a.attisdropped
  )
$$;

/** What happens to a household when this member's account goes:
 * 'none' (not its organizer, or another grown-up organizer remains),
 * 'handover' (to_member becomes organizer: the next active grown-up, a
 * parent before an adult, longest in the household first),
 * 'children_stay' (no other grown-up, but children remain: the household is
 * kept for them, with no organizer, and nothing in it is deleted), or
 * 'delete_household' (nobody else is left in it). lib/account-deletion.ts
 * says the same in TypeScript, for the screen. */
create or replace function public.account_handover_plan(p_member uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m public.members;
  v_to uuid;
begin
  select * into v_m from public.members where id = p_member;
  if v_m.id is null or not v_m.is_organiser or v_m.role not in ('parent', 'adult') then
    return jsonb_build_object('kind', 'none');
  end if;
  if exists (
    select 1 from public.members o
    where o.family_id = v_m.family_id and o.id <> v_m.id and o.status = 'active'
      and o.is_organiser and o.role in ('parent', 'adult')
      and not exists (select 1 from public.account_deletions d where d.auth_user_id = o.auth_user_id)
  ) then
    return jsonb_build_object('kind', 'none');
  end if;
  select o.id into v_to from public.members o
  where o.family_id = v_m.family_id and o.id <> v_m.id and o.status = 'active'
    and o.role in ('parent', 'adult')
    and not exists (select 1 from public.account_deletions d where d.auth_user_id = o.auth_user_id)
  order by (o.role = 'parent') desc, o.created_at, o.id
  limit 1;
  if v_to is not null then
    return jsonb_build_object('kind', 'handover', 'to_member', v_to);
  end if;
  if exists (
    select 1 from public.members o
    where o.family_id = v_m.family_id and o.id <> v_m.id and o.status in ('active', 'managed')
      and not exists (select 1 from public.account_deletions d where d.auth_user_id = o.auth_user_id)
  ) then
    return jsonb_build_object('kind', 'children_stay', 'family_id', v_m.family_id);
  end if;
  return jsonb_build_object('kind', 'delete_household', 'family_id', v_m.family_id);
end;
$$;

/** Removes one person's own data and hands over or deletes what depends on
 * them; see the top of this file and of 20261021020000. For the job only
 * (service role). Returns the person, the files to remove ({bucket, path}),
 * the files under their folder to keep, and the households now empty and to
 * be deleted with delete_household_for_account_deletion. */
create or replace function public.finalize_account_deletion(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_m public.members;
  v_plan jsonb;
  v_paths jsonb := '[]'::jsonb;
  v_keep jsonb := '[]'::jsonb;
  v_families uuid[] := '{}';
  v_t record;
  v_part jsonb;
  v_filter text;
begin
  if p_user is null then
    return null;
  end if;
  select id into v_person from public.people where auth_user_id = p_user;
  perform set_config('kin.privileged', 'on', true);
  perform set_config('kin.account_deletion', 'on', true);

  -- The personal space: what is theirs alone, wherever it is filed. Their
  -- household entries, photos and joint goals stay, as everything else they
  -- wrote for the household does.
  if v_person is not null then
    if public.account_deletion_has_column('journal_media', 'storage_path') then
      select v_paths || coalesce(jsonb_agg(jsonb_build_object('bucket', 'journal', 'path', storage_path)), '[]'::jsonb) into v_paths
      from public.journal_media where owner_person_id = v_person and visibility = 'personal' and storage_path is not null;
    end if;
    -- A trip that points at one of their personal entries lets go of it,
    -- or the entry could not be deleted (trips.journal_entry_id, no action).
    if public.account_deletion_has_column('trips', 'journal_entry_id') then
      update public.trips set journal_entry_id = null
      where journal_entry_id in (select id from public.journal_entries where owner_person_id = v_person and visibility = 'personal');
    end if;
    for v_t in
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'owner_person_id'
      order by (c.table_name = 'journal_entries')  -- media and the rest before the entries they hang off
    loop
      v_filter := case
        when public.account_deletion_has_column(v_t.table_name, 'visibility') then ' and visibility = ''personal'''
        when public.account_deletion_has_column(v_t.table_name, 'is_joint') then ' and not is_joint'
        else '' end;
      execute format('delete from public.%I where owner_person_id = $1', v_t.table_name) || v_filter using v_person;
    end loop;

    -- Kept household photos and videos whose files sit in their folder.
    if public.account_deletion_has_column('journal_media', 'storage_path') then
      select v_keep || coalesce(jsonb_agg(jsonb_build_object('bucket', 'journal', 'path', storage_path)), '[]'::jsonb) into v_keep
      from public.journal_media where storage_path like 'person/' || v_person || '/%';
    end if;
    if public.account_deletion_has_column('journal_entry_videos', 'poster_path') then
      select v_keep || coalesce(jsonb_agg(jsonb_build_object('bucket', 'journal', 'path', p)), '[]'::jsonb) into v_keep
      from public.journal_entry_videos v, unnest(array[v.storage_path, v.poster_path]) p
      where p like 'person/' || v_person || '/%';
    end if;

    for v_t in
      select unnest(array['connections', 'connection_codes', 'saved_messages', 'scheduled_messages', 'chat_thread_prefs', 'chat_reads', 'chat_group_members']) as table_name
    loop
      if to_regclass('public.' || v_t.table_name) is not null then
        if v_t.table_name = 'connections' then
          delete from public.connections where requester_person_id = v_person or addressee_person_id = v_person;
        else
          execute format('delete from public.%I where person_id = $1', v_t.table_name) using v_person;
        end if;
      end if;
    end loop;

    -- What they said to others stays, under "Former member".
    for v_t in
      select * from (values
        ('chat_group_messages', 'author_name', 'sender_person_id'),
        ('chat_room_reactions', 'author_name', 'person_id'),
        ('family_tree_messages', 'author_name', 'person_id')
      ) as x(tbl, name_col, key_col)
    loop
      if public.account_deletion_has_column(v_t.tbl, v_t.name_col) and public.account_deletion_has_column(v_t.tbl, v_t.key_col) then
        execute format('update public.%I set %I = ''Former member'' where %I = $1', v_t.tbl, v_t.name_col, v_t.key_col) using v_person;
      end if;
    end loop;
  end if;

  -- Every membership they have had: the current one, and any they moved
  -- out of (those kept their name and details too).
  for v_m in
    select * from public.members
    where auth_user_id = p_user or (v_person is not null and person_id = v_person)
  loop
    if v_m.status not in ('removed', 'moved') then
      v_plan := public.account_handover_plan(v_m.id);
      if v_plan->>'kind' = 'handover' then
        update public.members set is_organiser = true where id = (v_plan->>'to_member')::uuid;
      end if;
      -- 'children_stay': the household stays as it is, children and all.
      -- 'delete_household' is decided below, once their row is emptied.
    end if;

    -- Health records about them, and their photos' files.
    if to_regclass('public.health_medicine_photos') is not null then
      select v_paths || coalesce(jsonb_agg(jsonb_build_object('bucket', 'journal', 'path', p.storage_path)), '[]'::jsonb) into v_paths
      from public.health_medicine_photos p join public.health_medicines h on h.id = p.medicine_id
      where h.member_id = v_m.id and p.storage_path is not null;
    end if;
    if to_regclass('public.health_visit_photos') is not null and to_regclass('public.health_appointments') is not null then
      select v_paths || coalesce(jsonb_agg(jsonb_build_object('bucket', 'journal', 'path', p.storage_path)), '[]'::jsonb) into v_paths
      from public.health_visit_photos p join public.health_appointments h on h.id = p.appointment_id
      where h.member_id = v_m.id and p.storage_path is not null;
    end if;
    for v_t in
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'member_id' and (c.table_name like 'health\_%' or c.table_name = 'push_subscriptions')
      order by c.table_name
    loop
      execute format('delete from public.%I where member_id = $1', v_t.table_name) using v_m.id;
    end loop;

    -- Their photo album and highlights, with their files.
    if public.account_deletion_has_column('member_avatars', 'storage_path') then
      select v_paths || coalesce(jsonb_agg(jsonb_build_object('bucket', 'avatars', 'path', storage_path)), '[]'::jsonb) into v_paths
      from public.member_avatars where member_id = v_m.id and storage_path is not null;
    end if;
    if public.account_deletion_has_column('highlights', 'storage_path') then
      select v_paths || coalesce(jsonb_agg(jsonb_build_object('bucket', 'documents', 'path', storage_path)), '[]'::jsonb) into v_paths
      from public.highlights where member_id = v_m.id and storage_path is not null;
    end if;

    -- Private money and private documents: only they could see them, so
    -- nobody is left to (a private remittance is its recorder's alone). Their files go too. Household-visible accounts,
    -- assets and documents in their name stay the household's record.
    if public.account_deletion_has_column('accounts', 'is_private') then
      delete from public.accounts where owner_member_id = v_m.id and is_private;
    end if;
    if public.account_deletion_has_column('remittances', 'is_private') then
      delete from public.remittances where is_private and recorded_by = v_m.id;
    end if;
    if public.account_deletion_has_column('utang_entries', 'is_private') then
      delete from public.utang_entries where is_private and recorded_by = v_m.id;
    end if;
    if public.account_deletion_has_column('doc_entries', 'owner_member_id') and public.account_deletion_has_column('doc_entries', 'created_by') then
      if public.account_deletion_has_column('doc_files', 'storage_path') then
        select v_paths || coalesce(jsonb_agg(jsonb_build_object('bucket', 'documents', 'path', f.storage_path)), '[]'::jsonb) into v_paths
        from public.doc_files f join public.doc_entries e on e.id = f.entry_id
        where e.visibility = 'private' and (e.owner_member_id = v_m.id or e.created_by = v_m.id)
          and coalesce(e.owner_member_id, v_m.id) = v_m.id and coalesce(e.created_by, v_m.id) = v_m.id
          and f.storage_path is not null and coalesce(f.storage_provider, 'supabase') = 'supabase';
      end if;
      -- A private document is its owner's and its maker's: it goes only
      -- when both were this person (someone else's stays theirs).
      delete from public.doc_entries
      where visibility = 'private' and (owner_member_id = v_m.id or created_by = v_m.id)
        and coalesce(owner_member_id, v_m.id) = v_m.id and coalesce(created_by, v_m.id) = v_m.id;
    end if;

    -- Everything else about them alone. Each of these cascades from members,
    -- which never fires because the member row is kept. (Letters written to
    -- them stay: the writer still reads them in their own letters.)
    for v_t in
      select * from (values
        ('account_viewers', 'member_id'), ('activity_members', 'member_id'), ('alkansya_entries', 'member_id'),
        ('alkansya_plans', 'member_id'), ('calendar_event_links', 'member_id'), ('calendar_links', 'member_id'),
        ('calendar_sync_failures', 'member_id'), ('calendar_tokens', 'member_id'), ('event_members', 'member_id'),
        ('event_rsvps', 'member_id'), ('family_message_reads', 'member_id'), ('game_awards', 'member_id'),
        ('game_member_badges', 'member_id'), ('game_streaks', 'member_id'), ('highlights', 'member_id'),
        ('journal_entry_people', 'member_id'), ('liquid_intake_log', 'member_id'), ('list_add_tokens', 'member_id'),
        ('meal_plan_members', 'member_id'), ('member_avatars', 'member_id'), ('member_budgets', 'member_id'),
        ('member_checkins', 'member_id'), ('member_locations', 'member_id'), ('member_security', 'member_id'),
        ('member_webauthn_credentials', 'member_id'), ('net_worth_snapshots', 'viewer_member_id'), ('omron_links', 'member_id'),
        ('planner_goal_completions', 'member_id'), ('planner_goals', 'owner_member_id'), ('push_call_rings', 'caller'),
        ('push_call_rings', 'callee'), ('push_handouts', 'recipient'), ('push_tests', 'member_id'),
        ('reward_redemptions', 'member_id'), ('routine_members', 'member_id'), ('send_to_kin_tokens', 'member_id'),
        ('sent_screenshots', 'member_id'), ('sos_alerts', 'member_id'),
        ('trip_travellers', 'member_id'), ('vault_emergency_contacts', 'member_id'), ('wealth_targets', 'member_id')
      ) as x(tbl, key_col)
    loop
      if public.account_deletion_has_column(v_t.tbl, v_t.key_col) then
        execute format('delete from public.%I where %I = $1', v_t.tbl, v_t.key_col) using v_m.id;
      end if;
    end loop;

    -- Rows that copied their name for others to read keep the row and lose
    -- the name. (A pin's pinned_by is a first name with nothing saying whose,
    -- so it cannot be matched and is left.)
    for v_t in
      select * from (values
        ('family_link_messages', 'author_name', 'member_id'), ('family_tree_messages', 'author_name', 'member_id'),
        ('journal_comments', 'author_name', 'member_id'), ('journal_reactions', 'author_name', 'member_id'),
        ('occasion_greetings', 'author_name', 'member_id'), ('potluck_claims', 'member_name', 'member_id'),
        ('remittances', 'sender_name', 'sender_member_id'), ('shared_pot_entries', 'author_name', 'member_id'),
        ('tree_person_stories', 'told_by_name', 'told_by_member_id'), ('time_capsules', 'writer_name', 'writer_member_id'),
        ('gift_draw_people', 'name', 'member_id'), ('gift_list_people', 'name', 'member_id'),
        ('vault_emergency_contacts', 'added_by_name', 'added_by'), ('vault_emergency_requests', 'member_name', 'member_id')
      ) as x(tbl, name_col, key_col)
    loop
      if public.account_deletion_has_column(v_t.tbl, v_t.name_col) and public.account_deletion_has_column(v_t.tbl, v_t.key_col) then
        execute format('update public.%I set %I = ''Former member'' where %I = $1', v_t.tbl, v_t.name_col, v_t.key_col) using v_m.id;
      end if;
    end loop;
    -- The vault's emergency log names people without an id beside the name:
    -- the opener through their request; the grown-ups who allowed, denied,
    -- revoked or dismissed by the name they had in that household -- unless
    -- someone else there has the same name (a Jr. and a Sr.), when it can't
    -- be told whose it is and is left.
    if public.account_deletion_has_column('vault_emergency_opens', 'request_id') and public.account_deletion_has_column('vault_emergency_requests', 'member_id') then
      update public.vault_emergency_opens set member_name = 'Former member'
      where request_id in (select id from public.vault_emergency_requests where member_id = v_m.id);
    end if;
    if public.account_deletion_has_column('vault_emergency_requests', 'allowed_by_name')
       and not exists (select 1 from public.members o where o.family_id = v_m.family_id and o.id <> v_m.id and o.full_name = v_m.full_name) then
      update public.vault_emergency_requests set allowed_by_name = 'Former member' where family_id = v_m.family_id and allowed_by_name = v_m.full_name;
      update public.vault_emergency_requests set denied_by_name = 'Former member' where family_id = v_m.family_id and denied_by_name = v_m.full_name;
      update public.vault_emergency_requests set revoked_by_name = 'Former member' where family_id = v_m.family_id and revoked_by_name = v_m.full_name;
    end if;
    if public.account_deletion_has_column('vault_emergency_notices', 'dismissed_by_name')
       and not exists (select 1 from public.members o where o.family_id = v_m.family_id and o.id <> v_m.id and o.full_name = v_m.full_name) then
      update public.vault_emergency_notices set dismissed_by_name = 'Former member' where family_id = v_m.family_id and dismissed_by_name = v_m.full_name;
    end if;
    -- The household's tree keeps its person (the household's own record of
    -- its family, as for a relative who never had an account), no longer
    -- tied to the account.
    if public.account_deletion_has_column('family_tree_people', 'member_id') then
      update public.family_tree_people set member_id = null where member_id = v_m.id;
    end if;

    -- The row stays, so what they wrote for the household still has an
    -- author; the author is now "Former member", with nothing else of theirs.
    -- A membership they moved out of stays 'moved' (history), emptied alike.
    update public.members set
      full_name = 'Former member',
      auth_user_id = null,
      status = case when status = 'moved' then 'moved' else 'removed' end,
      is_organiser = false
    where id = v_m.id;
    for v_t in
      select c.column_name from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'members' and c.is_nullable = 'YES'
        and c.column_name = any (array['email', 'mobile', 'dob', 'avatar_url', 'cover_avatar_id', 'sex', 'allergies', 'blood_type',
          'college', 'employer_name', 'employment_end_date', 'employment_start_date', 'height', 'high_school', 'insurance_info',
          'pagibig_number', 'pants_size', 'philhealth_number', 'physician_name', 'place_of_birth', 'relationship', 'shoe_size',
          'sss_number', 'tin_number', 'tshirt_size', 'weight', 'work_contact_info', 'work_email', 'brief_hash', 'calendar_feed_hash',
          'timezone', 'color'])
    loop
      execute format('update public.members set %I = null where id = $1', v_t.column_name) using v_m.id;
    end loop;
    for v_t in
      select c.column_name from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'members' and c.column_default is not null
        and c.column_name = any (array['notification_prefs', 'quick_actions'])
    loop
      execute format('update public.members set %I = default where id = $1', v_t.column_name) using v_m.id;
    end loop;

    -- Nobody left in the household now -- they were alone, or the last of
    -- several who asked: it is to be deleted. Anyone still in it (a child,
    -- a grown-up whose own request is still waiting) keeps it; the last one
    -- out finds it empty here.
    if v_m.status not in ('removed', 'moved')
       and not exists (select 1 from public.members o where o.family_id = v_m.family_id and o.status in ('active', 'managed')) then
      v_families := v_families || v_m.family_id;
    end if;
  end loop;

  delete from public.account_deletions where auth_user_id = p_user;
  perform set_config('kin.account_deletion', '', true);
  return jsonb_build_object('person_id', v_person, 'files', v_paths, 'keep_files', v_keep, 'delete_families', to_jsonb(v_families));
end;
$$;

/** A household with nobody left in it, deleted as the Delete household
 * button deletes one: its health photo rows forgotten and their paths handed
 * back (#777), and the paths of its journal files kept in a person's folder,
 * then the families row, whose cascade takes the rest. The
 * caller then sweeps the household's folders. Refuses while anyone is still
 * in it -- a grown-up, or children, whose profiles are never deleted by an
 * account deletion. For the job only (service role). */
create or replace function public.delete_household_for_account_deletion(p_family uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[] := '{}';
begin
  if exists (select 1 from public.members where family_id = p_family and status in ('active', 'managed')) then
    raise exception 'the household still has someone in it';
  end if;
  if to_regclass('public.health_medicine_photos') is not null then
    with gone as (delete from public.health_medicine_photos where family_id = p_family returning storage_path)
    select v_paths || coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}') into v_paths from gone;
  end if;
  if to_regclass('public.health_visit_photos') is not null then
    with gone as (delete from public.health_visit_photos where family_id = p_family returning storage_path)
    select v_paths || coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}') into v_paths from gone;
  end if;
  -- Its journal photos and videos filed under someone's own folder (an
  -- entry added from "Just me"): the household's folder sweep never sees
  -- them, and their rows go with the household.
  if public.account_deletion_has_column('journal_media', 'storage_path') then
    select v_paths || coalesce(array_agg(storage_path), '{}') into v_paths
    from public.journal_media where family_id = p_family and storage_path like 'person/%';
  end if;
  if public.account_deletion_has_column('journal_entry_videos', 'poster_path') then
    select v_paths || coalesce(array_agg(p), '{}') into v_paths
    from public.journal_entry_videos v, unnest(array[v.storage_path, v.poster_path]) p
    where v.family_id = p_family and p like 'person/%';
  end if;
  delete from public.families where id = p_family;
  return v_paths;
end;
$$;

-- Three triggers stood in the way of "Former member". Each rewrites or
-- refuses an UPDATE for its own good reasons (a letter or a potluck claim
-- keeps the name it was written under; an unsent message can't be edited),
-- so renaming the author was silently undone, or refused and the whole job
-- with it. Each now lets the deletion job through, and nothing else: only
-- finalize_account_deletion sets kin.account_deletion, for its own
-- transaction. Otherwise unchanged from their latest versions
-- (20260930150100, 20261012090100, 20261020231000).

create or replace function public.chat_room_message_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('kin.account_deletion', true), '') = 'on' then
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'That message was removed.' using errcode = 'check_violation';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';
    new.edited_at := old.edited_at;
  else
    new.deleted_at := null;
    if new.body is distinct from old.body then
      if btrim(new.body) = '' then
        raise exception 'An edit needs some words. Unsend it instead.' using errcode = 'check_violation';
      end if;
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.time_capsules_fill()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_dob date;
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('kin.account_deletion', true), '') = 'on' then
    return new;
  end if;
  new.open_when := nullif(btrim(coalesce(new.open_when, '')), '');
  if tg_op = 'INSERT' then
    new.family_id := (select public.current_family_id());
    new.writer_member_id := (select public.current_member_id());
    new.writer_name := coalesce((select m.full_name from public.members m where m.id = new.writer_member_id), '');
    new.created_at := now();
    new.notified_at := null;
    new.opened_at := null;
    if new.open_when is not null then
      new.opens_on := null;
    elsif new.opens_on is null then
      select m.dob into v_dob from public.members m
        where m.id = new.recipient_member_id and m.family_id = new.family_id;
      if v_dob is null then
        raise exception 'Pick the day this letter opens.' using errcode = '22023';
      end if;
      new.opens_on := (v_dob + interval '18 years')::date;
      if coalesce(new.occasion, '') = '' then
        new.occasion := '18th birthday';
      end if;
    end if;
  else
    new.family_id := old.family_id;
    new.writer_member_id := old.writer_member_id;
    new.reply_to := old.reply_to;
    new.writer_name := old.writer_name;
    new.created_at := old.created_at;
    -- notified_at is left alone: the notifier sets it, and the only person
    -- who may otherwise update a letter is its writer. opened_at is the
    -- recipient's to set (open_letter), never anyone else's.
    if new.opened_at is distinct from old.opened_at
       and old.recipient_member_id is distinct from public.current_member_id() then
      new.opened_at := old.opened_at;
    end if;
  end if;
  if new.open_when is not null or new.reply_to is not null then
    new.open_to_sign := false;
  end if;
  new.occasion := btrim(coalesce(new.occasion, ''));
  return new;
end;
$$;

create or replace function public.potluck_claims_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  taken integer;
  g record;
  guest_event uuid;
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('kin.account_deletion', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.item_id is distinct from old.item_id or new.member_id is distinct from old.member_id or new.guest_id is distinct from old.guest_id then
      raise exception 'A claim stays on its item, in its claimer''s name.';
    end if;
    new.event_id := old.event_id;
    new.event_family_id := old.event_family_id;
    new.family_id := old.family_id;
    new.member_name := old.member_name;
    new.household_name := old.household_name;
    new.created_at := old.created_at;
  elsif new.guest_id is not null then
    if coalesce(current_setting('kin.guest', true), '') <> 'yes' then
      raise exception 'A claim is in your own name.';
    end if;
    select e.name, e.family_id, e.event_id into g from public.event_guests e where e.id = new.guest_id;
    if g.name is null then
      raise exception 'That guest is no longer on the list.';
    end if;
    guest_event := g.event_id;
    new.member_id := null;
    new.family_id := g.family_id;
    new.member_name := g.name;
    new.household_name := '';
    new.created_at := now();
  else
    if new.member_id is distinct from public.current_member_id() or new.family_id is distinct from public.current_family_id() then
      raise exception 'A claim is in your own name.';
    end if;
    new.member_name := coalesce((select m.full_name from public.members m where m.id = new.member_id), '');
    new.household_name := coalesce((select f.name from public.families f where f.id = new.family_id), '');
    new.created_at := now();
  end if;

  select i.id, i.event_id, i.family_id, i.wanted into item from public.potluck_items i where i.id = new.item_id for update;
  if item.id is null then
    raise exception 'That item is no longer on the list.';
  end if;
  if guest_event is not null and item.event_id is distinct from guest_event then
    raise exception 'That item is on another event.';
  end if;
  new.event_id := item.event_id;
  new.event_family_id := item.family_id;

  select coalesce(sum(c.qty), 0) into taken from public.potluck_claims c where c.item_id = new.item_id and c.id <> new.id;
  if taken + new.qty > item.wanted then
    raise exception 'Only % left to bring.', greatest(item.wanted - taken, 0);
  end if;
  return new;
end;
$$;

revoke all on function public.account_deletion_has_column(text, text) from public, anon, authenticated;
revoke all on function public.account_handover_plan(uuid) from public, anon, authenticated;
revoke all on function public.finalize_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.delete_household_for_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.finalize_account_deletion(uuid) to service_role;
grant execute on function public.delete_household_for_account_deletion(uuid) to service_role;
