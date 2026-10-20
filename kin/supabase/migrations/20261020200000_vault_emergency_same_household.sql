-- Emergency access to the vault stays within the household, and parents-only
-- documents stay out unless marked for it (Jonathan, 20 October; the
-- stabilisation pass's design question "Vault emergency access shows
-- parents-only documents to the trusted relative").
--
-- 20261015120000_vault_emergency_access.sql let a household name up to two
-- grown-ups from a LINKED household, and opened to them every document marked
-- "Whole family" or "Parents only". Two changes, both decided by Jonathan:
--
--  (a) The trusted person must be a grown-up of the SAME household. "Parents
--      only" is whoever set the household up (lib/visibility.ts); every
--      other grown-up -- the other parent included, since joining by code
--      makes an adult -- cannot read those documents. So the worst day is
--      the household's own: the one parent in hospital, the other needing
--      the insurance policy. A relative from a linked household can no
--      longer be named. Anyone already named from another household comes
--      off the list here, their open or waiting requests end, and the
--      household's grown-ups get one notice on the Emergency access card
--      saying why (vault_emergency_notices).
--
--  (b) When access opens, a "Parents only" document is left out unless a
--      grown-up who can see it (a parent, by the documents' own policy) has
--      marked it "Share in an emergency" (doc_entries.share_in_emergency,
--      off to begin with). Shown on the document and in a list under
--      Settings -> Privacy & lock -> Emergency access. "Whole family"
--      documents and the passwords are shared as before; "Just me" stays
--      its keeper's.
--
-- Everything else -- the wait, Deny / Allow now / Take back, the 30 days,
-- the log of every item opened, the hour-long file window, no new row-level
-- policy on the vault itself -- is as the first migration wrote it; the
-- functions below are that file's, with the household test turned around
-- and the document test tightened. The asker is a grown-up of the household
-- now, so the pushes about their own request skip them; they get one of
-- their own when it opens.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- 1. Share in an emergency, per document ------------------------------------------

alter table public.doc_entries
  add column if not exists share_in_emergency boolean not null default false;

-- Only a grown-up flips it (a child cannot edit a parents-only document
-- anyway, by the documents' policies; this holds whatever they say).
create or replace function public.doc_entries_share_in_emergency_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.share_in_emergency and (select public.current_member_role()) not in ('parent', 'adult') then
    raise exception 'Only a grown-up can mark a document to share in an emergency' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.share_in_emergency is distinct from old.share_in_emergency
     and (select public.current_member_role()) not in ('parent', 'adult') then
    raise exception 'Only a grown-up can mark a document to share in an emergency' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.doc_entries_share_in_emergency_guard() from public, anon, authenticated;

drop trigger if exists doc_entries_share_in_emergency_guard on public.doc_entries;
create trigger doc_entries_share_in_emergency_guard
  before insert or update of share_in_emergency on public.doc_entries
  for each row execute function public.doc_entries_share_in_emergency_guard();

-- 2. One notice to the household's grown-ups ---------------------------------------

create table if not exists public.vault_emergency_notices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by_name text
);

create index if not exists vault_emergency_notices_family_idx on public.vault_emergency_notices (family_id) where dismissed_at is null;

alter table public.vault_emergency_notices enable row level security;

drop policy if exists vault_emergency_notices_select on public.vault_emergency_notices;
create policy vault_emergency_notices_select on public.vault_emergency_notices
  for select to authenticated using (
    family_id = (select public.current_family_id()) and (select public.current_member_role()) in ('parent', 'adult')
  );

revoke insert, update, delete on public.vault_emergency_notices from anon, authenticated;

-- "Got it": any grown-up of the household, once for all of them.
create or replace function public.dismiss_vault_emergency_notice(p_notice uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_me public.members;
begin
  select n.family_id into v_family from public.vault_emergency_notices n where n.id = p_notice;
  if v_family is null then
    raise exception 'not yours to change';
  end if;
  v_me := public.vault_emergency_grownup_of(v_family);
  if v_me.id is null then
    raise exception 'not yours to change';
  end if;
  update public.vault_emergency_notices
     set dismissed_at = coalesce(dismissed_at, now()), dismissed_by_name = coalesce(dismissed_by_name, v_me.full_name)
   where id = p_notice;
end;
$$;

revoke all on function public.dismiss_vault_emergency_notice(uuid) from public, anon;
grant execute on function public.dismiss_vault_emergency_notice(uuid) to authenticated;

-- 3. Trusted people from other households come off the list --------------------------
--
-- Their requests end as a removal ends them (remove_vault_emergency_contact):
-- revoked, so the household's card reads "Ended." and nothing of theirs
-- opens. Then the notice, one per household, naming who came off; then the
-- rows. Re-run, nothing is left to find.

update public.vault_emergency_requests r
   set revoked_at = now(), revoked_by_name = 'Kin'
 where r.denied_at is null and r.revoked_at is null
   and r.contact_id in (select c.id from public.vault_emergency_contacts c where c.member_family_id <> c.family_id);

insert into public.vault_emergency_notices (family_id, body)
select c.family_id,
       'Emergency access now stays within the household: only a grown-up of this household can be named. '
       || string_agg(c.member_name || ' (' || c.member_household_name || ')', ', ' order by c.created_at)
       || ' came off your list on 20 October 2026, and any access of theirs has ended. Name a grown-up here instead.'
from public.vault_emergency_contacts c
where c.member_family_id <> c.family_id
group by c.family_id;

delete from public.vault_emergency_contacts where member_family_id <> family_id;

alter table public.vault_emergency_contacts drop constraint if exists vault_emergency_contacts_other_household;
alter table public.vault_emergency_contacts drop constraint if exists vault_emergency_contacts_same_household;
alter table public.vault_emergency_contacts
  add constraint vault_emergency_contacts_same_household check (member_family_id = family_id);

-- 4. Who the caller is: the grant, within the household -----------------------------

-- The household of an OPEN grant the caller asked for, or null. Re-checks
-- everything each time: still the person named, still an active grown-up of
-- that household, and the grant open now.
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
    and m.family_id = r.family_id
    and public.vault_emergency_status(r, now()) = 'open';
$$;

revoke all on function public.vault_emergency_granted_family(uuid) from public, anon, authenticated;

-- 5. Who may be named: the household's other grown-ups with a Kin login -----------

create or replace function public.vault_emergency_candidates()
returns table (member_id uuid, full_name text, household_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.full_name, f.name
  from public.members me
  join public.members m on m.family_id = me.family_id and m.id <> me.id
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
  order by m.full_name;
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

  select c.member_id, c.full_name, c.household_name into v_them
  from public.vault_emergency_candidates() c
  where c.member_id = p_member;
  if v_them.member_id is null then
    raise exception 'That person cannot be named: only another grown-up of this household with Kin';
  end if;

  if (select count(*) from public.vault_emergency_contacts c where c.family_id = v_family.id and c.member_id <> p_member) >= 2 then
    raise exception 'Two people at most. Remove one first';
  end if;

  insert into public.vault_emergency_contacts
    (family_id, family_name, member_id, member_family_id, member_name, member_household_name, wait_days, added_by, added_by_name)
  values
    (v_family.id, coalesce(v_family.name, 'Your household'), v_them.member_id, v_family.id, v_them.full_name,
     coalesce(v_family.name, 'Your household'), p_wait_days, v_me.id, v_me.full_name)
  on conflict (family_id, member_id) do update set wait_days = excluded.wait_days
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.name_vault_emergency_contact(uuid, integer) from public, anon;
grant execute on function public.name_vault_emergency_contact(uuid, integer) to authenticated;

-- 6. Asking: still a grown-up of the household --------------------------------------

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
  if v_me.family_id <> v_contact.family_id then
    raise exception 'You are no longer in this household';
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

-- 7. What opens: parents-only documents only when marked ------------------------------

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
    and (e.visibility = 'family' or (e.visibility = 'parents' and e.share_in_emergency))
  order by 1 desc, 3, 4;
end;
$$;

revoke all on function public.vault_emergency_items(uuid) from public, anon;
grant execute on function public.vault_emergency_items(uuid) to authenticated;

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
    where e.id = p_id and e.family_id = v_family
      and (e.visibility = 'family' or (e.visibility = 'parents' and e.share_in_emergency));
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
      and (e.visibility = 'family' or (e.visibility = 'parents' and e.share_in_emergency))
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

-- 8. The pushes: the household's other grown-ups, and the asker once it opens --------

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
    select r.id, r.family_id, r.member_id as asker, r.member_name, r.member_household_name, r.reason, r.requested_at,
           public.vault_emergency_status(r, p_now) as st,
           public.vault_emergency_opens_at(r) as opens_at
    from public.vault_emergency_requests r
    where r.denied_at is null and r.revoked_at is null and r.contact_id is not null
      and r.requested_at > p_now - interval '40 days'
  ),
  zones as (
    select hc.family_id, hc.tz, hc.local_now, hc.today from public.household_clock(p_now) hc
  ),
  -- skip_member: the asker, who is a grown-up here too; only_member: a push
  -- for one person alone.
  candidates as (
    select 'vault-emergency:' || l.id || ':asked' as key,
           l.family_id,
           l.asker as skip_member, null::uuid as only_member,
           'Urgent: ' || l.member_name || ' asks to open the vault' as title,
           '"' || left(l.reason, 90) || '" It opens ' || to_char(l.opens_at at time zone z.tz, 'Dy FMDD Mon, FMHH12:MI am')
             || ' unless a grown-up here says no.' as body,
           '/settings/privacy' as url
    from live l join zones z on z.family_id = l.family_id
    where l.st = 'waiting'
    union all
    select 'vault-emergency:' || l.id || ':day:' || z.today,
           l.family_id,
           l.asker, null::uuid,
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
           l.asker, null::uuid,
           'The vault is open to ' || l.member_name,
           'Read-only, for 30 days or until a grown-up here takes it back. You will see each item they open.',
           '/settings/privacy'
    from live l
    where l.st = 'open' and l.opens_at > p_now - interval '2 days'
    union all
    select 'vault-emergency:' || l.id || ':open:asker',
           l.family_id,
           null::uuid, l.asker,
           'The vault is open to you',
           'Read-only, for 30 days or until a grown-up here takes it back. Each item you open is shown to them.',
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
    and (c.skip_member is null or m.id <> c.skip_member)
    and (c.only_member is null or m.id = c.only_member)
  join public.push_subscriptions s on s.member_id = m.id and s.family_id = c.family_id;
end;
$$;

revoke all on function public.due_vault_emergency_reminders(text, timestamptz) from public;
grant execute on function public.due_vault_emergency_reminders(text, timestamptz) to anon, authenticated;
