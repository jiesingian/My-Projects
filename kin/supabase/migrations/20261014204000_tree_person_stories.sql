-- Stories on the tree (approved by Jonathan, 14 October): FamilySearch calls
-- them Memories. On anybody on the household's tree -- a member, a relative
-- who is only a name, someone who has passed -- the household keeps stories:
-- a voice recording of Lola telling it, or one written down, with old photos
-- or scanned documents beside it.
--
-- WHAT A STORY IS
--
-- A title, who told it (a member of the household, or free words such as
-- "Lolo Ben, told to Mia"), when it happened (a year is enough: the date is
-- kept with how sure it is -- day, month, year or decade), the words if it
-- was written, and its files. A file is a row of its own, so a story can hold
-- a recording and three photos, and one can be taken off without the others.
--
-- WHO SEES IT, AND WHO WRITES IT
--
-- The household, the same as the tree itself. Not linked households, for
-- now: the shared-branch read (20260923160000) hands a linked household a
-- name and a birth year, never anything a member wrote, and the files sit
-- under the household's folder in the documents bucket, which only the
-- household can read. Sharing stories across households is a decision of its
-- own, with its own switch.
--
-- Grown-ups, and children with a login of their own who are not in kid view
-- (the teens), may add one. Whoever added a story may change it or delete
-- it; a grown-up may delete anyone's. Nobody can add a story in somebody
-- else's name: created_by must be the caller.
--
-- THE FILES
--
-- In Kin's own storage, documents bucket, under <household>/stories/..., so
-- they count toward the household's allowance (family_storage_bytes counts
-- every file under the household's folder: 1 GB on Kin Free, 50 GB on Plus).
-- The bucket's existing household-folder policies (20260928140000) already
-- keep them to the household; the check below stops a row from pointing at
-- any other folder, another household's included.
--
-- KIN FREE
--
-- The tree and the journal are Kin Free, and stories are both, so there is
-- no require_kin_plus here. The files are what is paid for, through storage.
--
-- WHEN SOMEBODY IS TAKEN OFF THE TREE
--
-- Their stories go with them (on delete cascade) -- a story about nobody has
-- nowhere to be shown. The app removes their files from storage first. A
-- child cannot take somebody with stories off the tree, since that would
-- delete stories a grown-up kept; family_tree_people_keep_stories refuses it.

create table if not exists public.tree_person_stories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  person_id uuid not null references public.family_tree_people(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  body text check (body is null or length(body) <= 20000),
  told_by_member_id uuid references public.members(id) on delete set null,
  told_by_name text check (told_by_name is null or length(btrim(told_by_name)) between 1 and 120),
  happened_on date,
  happened_precision text not null default 'year' check (happened_precision in ('day', 'month', 'year', 'decade')),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tree_person_stories_person_idx on public.tree_person_stories (person_id);
create index if not exists tree_person_stories_family_idx on public.tree_person_stories (family_id);
create index if not exists tree_person_stories_created_by_idx on public.tree_person_stories (created_by);
create index if not exists tree_person_stories_told_by_idx on public.tree_person_stories (told_by_member_id);

create table if not exists public.tree_person_story_files (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.tree_person_stories(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  storage_path text not null,
  mime_type text not null check (mime_type ~ '^(image/|audio/|application/pdf$)'),
  file_name text not null default '' check (length(file_name) <= 200),
  duration_seconds numeric check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 3600)),
  -- The words the phone heard while it recorded. A twenty-minute sitting
  -- runs to far more than a chat voice note's 5,000 characters, so the same
  -- room as a written story.
  transcript text check (transcript is null or length(transcript) <= 20000),
  position int not null default 0,
  created_at timestamptz not null default now(),
  -- The household's own folder, its stories folder, and nothing that climbs
  -- out of it.
  constraint tree_person_story_files_in_household_folder check (
    split_part(storage_path, '/', 1) = family_id::text
    and split_part(storage_path, '/', 2) = 'stories'
    and length(split_part(storage_path, '/', 3)) > 0
    and position('..' in storage_path) = 0
  )
);

create index if not exists tree_person_story_files_story_idx on public.tree_person_story_files (story_id);
create index if not exists tree_person_story_files_family_idx on public.tree_person_story_files (family_id);
-- One row per stored file: two stories pointing at one file would mean
-- deleting either took the other's recording with it.
create unique index if not exists tree_person_story_files_path_key on public.tree_person_story_files (storage_path);

alter table public.tree_person_stories enable row level security;
alter table public.tree_person_story_files enable row level security;

-- May the caller add a story? A grown-up, or a child with a login of their
-- own who is not in kid view. Read from their own member row, which a policy
-- on another table cannot do without going through members' own policies.
create or replace function public.can_add_tree_stories()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.id = public.current_member_id()
      and m.status = 'active'
      and (m.role in ('parent', 'adult') or (m.role = 'child_self' and not coalesce(m.kid_view, false)))
  );
$$;

revoke execute on function public.can_add_tree_stories() from public, anon;
grant execute on function public.can_add_tree_stories() to authenticated;

-- A story belongs to somebody on this household's tree, and a member who
-- told it is a member of this household. Run with the caller's own rights,
-- so it can only ever find rows the caller may already see.
create or replace function public.tree_story_fits(p_family uuid, p_person uuid, p_teller uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.family_tree_people p where p.id = p_person and p.family_id = p_family)
     and (p_teller is null or exists (select 1 from public.members m where m.id = p_teller and m.family_id = p_family));
$$;

revoke execute on function public.tree_story_fits(uuid, uuid, uuid) from public, anon;
grant execute on function public.tree_story_fits(uuid, uuid, uuid) to authenticated;

drop policy if exists tree_person_stories_select on public.tree_person_stories;
create policy tree_person_stories_select on public.tree_person_stories
  for select to authenticated using (family_id = (select public.current_family_id()));

drop policy if exists tree_person_stories_insert on public.tree_person_stories;
create policy tree_person_stories_insert on public.tree_person_stories
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and (select public.can_add_tree_stories())
    and public.tree_story_fits(family_id, person_id, told_by_member_id)
  );

drop policy if exists tree_person_stories_update on public.tree_person_stories;
create policy tree_person_stories_update on public.tree_person_stories
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
  )
  with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and (select public.can_add_tree_stories())
    and public.tree_story_fits(family_id, person_id, told_by_member_id)
  );

drop policy if exists tree_person_stories_delete on public.tree_person_stories;
create policy tree_person_stories_delete on public.tree_person_stories
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and (
      created_by = (select public.current_member_id())
      or (select public.current_member_role()) in ('parent', 'adult')
    )
  );

grant select, insert, update, delete on public.tree_person_stories to authenticated;

-- A file is seen with its story, added only by whoever wrote the story, and
-- taken off by whoever may delete the story.
drop policy if exists tree_person_story_files_select on public.tree_person_story_files;
create policy tree_person_story_files_select on public.tree_person_story_files
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.tree_person_stories s where s.id = tree_person_story_files.story_id)
  );

drop policy if exists tree_person_story_files_insert on public.tree_person_story_files;
create policy tree_person_story_files_insert on public.tree_person_story_files
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and (select public.can_add_tree_stories())
    and exists (
      select 1 from public.tree_person_stories s
      where s.id = tree_person_story_files.story_id
        and s.family_id = tree_person_story_files.family_id
        and s.created_by = (select public.current_member_id())
    )
  );

drop policy if exists tree_person_story_files_delete on public.tree_person_story_files;
create policy tree_person_story_files_delete on public.tree_person_story_files
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and exists (
      select 1 from public.tree_person_stories s
      where s.id = tree_person_story_files.story_id
        and (
          s.created_by = (select public.current_member_id())
          or (select public.current_member_role()) in ('parent', 'adult')
        )
    )
  );

grant select, insert, delete on public.tree_person_story_files to authenticated;

-- When a story was last changed, for "edited" under it.
create or replace function public.tree_person_stories_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.tree_person_stories_touch() from public, anon;

drop trigger if exists tree_person_stories_touch on public.tree_person_stories;
create trigger tree_person_stories_touch
  before update on public.tree_person_stories
  for each row execute function public.tree_person_stories_touch();

-- Taking somebody off the tree takes their stories with them (the cascade
-- above). Anyone in the household may take a person off the tree, but a
-- child doing so would delete stories a grown-up kept, so a child is
-- refused when the person has any. Nobody signed in (a household being
-- deleted by its own function, after its members) is not stopped.
create or replace function public.family_tree_people_keep_stories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_member_role() in ('child_self', 'child_managed')
     and exists (select 1 from public.tree_person_stories s where s.person_id = old.id) then
    raise exception 'Only a grown-up can take someone with stories off the tree.' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke execute on function public.family_tree_people_keep_stories() from public, anon;

drop trigger if exists family_tree_people_keep_stories on public.family_tree_people;
create trigger family_tree_people_keep_stories
  before delete on public.family_tree_people
  for each row execute function public.family_tree_people_keep_stories();
