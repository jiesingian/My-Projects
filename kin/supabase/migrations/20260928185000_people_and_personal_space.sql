-- A person owns their account; a household links them (approved by Jonathan,
-- 28 September, BACKLOG item 1). Step 1 of 3: the data model. The design is
-- kin/docs/PERSONAL_SPACE.md; read that first.
--
-- What this does:
--   * people: a durable identity per person, which never changes household.
--   * members.person_id: every membership belongs to a person. Existing rows
--     get a person whose id IS the member id (person_id = id), so there is no
--     mapping to get wrong and anyone can verify it.
--   * current_person_id(), beside current_family_id() and current_member_id().
--   * owner_person_id + visibility ('household' | 'personal') on
--     journal_entries and journal_media; owner_person_id on goals (personal
--     already means is_joint = false there); personal_notes, which has no
--     household at all.
--
-- What it deliberately does NOT do: change current_family_id() or any policy
-- on a household table other than the four below. Every existing journal row
-- takes the default 'household', and the new household condition is the old
-- one (family_id = current_family_id()) plus "visibility = 'household'", so
-- who can see each existing row is exactly who could before. Goals only gain
-- an extra way for a person to see their own personal goal.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- ---------------------------------------------------------------------------
-- 1. People
-- ---------------------------------------------------------------------------

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  -- The login this person signs in with. Null for a managed child (no login),
  -- and after the account is deleted. Unique: one person per account.
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.people is
  'A person, independent of any household. members.person_id says which household memberships are theirs; personal records carry owner_person_id. See kin/docs/PERSONAL_SPACE.md.';

alter table public.people enable row level security;

-- Only your own row is readable directly. Nothing inserts, updates or deletes
-- people through the API: rows are made by members_attach_person() below.
drop policy if exists people_select_self on public.people;
create policy people_select_self on public.people
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. members.person_id, backfilled 1:1 with the member id
-- ---------------------------------------------------------------------------

alter table public.members add column if not exists person_id uuid;

-- members.auth_user_id is unique, so this cannot collide on people.auth_user_id.
insert into public.people (id, auth_user_id, created_at)
select m.id, m.auth_user_id, m.created_at
from public.members m
where m.person_id is null
on conflict (id) do nothing;

update public.members set person_id = id where person_id is null;

alter table public.members alter column person_id set not null;

alter table public.members drop constraint if exists members_person_id_fkey;
-- No cascade: a person is never deleted while a membership refers to them.
alter table public.members
  add constraint members_person_id_fkey foreign key (person_id) references public.people(id);

create index if not exists members_person_id_idx on public.members (person_id);

comment on column public.members.person_id is
  'The person this membership belongs to. Same person across households; for rows that existed on 28 September it equals members.id.';

-- Every new membership gets a person: the account's existing one if it has
-- one (someone re-joining keeps their personal space), otherwise a new one.
-- A membership never changes person, except inside a privileged function.
create or replace function public.members_attach_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_privileged boolean := coalesce(current_setting('kin.privileged', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.person_id is null then
      if new.auth_user_id is not null then
        select p.id into v_person from public.people p where p.auth_user_id = new.auth_user_id;
      end if;
      if v_person is null then
        insert into public.people (auth_user_id) values (new.auth_user_id) returning id into v_person;
      end if;
      new.person_id := v_person;
    elsif not v_privileged then
      raise exception 'a new membership cannot name its person' using errcode = '42501';
    end if;
  elsif new.person_id is distinct from old.person_id and not v_privileged then
    raise exception 'a membership keeps its person' using errcode = '42501';
  end if;

  -- Keep the person's login in step with the membership's. A login given to
  -- the person later attaches to them; a login taken away (a child converted
  -- to a managed profile) detaches from them. Skipped when privileged, where
  -- a function such as a move is deliberately rearranging memberships.
  if not v_privileged and tg_op = 'UPDATE' and new.auth_user_id is distinct from old.auth_user_id then
    if new.auth_user_id is null then
      update public.people set auth_user_id = null
       where id = new.person_id and auth_user_id = old.auth_user_id;
    elsif not exists (select 1 from public.people where auth_user_id = new.auth_user_id) then
      update public.people set auth_user_id = new.auth_user_id
       where id = new.person_id and auth_user_id is null;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.members_attach_person() from public, anon, authenticated;

drop trigger if exists members_attach_person on public.members;
create trigger members_attach_person
  before insert or update on public.members
  for each row execute function public.members_attach_person();

create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.people p where p.auth_user_id = auth.uid();
$$;

revoke execute on function public.current_person_id() from public, anon;
grant execute on function public.current_person_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Journal entries: whose, and who sees them
-- ---------------------------------------------------------------------------

alter table public.journal_entries
  add column if not exists owner_person_id uuid references public.people(id),
  add column if not exists visibility text not null default 'household';

alter table public.journal_entries drop constraint if exists journal_entries_visibility_check;
alter table public.journal_entries
  add constraint journal_entries_visibility_check check (visibility in ('household', 'personal'));

alter table public.journal_entries drop constraint if exists journal_entries_personal_has_owner;
alter table public.journal_entries
  add constraint journal_entries_personal_has_owner check (visibility = 'household' or owner_person_id is not null);

-- Existing entries: who wrote them. They stay household entries.
update public.journal_entries e
   set owner_person_id = m.person_id
  from public.members m
 where m.id = e.created_by and e.owner_person_id is null;

create index if not exists journal_entries_owner_person_id_idx
  on public.journal_entries (owner_person_id);

comment on column public.journal_entries.owner_person_id is
  'Whose entry this is. On a household entry, who wrote it; on a personal one, the only person who can see it.';
comment on column public.journal_entries.visibility is
  '''household'': the household journal (every entry before 28 September). ''personal'': only owner_person_id sees it, and it moves with them.';

-- ---------------------------------------------------------------------------
-- 4. Journal photos: the same two columns
-- ---------------------------------------------------------------------------

alter table public.journal_media
  add column if not exists owner_person_id uuid references public.people(id),
  add column if not exists visibility text not null default 'household';

alter table public.journal_media drop constraint if exists journal_media_visibility_check;
alter table public.journal_media
  add constraint journal_media_visibility_check check (visibility in ('household', 'personal'));

alter table public.journal_media drop constraint if exists journal_media_personal_has_owner;
alter table public.journal_media
  add constraint journal_media_personal_has_owner check (visibility = 'household' or owner_person_id is not null);

update public.journal_media j
   set owner_person_id = m.person_id
  from public.members m
 where m.id = j.uploaded_by and j.owner_person_id is null;

create index if not exists journal_media_owner_person_id_idx
  on public.journal_media (owner_person_id);

comment on column public.journal_media.visibility is
  '''household'' or ''personal''. A personal photo''s file lives under person/<owner_person_id>/ in the journal bucket, so it never moves with the person.';

-- ---------------------------------------------------------------------------
-- 5. Goals: personal already exists (is_joint = false); record whose
-- ---------------------------------------------------------------------------

alter table public.goals
  add column if not exists owner_person_id uuid references public.people(id);

update public.goals g
   set owner_person_id = m.person_id
  from public.members m
 where m.id = g.owner_member_id and not g.is_joint and g.owner_person_id is null;

create index if not exists goals_owner_person_id_idx on public.goals (owner_person_id);

comment on column public.goals.owner_person_id is
  'For a personal goal (is_joint = false), the person it belongs to. Null on a joint goal.';

-- ---------------------------------------------------------------------------
-- 6. Filling owner_person_id, and never changing it
-- ---------------------------------------------------------------------------

-- Journal entries and photos: the person inserting it (or, with no session,
-- the person behind created_by / uploaded_by). The owner never changes except
-- in a privileged function.
create or replace function public.journal_set_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by uuid;
begin
  if coalesce(current_setting('kin.privileged', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.owner_person_id is null then
      v_by := case tg_table_name when 'journal_entries' then (to_jsonb(new)->>'created_by')::uuid
                                 else (to_jsonb(new)->>'uploaded_by')::uuid end;
      new.owner_person_id := coalesce(
        public.current_person_id(),
        (select m.person_id from public.members m where m.id = v_by)
      );
    end if;
  elsif new.owner_person_id is distinct from old.owner_person_id then
    raise exception 'the owner of a journal record cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.journal_set_owner() from public, anon, authenticated;

drop trigger if exists journal_entries_set_owner on public.journal_entries;
create trigger journal_entries_set_owner
  before insert or update on public.journal_entries
  for each row execute function public.journal_set_owner();

drop trigger if exists journal_media_set_owner on public.journal_media;
create trigger journal_media_set_owner
  before insert or update on public.journal_media
  for each row execute function public.journal_set_owner();

-- Goals: a personal goal's person follows its owner_member_id.
create or replace function public.goals_set_owner_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('kin.privileged', true), '') = 'on' then
    return new;
  end if;
  if new.is_joint or new.owner_member_id is null then
    new.owner_person_id := null;
  else
    new.owner_person_id := (select m.person_id from public.members m where m.id = new.owner_member_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.goals_set_owner_person() from public, anon, authenticated;

drop trigger if exists goals_set_owner_person on public.goals;
create trigger goals_set_owner_person
  before insert or update of is_joint, owner_member_id, owner_person_id on public.goals
  for each row execute function public.goals_set_owner_person();

-- ---------------------------------------------------------------------------
-- 7. Policies
-- ---------------------------------------------------------------------------

-- journal_entries. Household: as before. Personal: its owner only.
drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries
  for select using (
    (visibility = 'household' and family_id = (select public.current_family_id()))
    or (visibility = 'personal' and owner_person_id = (select public.current_person_id()))
  );

drop policy if exists journal_entries_insert on public.journal_entries;
create policy journal_entries_insert on public.journal_entries
  for insert with check (
    family_id = (select public.current_family_id())
    and (visibility = 'household' or owner_person_id = (select public.current_person_id()))
  );

drop policy if exists journal_entries_update on public.journal_entries;
create policy journal_entries_update on public.journal_entries
  for update using (
    (visibility = 'household' and family_id = (select public.current_family_id()))
    or (visibility = 'personal' and owner_person_id = (select public.current_person_id()))
  ) with check (
    family_id = (select public.current_family_id())
    and (visibility = 'household' or owner_person_id = (select public.current_person_id()))
  );

drop policy if exists journal_entries_delete on public.journal_entries;
create policy journal_entries_delete on public.journal_entries
  for delete using (
    (visibility = 'household' and family_id = (select public.current_family_id()))
    or (visibility = 'personal' and owner_person_id = (select public.current_person_id()))
  );

drop policy if exists journal_entries_select_linked on public.journal_entries;
create policy journal_entries_select_linked on public.journal_entries
  for select using (
    visibility = 'household'
    and shared_at is not null
    and family_id <> public.current_family_id()
    and public.families_are_linked(family_id, public.current_family_id())
  );

-- journal_media: the same shape.
drop policy if exists journal_media_select on public.journal_media;
create policy journal_media_select on public.journal_media
  for select using (
    (visibility = 'household' and family_id = (select public.current_family_id()))
    or (visibility = 'personal' and owner_person_id = (select public.current_person_id()))
  );

drop policy if exists journal_media_insert on public.journal_media;
create policy journal_media_insert on public.journal_media
  for insert with check (
    family_id = (select public.current_family_id())
    and (visibility = 'household' or owner_person_id = (select public.current_person_id()))
  );

drop policy if exists journal_media_update on public.journal_media;
create policy journal_media_update on public.journal_media
  for update using (
    (visibility = 'household' and family_id = (select public.current_family_id()))
    or (visibility = 'personal' and owner_person_id = (select public.current_person_id()))
  ) with check (
    family_id = (select public.current_family_id())
    and (visibility = 'household' or owner_person_id = (select public.current_person_id()))
  );

drop policy if exists journal_media_delete on public.journal_media;
create policy journal_media_delete on public.journal_media
  for delete using (
    (visibility = 'household' and family_id = (select public.current_family_id()))
    or (visibility = 'personal' and owner_person_id = (select public.current_person_id()))
  );

-- journal_comments: only on an entry you can see. The subquery runs under
-- journal_entries' own policies, so a personal entry's comments are its
-- owner's alone.
drop policy if exists journal_comments_select on public.journal_comments;
create policy journal_comments_select on public.journal_comments
  for select using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.journal_entries e where e.id = journal_comments.entry_id)
  );

drop policy if exists journal_comments_insert on public.journal_comments;
create policy journal_comments_insert on public.journal_comments
  for insert with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.journal_entries e where e.id = journal_comments.entry_id)
  );

-- goals: a person always sees their own personal goal. The other goal
-- policies are unchanged.
drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals
  for select using (
    (family_id = (select public.current_family_id())
      and (is_joint or owner_member_id = (select public.current_member_id())))
    or (not is_joint and owner_person_id = (select public.current_person_id()))
  );

-- Sharing with linked households never includes anything personal.
create or replace function public.entry_shared_with_me(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from journal_entries e
    where e.id = p_entry_id
      and e.visibility = 'household'
      and e.shared_at is not null
      and e.family_id <> current_family_id()
      and families_are_linked(e.family_id, current_family_id())
  )
$$;

create or replace function public.media_shared_with_me(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from journal_entry_media jem
    join journal_media m on m.id = jem.media_id
    where jem.media_id = p_media_id
      and m.visibility = 'household'
      and entry_shared_with_me(jem.entry_id)
  )
$$;

-- A reaction or comment on a photo needs a household photo, not someone's
-- personal one.
create or replace function public.photo_in_my_household(p_journal_media_id uuid, p_member_avatar_id uuid, p_family_background_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_journal_media_id is not null then exists (select 1 from journal_media where id = p_journal_media_id and family_id = current_family_id() and visibility = 'household')
    when p_member_avatar_id is not null then exists (select 1 from member_avatars where id = p_member_avatar_id and family_id = current_family_id())
    when p_family_background_id is not null then exists (select 1 from family_backgrounds where id = p_family_background_id and family_id = current_family_id())
    else false
  end
$$;

-- New entries are auto-shared with relatives when the household says so --
-- but never a personal one. Also used by milestones, which have no
-- visibility column, hence the jsonb read.
create or replace function public.share_new_memory()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(to_jsonb(new)->>'visibility', 'household') <> 'household' then
    return new;
  end if;
  if new.shared_at is null and exists (select 1 from families where id = new.family_id and share_with_relatives) then
    new.shared_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Personal photo files: journal/person/<person id>/...
-- ---------------------------------------------------------------------------
-- Household files stay under journal/<family id>/, readable by the household
-- (journal_family_rw). A personal file is its owner's alone and never has to
-- move when they do.

drop policy if exists journal_person_select on storage.objects;
create policy journal_person_select on storage.objects
  for select to authenticated using (
    bucket_id = 'journal'
    and (storage.foldername(name))[1] = 'person'
    and (storage.foldername(name))[2] = (select public.current_person_id())::text
  );

drop policy if exists journal_person_insert on storage.objects;
create policy journal_person_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'journal'
    and (storage.foldername(name))[1] = 'person'
    and (storage.foldername(name))[2] = (select public.current_person_id())::text
  );

drop policy if exists journal_person_delete on storage.objects;
create policy journal_person_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'journal'
    and (storage.foldername(name))[1] = 'person'
    and (storage.foldername(name))[2] = (select public.current_person_id())::text
  );

-- ---------------------------------------------------------------------------
-- 9. Private notes: a person's own, with no household at all
-- ---------------------------------------------------------------------------

create table if not exists public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  owner_person_id uuid not null default public.current_person_id()
    references public.people(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_notes_owner_updated_idx
  on public.personal_notes (owner_person_id, updated_at desc);

comment on table public.personal_notes is
  'A person''s private notes. No household: nobody else can read them, and a move changes nothing.';

alter table public.personal_notes enable row level security;

drop policy if exists personal_notes_own on public.personal_notes;
create policy personal_notes_own on public.personal_notes
  for all to authenticated
  using (owner_person_id = (select public.current_person_id()))
  with check (owner_person_id = (select public.current_person_id()));

-- ---------------------------------------------------------------------------
-- 10. When the account is deleted, what was only theirs goes with it
-- ---------------------------------------------------------------------------
-- auth.users -> people.auth_user_id is ON DELETE SET NULL, which is an update
-- on people and fires this. Household records the person wrote stay.
--
-- Only when the login is really gone. A child converted to a managed profile
-- loses their login too (members_attach_person clears it here), but they are
-- still a person with a journal, and nothing of theirs is deleted.

create or replace function public.people_forget_personal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.auth_user_id is not null and new.auth_user_id is null
     and not exists (select 1 from auth.users u where u.id = old.auth_user_id) then
    delete from public.personal_notes where owner_person_id = new.id;
    delete from public.journal_entries where owner_person_id = new.id and visibility = 'personal';
    delete from public.journal_media where owner_person_id = new.id and visibility = 'personal';
  end if;
  return new;
end;
$$;

revoke execute on function public.people_forget_personal() from public, anon, authenticated;

drop trigger if exists people_forget_personal on public.people;
create trigger people_forget_personal
  after update of auth_user_id on public.people
  for each row execute function public.people_forget_personal();
