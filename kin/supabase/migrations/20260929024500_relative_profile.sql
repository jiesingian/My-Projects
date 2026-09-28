-- A relative's profile, for someone in a linked household (Jonathan,
-- 28 September): tapping a greeter's name on a birthday card, or anyone who
-- shares the family, opens a read-only page for them.
--
-- WHAT IT SHOWS, AND WHAT IT DOES NOT
--
-- Their name, photo and cover; the household they are in, and the
-- conversation this household already has with it; and where they are on
-- the family tree, when they sit in a branch the two households have joined
-- (20260923160000_tree_shared_relatives -- only a shared branch, never the
-- rest of their tree). Their recent moments are read by the page itself
-- through the policies that already let linked households see shared
-- memories and milestones, so nothing new crosses for those.
--
-- Nothing from About -- no birthday, mobile, email, work, IDs, sizes --
-- and no health, documents or money. The household member row stays
-- unreadable across households; this function returns the few columns
-- above and nothing else.
--
-- WHO MAY ASK
--
-- Only a signed-in member whose household is linked with the relative's,
-- and only while the relative's household shares with relatives -- the same
-- rule as birthdays on the family feed (can_see_occasions_of). Anyone else,
-- or a member who has left or been removed, gets no row: the page shows
-- "not found" whether the person does not exist or is simply not theirs to
-- see.

create or replace function public.relative_profile(p_member_id uuid)
returns table (
  member_id uuid,
  full_name text,
  avatar_url text,
  cover_path text,
  family_id uuid,
  household_name text,
  link_id uuid,
  match_id uuid,
  tree_person_id uuid,
  is_shared_person boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  cf uuid := current_family_id();
  mem members%rowtype;
  tp uuid;
  m record;
begin
  select * into mem from members where members.id = p_member_id;
  if mem.id is null or cf is null or mem.family_id = cf or mem.status <> 'active' then
    return;
  end if;
  if not can_see_occasions_of(mem.family_id) then
    return;
  end if;

  select p.id into tp from family_tree_people p where p.member_id = mem.id and p.family_id = mem.family_id limit 1;

  member_id := mem.id;
  full_name := mem.full_name;
  avatar_url := mem.avatar_url;
  cover_path := (select a.storage_path from member_avatars a where a.id = mem.cover_avatar_id and a.member_id = mem.id);
  family_id := mem.family_id;
  household_name := (select f.name from families f where f.id = mem.family_id);
  link_id := (
    select l.id from family_links l
    where l.status = 'accepted'
      and ((l.requester_family_id = cf and l.addressee_family_id = mem.family_id)
        or (l.requester_family_id = mem.family_id and l.addressee_family_id = cf))
    limit 1
  );

  -- Where they are on this household's tree: the first joined branch they
  -- sit in. shared_branch() answers only for the caller's own matches.
  if tp is not null then
    for m in
      select x.id from family_tree_matches x
      where x.status = 'accepted'
        and cf in (x.offer_family_id, x.to_family_id)
        and mem.family_id in (x.offer_family_id, x.to_family_id)
    loop
      select m.id, b.is_shared_person into match_id, is_shared_person
      from shared_branch(m.id) b where b.id = tp;
      if match_id is not null then
        tree_person_id := tp;
        exit;
      end if;
    end loop;
  end if;

  return next;
end;
$$;

revoke execute on function public.relative_profile(uuid) from public, anon;
grant execute on function public.relative_profile(uuid) to authenticated;
