-- Emergency access to the vault (approved by Jonathan, 14 October).
--
-- Inside a household every grown-up already reads the whole vault: the
-- passwords (20260924100000_family_vault.sql) and the documents. What was
-- missing is the worst day -- a single parent in hospital, both parents
-- abroad and out of reach, a death -- when nobody in the house can open it
-- and somebody has to find the insurance policy or the passport.
--
-- So a household can name up to two trusted grown-ups from a household linked
-- with theirs (a sibling, an adult child with a household of their own on
-- Kin), each with a wait of 1, 3 or 7 days. Like 1Password's recovery,
-- Apple's Legacy Contact and Google's Inactive Account Manager:
--
--  1. The trusted person asks, with a short reason.
--  2. Every grown-up of the household is pushed at once, and once a day while
--     it waits (due_vault_emergency_reminders, on the five-minute tick). Any
--     of them can say no (Deny) or yes now (Allow now).
--  3. If nobody says no before the wait ends, it opens: read-only, the
--     household's passwords and the documents kept in Kin's own storage, for
--     30 days or until a grown-up here takes it back (Revoke). A new request
--     renews it.
--  4. Every item the trusted person opens is logged, and the household sees
--     the log ("Ate Liza opened Passport (Mia), 12 Nov 3:40 pm").
--
-- WHAT IS ENFORCED HERE, NOT IN THE PAGE
--
--  * Whether a request is waiting, open, denied, revoked or expired is worked
--    out from its timestamps and now() by vault_emergency_status(). Nothing
--    stores a status, so no app clock and no missed job can leave a grant
--    open past its time.
--  * The trusted person gets no new row-level policy on the vault itself.
--    family_vault_items, doc_entries and doc_files are untouched: they still
--    answer to the household only, and they stay unwritable from outside it.
--    The trusted person reads through two security-definer functions --
--    vault_emergency_items() (names only, no secrets) and
--    open_vault_emergency_item() (one item, logged in the same transaction)
--    -- so an item cannot be read without the household seeing that it was.
--  * A document's file in the documents bucket is readable to them only while
--    the grant is open, only for a file indexed on a shareable entry of that
--    household, only under that household's folder, and only within an hour
--    of opening that entry (so the file read is logged as well). The bucket
--    also holds chat photos; those stay the household's alone.
--  * Documents kept in the household's Google Drive cannot be shared this
--    way: Kin holds only their index, and the file belongs to Google.
--
-- WHAT IS SHARED
--
-- Every vault item (grown-ups see all of them, and this person stands in for
-- the grown-ups) and every document entry marked "Whole family" or "Parents
-- only". A "Just me" document stays its keeper's.
--
-- KIN PLUS
--
-- Naming someone needs Kin Plus, like everything new in the vault. Once named,
-- asking and an open grant keep working if the household later drops to Kin
-- Free: the household may have lapsed precisely because the person who pays
-- is the one in hospital.
--
-- Names across households travel on the rows (the household's name, the
-- trusted person's name and household), copied by these functions when the
-- row is written, never read from the other household's members by a policy.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- 1. The trusted people a household names --------------------------------------

create table if not exists public.vault_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  -- The household whose vault this is.
  family_id uuid not null references public.families(id) on delete cascade,
  family_name text not null,
  -- The trusted person: their membership in their OWN household.
  member_id uuid not null references public.members(id) on delete cascade,
  member_family_id uuid not null references public.families(id) on delete cascade,
  member_name text not null,
  member_household_name text not null,
  wait_days integer not null default 3,
  added_by uuid references public.members(id) on delete set null,
  added_by_name text not null default '',
  created_at timestamptz not null default now(),
  constraint vault_emergency_contacts_wait check (wait_days in (1, 3, 7)),
  constraint vault_emergency_contacts_other_household check (member_family_id <> family_id),
  constraint vault_emergency_contacts_once unique (family_id, member_id)
);

create index if not exists vault_emergency_contacts_member_idx on public.vault_emergency_contacts (member_id);

alter table public.vault_emergency_contacts enable row level security;

-- Read: the household's grown-ups, and the trusted person their own row.
-- Every write goes through the functions below; there is deliberately no
-- insert, update or delete policy.
drop policy if exists vault_emergency_contacts_select on public.vault_emergency_contacts;
create policy vault_emergency_contacts_select on public.vault_emergency_contacts
  for select to authenticated using (
    (family_id = (select public.current_family_id()) and (select public.current_member_role()) in ('parent', 'adult'))
    or (member_family_id = (select public.current_family_id()) and member_id = (select public.current_member_id()))
  );

revoke insert, update, delete on public.vault_emergency_contacts from anon, authenticated;

-- 2. Requests ---------------------------------------------------------------------

create table if not exists public.vault_emergency_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  family_name text not null,
  -- Null once the household took the person off its list: the request is
  -- then over, whatever its timestamps say.
  contact_id uuid references public.vault_emergency_contacts(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,
  member_name text not null,
  member_household_name text not null,
  reason text not null,
  wait_days integer not null,
  requested_at timestamptz not null default now(),
  allowed_at timestamptz,
  allowed_by_name text,
  denied_at timestamptz,
  denied_by_name text,
  revoked_at timestamptz,
  revoked_by_name text,
  constraint vault_emergency_requests_reason check (char_length(btrim(reason)) between 3 and 300),
  constraint vault_emergency_requests_wait check (wait_days in (1, 3, 7))
);

create index if not exists vault_emergency_requests_family_idx on public.vault_emergency_requests (family_id, requested_at desc);
create index if not exists vault_emergency_requests_contact_idx on public.vault_emergency_requests (contact_id, requested_at desc);
create index if not exists vault_emergency_requests_member_idx on public.vault_emergency_requests (member_id);

alter table public.vault_emergency_requests enable row level security;

drop policy if exists vault_emergency_requests_select on public.vault_emergency_requests;
create policy vault_emergency_requests_select on public.vault_emergency_requests
  for select to authenticated using (
    (family_id = (select public.current_family_id()) and (select public.current_member_role()) in ('parent', 'adult'))
    or member_id = (select public.current_member_id())
  );

revoke insert, update, delete on public.vault_emergency_requests from anon, authenticated;

-- 3. Every item opened ------------------------------------------------------------

create table if not exists public.vault_emergency_opens (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  request_id uuid references public.vault_emergency_requests(id) on delete set null,
  member_name text not null,
  item_kind text not null,
  item_id uuid not null,
  item_label text not null,
  opened_at timestamptz not null default now(),
  constraint vault_emergency_opens_kind check (item_kind in ('password', 'document'))
);

create index if not exists vault_emergency_opens_family_idx on public.vault_emergency_opens (family_id, opened_at desc);
create index if not exists vault_emergency_opens_request_idx on public.vault_emergency_opens (request_id, item_id, opened_at desc);

alter table public.vault_emergency_opens enable row level security;

-- The household's grown-ups read the log. Only open_vault_emergency_item()
-- writes it, so nobody can add to it, tidy it or wipe it.
drop policy if exists vault_emergency_opens_select on public.vault_emergency_opens;
create policy vault_emergency_opens_select on public.vault_emergency_opens
  for select to authenticated using (
    family_id = (select public.current_family_id()) and (select public.current_member_role()) in ('parent', 'adult')
  );

revoke insert, update, delete on public.vault_emergency_opens from anon, authenticated;

-- 4. Status, from timestamps and now() ----------------------------------------------
--
-- The one place a request's state is decided. A grant opens when the wait
-- ends (or when a grown-up allows it sooner) and lasts 30 days from then.

create or replace function public.vault_emergency_opens_at(r public.vault_emergency_requests)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(r.allowed_at, r.requested_at + make_interval(days => r.wait_days));
$$;

create or replace function public.vault_emergency_status(r public.vault_emergency_requests, p_now timestamptz default now())
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when r.denied_at is not null then 'denied'
    when r.revoked_at is not null or r.contact_id is null then 'revoked'
    when p_now < public.vault_emergency_opens_at(r) then 'waiting'
    when p_now >= public.vault_emergency_opens_at(r) + interval '30 days' then 'expired'
    else 'open'
  end;
$$;

-- 5. Who the caller is, for the functions below -------------------------------------

-- The household of an OPEN grant the caller asked for, or null. Re-checks
-- everything each time: still the person named, still an active grown-up,
-- the two households still linked, and the grant open now.
create or replace function public.vault_emergency_granted_family(p_request uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.family_id
  from public.vault_emergency_requests r
  join public.vault_emergency_contacts c on c.id = r.contact_id and c.family_id = r.family_id and c.member_id = r.member_id
  join public.members m on m.id = r.member_id
  where r.id = p_request
    and auth.uid() is not null
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('parent', 'adult')
    and m.family_id <> r.family_id
    and public.families_are_linked(r.family_id, m.family_id)
    and public.vault_emergency_status(r, now()) = 'open';
$$;

revoke all on function public.vault_emergency_granted_family(uuid) from public, anon, authenticated;

-- The caller's membership as a grown-up of a given household, or null.
create or replace function public.vault_emergency_grownup_of(p_family uuid)
returns public.members
language sql
stable
security definer
set search_path = ''
as $$
  select m.*
  from public.members m
  where m.family_id = p_family
    and auth.uid() is not null
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('parent', 'adult')
  limit 1;
$$;

revoke all on function public.vault_emergency_grownup_of(uuid) from public, anon, authenticated;

-- 6. The owning household's side ---------------------------------------------------

-- Who may be named: grown-ups with a Kin login in a household linked with
-- ours that shares with relatives -- the same people whose names already
-- reach us on the family feed -- and nobody who is also a member here.
create or replace function public.vault_emergency_candidates()
returns table (member_id uuid, full_name text, household_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.full_name, f.name
  from public.members me
  join public.members m on m.family_id <> me.family_id
  join public.families f on f.id = m.family_id
  where auth.uid() is not null
    and me.auth_user_id = auth.uid()
    and me.status = 'active'
    and me.role in ('parent', 'adult')
    and me.family_id = public.current_family_id()
    and m.status = 'active'
    and m.role in ('parent', 'adult')
    and m.auth_user_id is not null
    and m.auth_user_id <> auth.uid()
    and f.share_with_relatives
    and public.families_are_linked(me.family_id, m.family_id)
    and not exists (
      select 1 from public.members x
      where x.family_id = me.family_id
        and x.status = 'active'
        and (x.auth_user_id = m.auth_user_id or (m.person_id is not null and x.person_id = m.person_id))
    )
  order by f.name, m.full_name;
$$;

revoke all on function public.vault_emergency_candidates() from public, anon;
grant execute on function public.vault_emergency_candidates() to authenticated;

-- Name someone, or change their wait. Two at most.
create or replace function public.name_vault_emergency_contact(p_member uuid, p_wait_days integer default 3)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me public.members;
  v_family public.families;
  v_them record;
  v_id uuid;
begin
  v_me := public.vault_emergency_grownup_of(public.current_family_id());
  if v_me.id is null then
    raise exception 'Only a grown-up of this household can name someone';
  end if;
  if p_wait_days is null or p_wait_days not in (1, 3, 7) then
    raise exception 'The wait is 1, 3 or 7 days';
  end if;

  -- Serialises two grown-ups naming at once, so "two at most" holds.
  select * into v_family from public.families where id = v_me.family_id for update;

  if not public.family_has_plus(v_family.id) then
    raise exception 'kin_plus_required: The vault is part of Kin Plus' using errcode = 'P0001';
  end if;

  select c.member_id, c.full_name, c.household_name, m.family_id into v_them
  from public.vault_emergency_candidates() c
  join public.members m on m.id = c.member_id
  where c.member_id = p_member;
  if v_them.member_id is null then
    raise exception 'That person cannot be named: only a grown-up with Kin in a linked household';
  end if;

  if (select count(*) from public.vault_emergency_contacts c where c.family_id = v_family.id and c.member_id <> p_member) >= 2 then
    raise exception 'Two people at most. Remove one first';
  end if;

  insert into public.vault_emergency_contacts
    (family_id, family_name, member_id, member_family_id, member_name, member_household_name, wait_days, added_by, added_by_name)
  values
    (v_family.id, coalesce(v_family.name, 'Your household'), v_them.member_id, v_them.family_id, v_them.full_name,
     coalesce(v_them.household_name, 'their household'), p_wait_days, v_me.id, v_me.full_name)
  on conflict (family_id, member_id) do update set wait_days = excluded.wait_days
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.name_vault_emergency_contact(uuid, integer) from public, anon;
grant execute on function public.name_vault_emergency_contact(uuid, integer) to authenticated;

-- Take someone off the list. Anything of theirs still waiting or open ends
-- with it.
create or replace function public.remove_vault_emergency_contact(p_contact uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_contact public.vault_emergency_contacts;
  v_me public.members;
begin
  select * into v_contact from public.vault_emergency_contacts where id = p_contact for update;
  if v_contact.id is null then
    raise exception 'not yours to change';
  end if;
  v_me := public.vault_emergency_grownup_of(v_contact.family_id);
  if v_me.id is null then
    raise exception 'not yours to change';
  end if;

  update public.vault_emergency_requests
     set revoked_at = now(), revoked_by_name = v_me.full_name
   where contact_id = p_contact and denied_at is null and revoked_at is null;

  delete from public.vault_emergency_contacts where id = p_contact;
end;
$$;

revoke all on function public.remove_vault_emergency_contact(uuid) from public, anon;
grant execute on function public.remove_vault_emergency_contact(uuid) to authenticated;

-- Deny (while it waits), allow now (while it waits), or revoke (once open).
-- Any grown-up of the household; never the person who asked.
create or replace function public.answer_vault_emergency_request(p_request uuid, p_answer text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.vault_emergency_requests;
  v_me public.members;
  v_status text;
begin
  select * into v_request from public.vault_emergency_requests where id = p_request for update;
  if v_request.id is null then
    raise exception 'not yours to change';
  end if;
  v_me := public.vault_emergency_grownup_of(v_request.family_id);
  if v_me.id is null or v_me.id = v_request.member_id
     or exists (select 1 from public.members asker where asker.id = v_request.member_id and asker.auth_user_id = v_me.auth_user_id) then
    raise exception 'not yours to change';
  end if;

  v_status := public.vault_emergency_status(v_request, now());

  if p_answer = 'deny' then
    if v_status <> 'waiting' then
      raise exception 'That request is no longer waiting';
    end if;
    update public.vault_emergency_requests set denied_at = now(), denied_by_name = v_me.full_name where id = p_request;
    return 'denied';
  elsif p_answer = 'allow' then
    if v_status <> 'waiting' then
      raise exception 'That request is no longer waiting';
    end if;
    update public.vault_emergency_requests set allowed_at = now(), allowed_by_name = v_me.full_name where id = p_request;
    return 'open';
  elsif p_answer = 'revoke' then
    if v_status not in ('waiting', 'open') then
      raise exception 'That access has already ended';
    end if;
    update public.vault_emergency_requests set revoked_at = now(), revoked_by_name = v_me.full_name where id = p_request;
    return 'revoked';
  end if;

  raise exception 'Answer deny, allow or revoke';
end;
$$;

revoke all on function public.answer_vault_emergency_request(uuid, text) from public, anon;
grant execute on function public.answer_vault_emergency_request(uuid, text) to authenticated;

-- 7. The trusted person's side ------------------------------------------------------

-- Ask. One waiting request at a time, and at most one a day, so a request
-- cannot be turned into a stream of pushes at the household.
create or replace function public.request_vault_emergency_access(p_family uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_contact public.vault_emergency_contacts;
  v_me public.members;
  v_household text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  select c.* into v_contact
  from public.vault_emergency_contacts c
  join public.members m on m.id = c.member_id
  where c.family_id = p_family
    and auth.uid() is not null
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('parent', 'adult')
  for update of c;
  if v_contact.id is null then
    raise exception 'That household has not named you';
  end if;

  select * into v_me from public.members where id = v_contact.member_id;
  if not public.families_are_linked(v_contact.family_id, v_me.family_id) then
    raise exception 'Your households are no longer linked';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    raise exception 'Say in a few words why';
  end if;

  if exists (
    select 1 from public.vault_emergency_requests r
    where r.contact_id = v_contact.id and public.vault_emergency_status(r, now()) = 'waiting'
  ) then
    raise exception 'A request is already waiting';
  end if;
  if exists (
    select 1 from public.vault_emergency_requests r
    where r.contact_id = v_contact.id and r.requested_at > now() - interval '1 day'
  ) then
    raise exception 'One request a day';
  end if;

  select f.name into v_household from public.families f where f.id = v_me.family_id;

  insert into public.vault_emergency_requests
    (family_id, family_name, contact_id, member_id, member_name, member_household_name, reason, wait_days)
  values
    (v_contact.family_id, v_contact.family_name, v_contact.id, v_me.id, v_me.full_name,
     coalesce(v_household, v_contact.member_household_name), v_reason, v_contact.wait_days)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.request_vault_emergency_access(uuid, text) from public, anon;
grant execute on function public.request_vault_emergency_access(uuid, text) to authenticated;

-- What is in the vault, by name only: no password, no username, no file.
create or replace function public.vault_emergency_items(p_request uuid)
returns table (kind text, id uuid, grp text, label text, owner_name text, file_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family uuid := public.vault_emergency_granted_family(p_request);
begin
  if v_family is null then
    raise exception 'Emergency access is not open';
  end if;

  return query
  select 'password'::text, i.id, i.group_name, i.label, null::text, 0
  from public.family_vault_items i
  where i.family_id = v_family
  union all
  select 'document'::text, e.id, coalesce(fo.name, 'Documents'), e.title, o.full_name,
         (select count(*)::integer from public.doc_files df where df.entry_id = e.id and df.family_id = v_family)
  from public.doc_entries e
  left join public.doc_folders fo on fo.id = e.folder_id and fo.family_id = v_family
  left join public.members o on o.id = e.owner_member_id and o.family_id = v_family
  where e.family_id = v_family
    and e.visibility in ('family', 'parents')
  order by 1 desc, 3, 4;
end;
$$;

revoke all on function public.vault_emergency_items(uuid) from public, anon;
grant execute on function public.vault_emergency_items(uuid) to authenticated;

-- Open one item: log it, then hand it over. Both or neither -- one
-- transaction.
create or replace function public.open_vault_emergency_item(p_request uuid, p_kind text, p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family uuid := public.vault_emergency_granted_family(p_request);
  v_request public.vault_emergency_requests;
  v_item public.family_vault_items;
  v_entry record;
  v_label text;
  v_result jsonb;
begin
  if v_family is null then
    raise exception 'Emergency access is not open';
  end if;
  select * into v_request from public.vault_emergency_requests where id = p_request;

  if p_kind = 'password' then
    select * into v_item from public.family_vault_items where id = p_id and family_id = v_family;
    if v_item.id is null then
      raise exception 'That item is not there';
    end if;
    v_label := v_item.label;
    v_result := jsonb_build_object(
      'kind', 'password', 'id', v_item.id, 'group', v_item.group_name, 'label', v_item.label,
      'username', v_item.username, 'secret', v_item.secret, 'note', v_item.note);
  elsif p_kind = 'document' then
    select e.id, e.title, e.doc_type, e.reference_no, e.expires_at, e.note, fo.name as folder, o.full_name as owner
      into v_entry
    from public.doc_entries e
    left join public.doc_folders fo on fo.id = e.folder_id and fo.family_id = v_family
    left join public.members o on o.id = e.owner_member_id and o.family_id = v_family
    where e.id = p_id and e.family_id = v_family and e.visibility in ('family', 'parents');
    if v_entry.id is null then
      raise exception 'That item is not there';
    end if;
    v_label := v_entry.title || coalesce(' (' || split_part(v_entry.owner, ' ', 1) || ')', '');
    v_result := jsonb_build_object(
      'kind', 'document', 'id', v_entry.id, 'title', v_entry.title, 'folder', v_entry.folder, 'owner', v_entry.owner,
      'docType', v_entry.doc_type, 'referenceNo', v_entry.reference_no, 'expiresAt', v_entry.expires_at, 'note', v_entry.note,
      'files', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', df.id, 'name', df.file_name, 'mimeType', df.mime_type, 'sizeBytes', df.size_bytes,
          'provider', df.storage_provider,
          -- A path only for a file in Kin's own storage. A Drive file's link
          -- is not handed over: it is the household's Google account.
          'storagePath', case when df.storage_provider = 'supabase' then df.storage_path end)
          order by df.created_at)
        from public.doc_files df where df.entry_id = v_entry.id and df.family_id = v_family), '[]'::jsonb));
  else
    raise exception 'That item is not there';
  end if;

  insert into public.vault_emergency_opens (family_id, request_id, member_name, item_kind, item_id, item_label)
  values (v_family, p_request, v_request.member_name, p_kind, p_id, left(v_label, 200));

  return v_result;
end;
$$;

revoke all on function public.open_vault_emergency_item(uuid, text, uuid) from public, anon;
grant execute on function public.open_vault_emergency_item(uuid, text, uuid) to authenticated;

-- 8. Requests as either side sees them, with their status ---------------------------
--
-- Security invoker: the select policy above decides which rows, this only
-- adds what the database works out from them.
create or replace function public.vault_emergency_request_list()
returns table (
  id uuid, family_id uuid, family_name text, contact_id uuid, member_name text, member_household_name text,
  reason text, wait_days integer, requested_at timestamptz, opens_at timestamptz, ends_at timestamptz,
  status text, mine boolean, answered_by_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.family_id, r.family_name, r.contact_id, r.member_name, r.member_household_name,
         r.reason, r.wait_days, r.requested_at,
         public.vault_emergency_opens_at(r),
         public.vault_emergency_opens_at(r) + interval '30 days',
         public.vault_emergency_status(r, now()),
         r.member_id is not distinct from public.current_member_id(),
         coalesce(r.revoked_by_name, r.denied_by_name, r.allowed_by_name)
  from public.vault_emergency_requests r
  order by r.requested_at desc
  limit 40;
$$;

revoke all on function public.vault_emergency_request_list() from public, anon;
grant execute on function public.vault_emergency_request_list() to authenticated;

-- 9. The documents bucket, read-only, while open -----------------------------------

create or replace function public.vault_emergency_can_read_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vault_emergency_requests r
    join public.members m on m.id = r.member_id
    join public.doc_files df on df.family_id = r.family_id
    join public.doc_entries e on e.id = df.entry_id and e.family_id = r.family_id
    where auth.uid() is not null
      and m.auth_user_id = auth.uid()
      and df.storage_provider = 'supabase'
      and df.storage_path = p_name
      and split_part(p_name, '/', 1) = r.family_id::text
      and e.visibility in ('family', 'parents')
      and public.vault_emergency_granted_family(r.id) = r.family_id
      and exists (
        select 1 from public.vault_emergency_opens o
        where o.request_id = r.id and o.item_kind = 'document' and o.item_id = e.id
          and o.opened_at > now() - interval '1 hour'
      )
  );
$$;

revoke all on function public.vault_emergency_can_read_object(text) from public, anon;
grant execute on function public.vault_emergency_can_read_object(text) to authenticated;

-- Select only: no insert, update or delete policy is added, so the bucket's
-- own household-folder policies still decide every write.
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'no storage schema here; nothing to do';
    return;
  end if;
  execute 'drop policy if exists vault_emergency_documents_read on storage.objects';
  execute $p$
    create policy vault_emergency_documents_read on storage.objects for select to authenticated
      using (bucket_id = 'documents' and public.vault_emergency_can_read_object(name))
  $p$;
end
$$;

-- 10. The pushes --------------------------------------------------------------------
--
-- On the five-minute tick (/api/cron/reminders), with its shared secret and
-- once-only ledger, to every grown-up of the household:
--   * at once, whatever the hour, when a request comes in;
--   * once a day from 09:00 in the household's own zone while it waits;
--   * when it opens.
-- No switch in Settings -> Notifications turns these off, the same as an SOS:
-- a request to open the vault that nobody hears about is the one thing this
-- design cannot afford.

create or replace function public.due_vault_emergency_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  expected text := public.kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  return query
  with live as (
    select r.id, r.family_id, r.member_name, r.member_household_name, r.reason, r.requested_at,
           public.vault_emergency_status(r, p_now) as st,
           public.vault_emergency_opens_at(r) as opens_at
    from public.vault_emergency_requests r
    where r.denied_at is null and r.revoked_at is null and r.contact_id is not null
      and r.requested_at > p_now - interval '40 days'
  ),
  zones as (
    select hc.family_id, hc.tz, hc.local_now, hc.today from public.household_clock(p_now) hc
  ),
  candidates as (
    select 'vault-emergency:' || l.id || ':asked' as key,
           l.family_id,
           'Urgent: ' || l.member_name || ' asks to open the vault' as title,
           '"' || left(l.reason, 90) || '" It opens ' || to_char(l.opens_at at time zone z.tz, 'Dy FMDD Mon, FMHH12:MI am')
             || ' unless a grown-up here says no.' as body,
           '/settings/privacy' as url
    from live l join zones z on z.family_id = l.family_id
    where l.st = 'waiting'
    union all
    select 'vault-emergency:' || l.id || ':day:' || z.today,
           l.family_id,
           'Still waiting: ' || l.member_name || ' asks to open the vault',
           'It opens ' || to_char(l.opens_at at time zone z.tz, 'Dy FMDD Mon, FMHH12:MI am')
             || ' unless a grown-up here says no. Tap to deny or allow.',
           '/settings/privacy'
    from live l join zones z on z.family_id = l.family_id
    where l.st = 'waiting'
      and z.today > (l.requested_at at time zone z.tz)::date
      and z.local_now::time >= time '09:00'
    union all
    select 'vault-emergency:' || l.id || ':open',
           l.family_id,
           'The vault is open to ' || l.member_name,
           'Read-only, for 30 days or until a grown-up here takes it back. You will see each item they open.',
           '/settings/privacy'
    from live l
    where l.st = 'open' and l.opens_at > p_now - interval '2 days'
  ),
  fresh as (
    insert into public.reminder_sends (key)
    select c.key from candidates c
    on conflict do nothing
    returning reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh f on f.key = c.key
  join public.members m on m.family_id = c.family_id and m.status = 'active' and m.role in ('parent', 'adult')
  join public.push_subscriptions s on s.member_id = m.id and s.family_id = c.family_id;
end;
$$;

revoke all on function public.due_vault_emergency_reminders(text, timestamptz) from public;
grant execute on function public.due_vault_emergency_reminders(text, timestamptz) to anon, authenticated;
