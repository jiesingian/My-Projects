-- The last grown-up out takes the household with them (Jonathan, 22 October:
-- "proceed as recommended").
--
-- 20261022090000 kept a household whose last grown-up deleted their account
-- for the children left in it ('children_stay'). Nobody could look after it
-- from then on: a child can't approve a join request or invite a grown-up,
-- and nobody outside it could reach it. Now no household is ever left with
-- only children in it:
--
-- - The delete screen says so before anything is asked ('last_grown_up'),
--   and offers the way to hand it over first: invite another grown-up and
--   let them in, and they become its organizer (the 'handover' that already
--   existed).
-- - When the job deletes the account of a household's last grown-up, the
--   household is deleted with it, as Delete household deletes one: the
--   children's profiles and everything in it. A grown-up whose own request
--   is still waiting still counts -- they may yet keep their account -- so
--   the household goes with whichever of them is deleted last.
--
-- Production had no household with only children in it when this was
-- written (read 22 October), and no account waiting to be deleted.
--
-- Also: a household with anyone on its family tree could not be deleted at
-- all, by Delete household or by this job. family_tree_people.family_id
-- (20260911024650) is the one reference to families without on delete
-- cascade or set null, so deleting the families row was refused (4 of 6
-- households in production have a tree). It now cascades like the rest;
-- everything that points at a tree person is cascade or set null already.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

do $$
begin
  if to_regclass('public.family_tree_people') is not null then
    alter table public.family_tree_people drop constraint if exists family_tree_people_family_id_fkey;
    alter table public.family_tree_people add constraint family_tree_people_family_id_fkey
      foreign key (family_id) references public.families(id) on delete cascade;
  end if;
end
$$;

/** What happens to a household when this member's account goes:
 * 'none' (a child, or a grown-up who is not its organizer while another
 * grown-up stays, or another grown-up organizer remains),
 * 'handover' (to_member becomes organizer: the next active grown-up, a
 * parent before an adult, longest in the household first),
 * 'last_grown_up' (no other grown-up who is staying, but others remain:
 * unless a grown-up joins first, the household is deleted with them,
 * children's profiles and all), or
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
  if v_m.id is null or v_m.role not in ('parent', 'adult') then
    return jsonb_build_object('kind', 'none');
  end if;
  select o.id into v_to from public.members o
  where o.family_id = v_m.family_id and o.id <> v_m.id and o.status = 'active'
    and o.role in ('parent', 'adult')
    and not exists (select 1 from public.account_deletions d where d.auth_user_id = o.auth_user_id)
  order by (o.role = 'parent') desc, o.created_at, o.id
  limit 1;
  if v_to is not null then
    if not v_m.is_organiser or exists (
      select 1 from public.members o
      where o.family_id = v_m.family_id and o.id <> v_m.id and o.status = 'active'
        and o.is_organiser and o.role in ('parent', 'adult')
        and not exists (select 1 from public.account_deletions d where d.auth_user_id = o.auth_user_id)
    ) then
      return jsonb_build_object('kind', 'none');
    end if;
    return jsonb_build_object('kind', 'handover', 'to_member', v_to);
  end if;
  if exists (
    select 1 from public.members o
    where o.family_id = v_m.family_id and o.id <> v_m.id and o.status in ('active', 'managed')
      and not exists (select 1 from public.account_deletions d where d.auth_user_id = o.auth_user_id)
  ) then
    return jsonb_build_object('kind', 'last_grown_up', 'family_id', v_m.family_id);
  end if;
  return jsonb_build_object('kind', 'delete_household', 'family_id', v_m.family_id);
end;
$$;

/** Removes one person's own data and hands over or deletes what depends on
 * them; see the top of this file, of 20261022090000 and of 20261021020000. For the job only
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
      -- 'last_grown_up' and 'delete_household' are decided below, once
      -- their row is emptied.
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

    -- No grown-up left in the household now -- they were alone, the last
    -- of several who asked, or the last grown-up with children: it is to be
    -- deleted, children's profiles and all (20261022160000). A grown-up
    -- whose own request is still waiting keeps it; the last one out finds
    -- no grown-up here.
    if v_m.status not in ('removed', 'moved')
       and not exists (
         select 1 from public.members o
         where o.family_id = v_m.family_id and o.status = 'active' and o.role in ('parent', 'adult')
       ) then
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

/** A household with no grown-up left in it, deleted as the Delete household
 * button deletes one: its health photo rows forgotten and their paths handed
 * back (#777), and the paths of its journal files kept in a person's folder,
 * then the families row, whose cascade takes the rest, children's profiles
 * included. The caller then sweeps the household's folders. Refuses while a
 * grown-up is still in it. For the job only (service role). */
create or replace function public.delete_household_for_account_deletion(p_family uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[] := '{}';
begin
  if exists (select 1 from public.members where family_id = p_family and status = 'active' and role in ('parent', 'adult')) then
    raise exception 'the household still has a grown-up in it';
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

revoke all on function public.account_handover_plan(uuid) from public, anon, authenticated;
revoke all on function public.delete_household_for_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.delete_household_for_account_deletion(uuid) to service_role;
