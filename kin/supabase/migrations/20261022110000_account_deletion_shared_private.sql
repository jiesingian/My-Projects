-- Account deletion, three gaps in 20261022090000 (wrap-up review, 22 October).
--
-- 1. A private Wealth account its owner had shared (account_viewers,
--    20261013190000) was deleted with them, and with it the movements the
--    person they shared it with could see. Only a private account nobody
--    else is named on goes now.
-- 2. A "just me" paluwagan (20261019110000: is_private, recorded_by) was
--    left behind, names and all, where nobody could ever read it again. It
--    goes now, as private utang and remittances already did.
-- 3. Check-ins they asked of someone else (member_checkins.asked_by) were
--    left pointing at "Former member"; the cascade from members that the
--    job stands in for would have removed them.
--
-- finalize_account_deletion is otherwise exactly as 20261022090000 left it.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.


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
    -- A private account they named someone else on (account_viewers, "my
    -- wife may see it") is not theirs alone: it stays, with its movements,
    -- for whoever they shared it with.
    if public.account_deletion_has_column('accounts', 'is_private') then
      if to_regclass('public.account_viewers') is not null then
        delete from public.accounts a where a.owner_member_id = v_m.id and a.is_private
          and not exists (select 1 from public.account_viewers v where v.account_id = a.id and v.member_id <> v_m.id);
      else
        delete from public.accounts where owner_member_id = v_m.id and is_private;
      end if;
    end if;
    if public.account_deletion_has_column('remittances', 'is_private') then
      delete from public.remittances where is_private and recorded_by = v_m.id;
    end if;
    if public.account_deletion_has_column('utang_entries', 'is_private') then
      delete from public.utang_entries where is_private and recorded_by = v_m.id;
    end if;
    -- A "just me" paluwagan is its recorder's alone, like utang; its members
    -- and payments cascade with it.
    if public.account_deletion_has_column('paluwagan_groups', 'is_private') then
      delete from public.paluwagan_groups where is_private and recorded_by = v_m.id;
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
        ('member_checkins', 'member_id'), ('member_checkins', 'asked_by'), ('member_locations', 'member_id'), ('member_security', 'member_id'),
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

revoke all on function public.finalize_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.finalize_account_deletion(uuid) to service_role;
