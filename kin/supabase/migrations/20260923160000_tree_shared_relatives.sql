-- Relatives across households: one person, recorded in two family trees.
--
-- Linked households (family_links, accepted) can agree that somebody in one
-- tree is the same person as somebody in the other -- Grandpa Eduardo, as the
-- Singians have him and as the Reyes have him. Once they have, each household
-- can see that person's blood relatives as the other household recorded them:
-- ancestors, descendants, and the other parent of each descendant. Nothing
-- else. An in-law's own family, anybody not descended from or ancestral to the
-- shared person, notes, photographs and member accounts stay where they are.
--
-- The rule the whole design follows: nothing about a tree is revealed to
-- another household that somebody in the first household did not choose to
-- share. So a match starts as an *offer* of one person -- their name and year
-- of birth, and nothing more -- and the other household decides what, in their
-- own tree, that person is.
--
-- No insert, update or delete policy on the table: every write goes through
-- the functions below, the same way family_links does, because each write has
-- to check things across two households that a row policy cannot see.

create table if not exists public.family_tree_matches (
  id uuid primary key default gen_random_uuid(),
  offer_family_id uuid not null references public.families(id) on delete cascade,
  offer_person_id uuid not null references public.family_tree_people(id) on delete cascade,
  to_family_id uuid not null references public.families(id) on delete cascade,
  to_person_id uuid references public.family_tree_people(id) on delete cascade,
  status text not null default 'pending',
  offered_by uuid references public.members(id) on delete set null,
  offered_at timestamptz not null default now(),
  decided_by uuid references public.members(id) on delete set null,
  decided_at timestamptz,
  constraint family_tree_matches_status check (status in ('pending', 'accepted', 'declined')),
  constraint family_tree_matches_two_households check (offer_family_id <> to_family_id),
  -- Accepted means matched to a person, and only accepted does.
  constraint family_tree_matches_accepted_has_person check ((status = 'accepted') = (to_person_id is not null))
);

-- One live offer of a person to a household at a time.
create unique index if not exists family_tree_matches_live_idx
  on public.family_tree_matches (offer_person_id, to_family_id)
  where status in ('pending', 'accepted');
create index if not exists family_tree_matches_offer_family_idx on public.family_tree_matches (offer_family_id);
create index if not exists family_tree_matches_to_family_idx on public.family_tree_matches (to_family_id);

alter table public.family_tree_matches enable row level security;

drop policy if exists family_tree_matches_select on public.family_tree_matches;
create policy family_tree_matches_select on public.family_tree_matches
  for select using (offer_family_id = current_family_id() or to_family_id = current_family_id());

-- ── offering a person ─────────────────────────────────────────────────────
create or replace function public.offer_tree_person(person uuid, to_family uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fam uuid := current_family_id();
  existing uuid;
begin
  if fam is null then raise exception 'Not a member of any household.' using errcode = '42501'; end if;
  if not exists (select 1 from family_tree_people where id = person and family_id = fam) then
    raise exception 'That person is not in your tree.' using errcode = '42501';
  end if;
  if not families_are_linked(fam, to_family) then
    raise exception 'You can only share with a household you are linked to.' using errcode = '42501';
  end if;
  select id into existing from family_tree_matches
   where offer_person_id = person and to_family_id = to_family and status in ('pending', 'accepted');
  if existing is not null then return existing; end if;
  insert into family_tree_matches (offer_family_id, offer_person_id, to_family_id, offered_by)
  values (fam, person, to_family, current_member_id())
  returning id into existing;
  return existing;
end;
$$;

-- ── what an offer says, to the household it was made to ───────────────────
-- The name and year of birth of the one person offered, and the name of the
-- household that offered them. Only to the household it was offered to, and
-- only while the two are linked.
create or replace function public.tree_offers_for_me()
returns table (match_id uuid, from_family_name text, full_name text, birth_year text, status text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id,
         f.name,
         coalesce(mem.full_name, p.full_name, 'Unnamed'),
         left(coalesce(mem.dob, p.dob)::text, 4),
         m.status
  from family_tree_matches m
  join families f on f.id = m.offer_family_id
  join family_tree_people p on p.id = m.offer_person_id
  left join members mem on mem.id = p.member_id
  where m.to_family_id = current_family_id()
    and m.status = 'pending'
    and families_are_linked(m.offer_family_id, m.to_family_id);
$$;

-- ── answering one ─────────────────────────────────────────────────────────
-- accept with their_person: "that is our Eduardo".
-- accept with no person:   "add him to our tree" -- a new person in this
--                           household's tree, name and birthdate only.
-- decline:                  nothing is matched and nothing is copied.
create or replace function public.respond_tree_offer(match uuid, accept boolean, their_person uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fam uuid := current_family_id();
  me uuid := current_member_id();
  m family_tree_matches%rowtype;
  target uuid := their_person;
begin
  select * into m from family_tree_matches where id = match;
  if m.id is null or m.to_family_id is distinct from fam then
    raise exception 'That offer is not yours to answer.' using errcode = '42501';
  end if;
  if m.status <> 'pending' then raise exception 'That offer has already been answered.'; end if;
  if not families_are_linked(m.offer_family_id, fam) then
    raise exception 'Your households are no longer linked.' using errcode = '42501';
  end if;

  if not accept then
    update family_tree_matches set status = 'declined', decided_by = me, decided_at = now() where id = match;
    return null;
  end if;

  if target is not null then
    if not exists (select 1 from family_tree_people where id = target and family_id = fam) then
      raise exception 'That person is not in your tree.' using errcode = '42501';
    end if;
  else
    insert into family_tree_people (family_id, full_name, dob, created_by)
    select fam, coalesce(mem.full_name, p.full_name, 'Unnamed'), coalesce(mem.dob, p.dob), me
    from family_tree_people p left join members mem on mem.id = p.member_id
    where p.id = m.offer_person_id
    returning id into target;
  end if;

  update family_tree_matches
     set status = 'accepted', to_person_id = target, decided_by = me, decided_at = now()
   where id = match;
  return target;
end;
$$;

-- ── undoing one ───────────────────────────────────────────────────────────
-- Either household can take a match back. Only the match goes: a person
-- copied into a tree by accepting stays in that tree, because by then they are
-- that household's record.
create or replace function public.withdraw_tree_match(match uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from family_tree_matches
   where id = match and (offer_family_id = current_family_id() or to_family_id = current_family_id());
  if not found then raise exception 'That match is not yours to undo.' using errcode = '42501'; end if;
end;
$$;

-- ── the shared branch ─────────────────────────────────────────────────────
-- The other household's record of a shared person's blood relatives: their
-- ancestors, their descendants, and the other parent of each descendant --
-- the people you need to draw a family line, and no others. Spouse links are
-- only returned when both ends are in the branch, so the edge of it never
-- points at somebody it did not include.
--
-- Returned only for an accepted match this household is part of, and only
-- while the two households are still linked: revoking the link closes every
-- branch at once, without anybody having to find and undo each match.
--
-- Year of birth rather than the full date, and no notes, photographs or
-- member ids: a relative's line is shared, their records are not.
create or replace function public.shared_branch(match uuid)
returns table (id uuid, full_name text, birth_year text, father_id uuid, mother_id uuid, spouse_id uuid, is_shared_person boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  fam uuid := current_family_id();
  m family_tree_matches%rowtype;
  other_family uuid;
  root uuid;
begin
  select * into m from family_tree_matches where family_tree_matches.id = match and status = 'accepted';
  if m.id is null or fam is null or fam not in (m.offer_family_id, m.to_family_id) then return; end if;
  if not families_are_linked(m.offer_family_id, m.to_family_id) then return; end if;
  if fam = m.offer_family_id then
    other_family := m.to_family_id; root := m.to_person_id;
  else
    other_family := m.offer_family_id; root := m.offer_person_id;
  end if;

  return query
  with recursive
    up as (
      select p.id, p.father_id, p.mother_id from family_tree_people p where p.id = root and p.family_id = other_family
      union
      select a.id, a.father_id, a.mother_id
      from family_tree_people a join up on a.id in (up.father_id, up.mother_id)
      where a.family_id = other_family
    ),
    down as (
      select p.id from family_tree_people p where p.id = root and p.family_id = other_family
      union
      select c.id from family_tree_people c join down on down.id in (c.father_id, c.mother_id)
      where c.family_id = other_family
    ),
    coparents as (
      select unnest(array[c.father_id, c.mother_id]) as id
      from family_tree_people c
      where c.id in (select down.id from down) and c.id <> root
    ),
    branch as (
      select up.id from up
      union select down.id from down
      union select coparents.id from coparents where coparents.id is not null
    )
  select p.id,
         coalesce(mem.full_name, p.full_name, 'Unnamed'),
         left(coalesce(mem.dob, p.dob)::text, 4),
         case when p.father_id in (select branch.id from branch) then p.father_id end,
         case when p.mother_id in (select branch.id from branch) then p.mother_id end,
         case when p.spouse_id in (select branch.id from branch) then p.spouse_id end,
         p.id = root
  from family_tree_people p
  left join members mem on mem.id = p.member_id
  where p.id in (select branch.id from branch) and p.family_id = other_family;
end;
$$;

revoke all on function public.offer_tree_person(uuid, uuid) from public;
revoke all on function public.tree_offers_for_me() from public;
revoke all on function public.respond_tree_offer(uuid, boolean, uuid) from public;
revoke all on function public.withdraw_tree_match(uuid) from public;
revoke all on function public.shared_branch(uuid) from public;
grant execute on function public.offer_tree_person(uuid, uuid) to authenticated;
grant execute on function public.tree_offers_for_me() to authenticated;
grant execute on function public.respond_tree_offer(uuid, boolean, uuid) to authenticated;
grant execute on function public.withdraw_tree_match(uuid) to authenticated;
grant execute on function public.shared_branch(uuid) to authenticated;
