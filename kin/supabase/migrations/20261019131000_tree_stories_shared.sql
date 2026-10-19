-- Stories on the tree, shared with linked households (Jonathan, 19 October;
-- the follow-up 20261014204000_tree_person_stories left open).
--
-- WHAT CROSSES
--
-- One story at a time, and only the ones whoever wrote it chose to share:
-- tree_person_stories.shared_at, null (the household's own) unless the
-- writer ticked "Share with linked households". The same shape as a journal
-- entry's shared_at (20260922090000), but off by default: a story is often a
-- recording of Lola talking, and nobody should find it in another house
-- without having meant it to be there.
--
-- WHO SEES IT
--
-- A linked household (family_links accepted, read live) that has matched the
-- story's person with somebody on its own tree (family_tree_matches
-- accepted, 20260923160000) -- the Reyes, who have the same Lolo Eduardo,
-- see the Singians' shared stories about him on their own Eduardo's stories
-- page. A linked household that has not matched the person has nowhere to
-- show a story about them, and sees nothing. Revoking the link, withdrawing
-- the match, unticking the switch or deleting the story closes it at once:
-- nothing is copied.
--
-- WHAT THEY GET
--
-- Read only, through linked_tree_stories() and linked_tree_story_files()
-- below, which hand over the story, the names of who told it and who added
-- it (the way shared_branch() hands over a member's name), and its files.
-- No select policy on the tables themselves: the household's own reads stay
-- exactly as they were, and the other household cannot list anything but
-- what these functions return. Nothing is writable across the wall.
--
-- The files stay in the writer's household folder (documents bucket,
-- <household>/stories/...), still counted in its storage. One more select
-- policy on storage.objects lets a reader sign a URL for a file of a story
-- shared with them, and for nothing else in that folder.
--
-- THE PUSH
--
-- tree_story_push_targets() says who hears about a story just added: the
-- rest of the household, and (when it is shared) the matched linked
-- households, each person's "journal" switch honoured. It answers only to
-- the story's writer and only for a few minutes after it was added or first
-- shared, so it cannot be used to ring anybody on demand. It hands back
-- which person to open in each household, since the Reyes' Eduardo is a
-- different row from the Singians'.

alter table public.tree_person_stories add column if not exists shared_at timestamptz;

-- When a story was shared is the server's to say: set the moment the switch
-- goes on, kept while it stays on, cleared when it goes off. A writer cannot
-- date a share in the past or the future (which would get round the push's
-- few minutes).
create or replace function public.tree_person_stories_share_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.shared_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.shared_at is not null then
    new.shared_at := old.shared_at;
  else
    new.shared_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.tree_person_stories_share_stamp() from public, anon;

drop trigger if exists tree_person_stories_share_stamp on public.tree_person_stories;
create trigger tree_person_stories_share_stamp
  before insert or update on public.tree_person_stories
  for each row execute function public.tree_person_stories_share_stamp();

-- Is this story shared with the caller's household? Shared, from another
-- household that is linked with the caller's, about a person the two have
-- matched. Answers yes or no and nothing else.
create or replace function public.tree_story_shared_with_me(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tree_person_stories s
    join public.family_tree_matches m
      on m.status = 'accepted'
     and (
       (m.offer_person_id = s.person_id and m.offer_family_id = s.family_id and m.to_family_id = public.current_family_id())
       or (m.to_person_id = s.person_id and m.to_family_id = s.family_id and m.offer_family_id = public.current_family_id())
     )
    where s.id = p_story
      and s.shared_at is not null
      and s.family_id <> public.current_family_id()
      and public.families_are_linked(s.family_id, public.current_family_id())
  );
$$;

revoke execute on function public.tree_story_shared_with_me(uuid) from public, anon;
grant execute on function public.tree_story_shared_with_me(uuid) to authenticated;

-- The stories linked households have shared about one person on the
-- caller's own tree. Empty for a person who is not on it.
create or replace function public.linked_tree_stories(p_person uuid)
returns table (
  id uuid,
  family_name text,
  title text,
  body text,
  teller text,
  happened_on date,
  happened_precision text,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         coalesce(f.name, 'A linked household'),
         s.title,
         s.body,
         coalesce(teller.full_name, s.told_by_name),
         s.happened_on,
         s.happened_precision,
         author.full_name,
         s.created_at,
         s.updated_at
  from public.family_tree_matches m
  join public.tree_person_stories s
    on s.person_id = case when m.offer_family_id = public.current_family_id() then m.to_person_id else m.offer_person_id end
   and s.family_id = case when m.offer_family_id = public.current_family_id() then m.to_family_id else m.offer_family_id end
  join public.families f on f.id = s.family_id
  left join public.members teller on teller.id = s.told_by_member_id
  left join public.members author on author.id = s.created_by
  where m.status = 'accepted'
    and (
      (m.offer_family_id = public.current_family_id() and m.offer_person_id = p_person)
      or (m.to_family_id = public.current_family_id() and m.to_person_id = p_person)
    )
    and exists (select 1 from public.family_tree_people p where p.id = p_person and p.family_id = public.current_family_id())
    and s.shared_at is not null
    and public.families_are_linked(s.family_id, public.current_family_id());
$$;

revoke execute on function public.linked_tree_stories(uuid) from public, anon;
grant execute on function public.linked_tree_stories(uuid) to authenticated;

-- Their files, for the same person.
create or replace function public.linked_tree_story_files(p_person uuid)
returns table (
  id uuid,
  story_id uuid,
  storage_path text,
  mime_type text,
  file_name text,
  transcript text,
  "position" int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.story_id, f.storage_path, f.mime_type, f.file_name, f.transcript, f.position, f.created_at
  from public.tree_person_story_files f
  where f.story_id in (select ls.id from public.linked_tree_stories(p_person) ls)
  order by f.position, f.created_at;
$$;

revoke execute on function public.linked_tree_story_files(uuid) from public, anon;
grant execute on function public.linked_tree_story_files(uuid) to authenticated;

-- For the storage policy: a file of a story shared with the caller, by its
-- path.
create or replace function public.tree_story_object_shared_with_me(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tree_person_story_files f
    where f.storage_path = p_name and public.tree_story_shared_with_me(f.story_id)
  );
$$;

revoke execute on function public.tree_story_object_shared_with_me(text) from public, anon;
grant execute on function public.tree_story_object_shared_with_me(text) to authenticated;

-- Signing a URL runs as the reader, so without this the linked household
-- would see a story and a broken recording. Only under a stories folder, so
-- the check never runs for the rest of the bucket.
drop policy if exists tree_story_objects_select_linked on storage.objects;
create policy tree_story_objects_select_linked on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and split_part(name, '/', 2) = 'stories'
    and public.tree_story_object_shared_with_me(name)
  );

-- Who to tell about a story just added (p_new) or just shared. The rest of
-- the household when it is new; the linked households that matched its
-- person when it is shared. person_id is the person to open in the
-- recipient's own household.
create or replace function public.tree_story_push_targets(p_story uuid, p_new boolean)
returns table (endpoint text, p256dh text, auth text, person_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with story as (
    select s.*
    from public.tree_person_stories s
    where s.id = p_story
      and s.family_id = public.current_family_id()
      and s.created_by = public.current_member_id()
  ),
  household as (
    select s.endpoint, s.p256dh, s.auth, st.person_id
    from story st
    join public.members m on m.family_id = st.family_id
    join public.push_subscriptions s on s.member_id = m.id and s.family_id = m.family_id
    where p_new
      and st.created_at > now() - interval '10 minutes'
      and m.status = 'active'
      and m.id <> public.current_member_id()
      and coalesce((m.notification_prefs ->> 'journal')::boolean, true)
  ),
  linked as (
    select s.endpoint, s.p256dh, s.auth,
           case when mt.offer_family_id = st.family_id then mt.to_person_id else mt.offer_person_id end as person_id
    from story st
    join public.family_tree_matches mt
      on mt.status = 'accepted'
     and (
       (mt.offer_family_id = st.family_id and mt.offer_person_id = st.person_id)
       or (mt.to_family_id = st.family_id and mt.to_person_id = st.person_id)
     )
    join public.members m
      on m.family_id = case when mt.offer_family_id = st.family_id then mt.to_family_id else mt.offer_family_id end
    join public.push_subscriptions s on s.member_id = m.id and s.family_id = m.family_id
    where st.shared_at is not null
      and st.shared_at > now() - interval '10 minutes'
      and public.families_are_linked(st.family_id, m.family_id)
      and m.status = 'active'
      and coalesce((m.notification_prefs ->> 'journal')::boolean, true)
  )
  select * from household
  union
  select * from linked;
$$;

revoke execute on function public.tree_story_push_targets(uuid, boolean) from public, anon;
grant execute on function public.tree_story_push_targets(uuid, boolean) to authenticated;
