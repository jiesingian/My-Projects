-- Delete my account, with 7 days to change your mind (Jonathan, 21 October;
-- the Data Privacy Act's right to erasure, and the app stores require it).
--
-- Settings → Account → Delete my account asks for the words typed out, then
-- request_account_deletion() records the day. For 7 days nothing is removed:
-- signing in offers "Keep my account" (cancel_account_deletion()). After
-- that, the daily kin-account-deletions job posts to /api/cron/account-
-- deletions, which calls finalize_account_deletion() for each one that is
-- due, removes the files it names and the login itself.
--
-- What goes: the person's own data -- their personal space (journal, notes,
-- goals and media they own), the health records about them and their photos,
-- their connections, saved and scheduled messages, push subscriptions and
-- read markers -- and their name and details on every member row.
-- What stays: household-shared records they wrote (events, lists, money,
-- chat), with the author shown as "Former member": the member row is kept,
-- renamed and emptied, so every place that names an author says that.
-- Children's managed profiles are never touched: only rows signed in as this
-- login are. If they were the household's last grown-up organizer, another
-- grown-up becomes organizer (account_handover_plan); if no grown-up is left,
-- the household itself is deleted the way the Delete household button does
-- it (delete_household's `delete from families`, and #777's health photo
-- paths handed back so their files go too).

create table if not exists public.account_deletions (
  auth_user_id uuid primary key,
  requested_at timestamptz not null default now(),
  delete_after timestamptz not null default now() + interval '7 days'
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public, anon, authenticated;
grant select on public.account_deletions to authenticated;
drop policy if exists account_deletions_own on public.account_deletions;
create policy account_deletions_own on public.account_deletions
  for select to authenticated using (auth_user_id = auth.uid());

/** What happens to a household when this member's account goes:
 * 'none' (not its organizer, or another grown-up organizer remains),
 * 'handover' (to_member becomes organizer: the next active grown-up, a
 * parent before an adult, longest in the household first), or
 * 'delete_household' (no other active grown-up). lib/account-deletion.ts
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
  return jsonb_build_object('kind', 'delete_household', 'family_id', v_m.family_id);
end;
$$;

/** Asks for the caller's account to be deleted in 7 days. Says what will
 * happen to their household, so the screen can tell them. */
create or replace function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_after timestamptz;
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  insert into public.account_deletions (auth_user_id) values (auth.uid())
  on conflict (auth_user_id) do nothing;
  select delete_after into v_after from public.account_deletions where auth_user_id = auth.uid();
  select id into v_member from public.members where auth_user_id = auth.uid() and status = 'active' limit 1;
  return jsonb_build_object('delete_after', v_after, 'plan', public.account_handover_plan(v_member));
end;
$$;

/** "Keep my account": the caller's request is forgotten. */
create or replace function public.cancel_account_deletion()
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.account_deletions where auth_user_id = auth.uid() returning 1)
  select exists (select 1 from gone)
$$;

/** What the delete screen shows before anything is asked: the plan for the
 * caller's household if their account went today. */
create or replace function public.my_account_deletion_plan()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.account_handover_plan(
    (select id from public.members where auth_user_id = auth.uid() and status = 'active' limit 1)
  )
$$;

/** The ones whose 7 days are up. For the job only. */
create or replace function public.due_account_deletions()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth_user_id from public.account_deletions where delete_after <= now() order by delete_after limit 50
$$;

/** Removes one person's own data and hands over or deletes what depends on
 * them; see the top of this file. For the job only (service role). Returns
 * the person, the files to remove ({bucket, path}), and the households that
 * now have no grown-up and are to be deleted with
 * delete_household_for_account_deletion. */
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
  v_families uuid[] := '{}';
  v_t record;
begin
  if p_user is null then
    return null;
  end if;
  select id into v_person from public.people where auth_user_id = p_user;
  perform set_config('kin.privileged', 'on', true);

  -- The personal space: whatever this person owns, wherever it is filed.
  if v_person is not null then
    if to_regclass('public.journal_media') is not null then
      select v_paths || coalesce(jsonb_agg(jsonb_build_object('bucket', 'journal', 'path', storage_path)), '[]'::jsonb) into v_paths
      from public.journal_media where owner_person_id = v_person and storage_path is not null;
    end if;
    for v_t in
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'owner_person_id'
      order by (c.table_name = 'journal_entries')  -- media and the rest before the entries they hang off
    loop
      execute format('delete from public.%I where owner_person_id = $1', v_t.table_name) using v_person;
    end loop;
    for v_t in
      select unnest(array['connections', 'connection_codes', 'saved_messages', 'scheduled_messages', 'chat_thread_prefs', 'chat_reads']) as table_name
    loop
      if to_regclass('public.' || v_t.table_name) is not null then
        if v_t.table_name = 'connections' then
          delete from public.connections where requester_person_id = v_person or addressee_person_id = v_person;
        else
          execute format('delete from public.%I where person_id = $1', v_t.table_name) using v_person;
        end if;
      end if;
    end loop;
  end if;

  for v_m in
    select * from public.members where auth_user_id = p_user and status not in ('removed', 'moved')
  loop
    v_plan := public.account_handover_plan(v_m.id);
    if v_plan->>'kind' = 'handover' then
      update public.members set is_organiser = true where id = (v_plan->>'to_member')::uuid;
    elsif v_plan->>'kind' = 'delete_household' then
      v_families := v_families || v_m.family_id;
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

    -- The row stays, so what they wrote for the household still has an
    -- author; the author is now "Former member", with nothing else of theirs.
    update public.members set
      full_name = 'Former member',
      auth_user_id = null,
      status = 'removed',
      is_organiser = false
    where id = v_m.id;
    -- Every personal column this database has, emptied where it can be.
    for v_t in
      select c.column_name from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'members' and c.is_nullable = 'YES'
        and c.column_name = any (array['email', 'mobile', 'dob', 'avatar_url', 'cover_avatar_id', 'sex', 'allergies', 'blood_type',
          'college', 'employer_name', 'employment_end_date', 'employment_start_date', 'height', 'high_school', 'insurance_info',
          'pagibig_number', 'pants_size', 'philhealth_number', 'physician_name', 'place_of_birth', 'relationship', 'shoe_size',
          'sss_number', 'tin_number', 'tshirt_size', 'weight', 'work_contact_info', 'work_email', 'brief_hash', 'calendar_feed_hash'])
    loop
      execute format('update public.members set %I = null where id = $1', v_t.column_name) using v_m.id;
    end loop;
  end loop;

  delete from public.account_deletions where auth_user_id = p_user;
  return jsonb_build_object('person_id', v_person, 'files', v_paths, 'delete_families', to_jsonb(v_families));
end;
$$;

/** A household left with no grown-up, deleted as the Delete household
 * button deletes one: its health photo rows forgotten and their paths handed
 * back (#777), then the families row, whose cascade takes the rest. The
 * caller then sweeps the household's folders. Refuses while any active
 * grown-up remains. For the job only (service role). */
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
    raise exception 'the household still has a grown-up';
  end if;
  if to_regclass('public.health_medicine_photos') is not null then
    with gone as (delete from public.health_medicine_photos where family_id = p_family returning storage_path)
    select v_paths || coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}') into v_paths from gone;
  end if;
  if to_regclass('public.health_visit_photos') is not null then
    with gone as (delete from public.health_visit_photos where family_id = p_family returning storage_path)
    select v_paths || coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}') into v_paths from gone;
  end if;
  delete from public.families where id = p_family;
  return v_paths;
end;
$$;

/** Posts to /api/cron/account-deletions once a day, beside the reminders
 * route Vault already names (kin_cron_url), with the same secret. */
create or replace function public.kin_fire_account_deletions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u text := kin_vault_secret('kin_cron_url');
  s text := kin_vault_secret('kin_cron_secret');
begin
  if u is null or s is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return;
  end if;
  u := regexp_replace(u, '/api/cron/reminders.*$', '/api/cron/account-deletions');
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := jsonb_build_object(''Authorization'', ''Bearer '' || $2, ''Content-Type'', ''application/json''), timeout_milliseconds := 60000)'
    using u, s;
end;
$$;

revoke all on function public.account_handover_plan(uuid) from public, anon, authenticated;
revoke all on function public.request_account_deletion() from public, anon;
revoke all on function public.cancel_account_deletion() from public, anon;
revoke all on function public.my_account_deletion_plan() from public, anon;
revoke all on function public.due_account_deletions() from public, anon, authenticated;
revoke all on function public.finalize_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.delete_household_for_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.kin_fire_account_deletions() from public, anon, authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;
grant execute on function public.my_account_deletion_plan() to authenticated;
grant execute on function public.due_account_deletions() to service_role;
grant execute on function public.finalize_account_deletion(uuid) to service_role;
grant execute on function public.delete_household_for_account_deletion(uuid) to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    execute $c$ select cron.unschedule('kin-account-deletions') $c$;
  end if;
exception when others then
  null;
end
$$;

do $$
begin
  if to_regnamespace('cron') is not null then
    execute $c$ select cron.schedule('kin-account-deletions', '43 18 * * *', 'select public.kin_fire_account_deletions()') $c$;
  end if;
end
$$;
