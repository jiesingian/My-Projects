-- Three small things the family tree's design note (docs/FAMILY_TREE.md,
-- "Screening fake trees") proposed, so that a made-up or careless tree can
-- reach nobody who does not want it, and so a linked branch says what it
-- knows:
--
--  1. A limit on offers. A household can have at most 15 offers waiting on
--     any one other household, and make at most 40 offers a day in all. The
--     live-offer index already stops the same person being offered twice;
--     this stops a stream of different ones.
--
--  2. Blocking. A grown-up who has been offered a relative can say "no more
--     from this household": that offer and any others waiting from them are
--     declined, and they cannot offer again until it is undone. A decline
--     alone never stopped a second offer of the same person. Blocking only
--     stops offers *to* the blocking household: it can still offer to the
--     blocked one, and the two stay linked. The blocked household is told
--     only that it cannot offer right now.
--
--  3. Whether a relative in a linked household's branch has a Kin account
--     (shared_branch_accounts). It says yes or no, nothing about the
--     account, and only for a branch the caller has an accepted match with
--     -- the same rule as the rest of the branch.
--
-- Everything goes through functions: the block table has a select policy for
-- the blocking household only, and no write policy.

-- ── blocks ────────────────────────────────────────────────────────────────
create table if not exists public.family_tree_offer_blocks (
  family_id uuid not null references public.families(id) on delete cascade,
  blocked_family_id uuid not null references public.families(id) on delete cascade,
  blocked_by uuid references public.members(id) on delete set null,
  blocked_at timestamptz not null default now(),
  primary key (family_id, blocked_family_id),
  constraint family_tree_offer_blocks_two_households check (family_id <> blocked_family_id)
);
create index if not exists family_tree_offer_blocks_blocked_idx on public.family_tree_offer_blocks (blocked_family_id);
create index if not exists family_tree_offer_blocks_by_idx on public.family_tree_offer_blocks (blocked_by);

alter table public.family_tree_offer_blocks enable row level security;

drop policy if exists family_tree_offer_blocks_select on public.family_tree_offer_blocks;
create policy family_tree_offer_blocks_select on public.family_tree_offer_blocks
  for select to authenticated using (family_id = (select public.current_family_id()));
-- No insert, update or delete policy: written only by block_tree_offers and
-- unblock_tree_offers.

-- ── offering a person, now with a limit and a block ───────────────────────
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

  if exists (select 1 from family_tree_offer_blocks where family_id = to_family and blocked_family_id = fam) then
    raise exception 'That household is not taking relatives from you right now.' using errcode = '42501';
  end if;
  if (select count(*) from family_tree_matches
       where offer_family_id = fam and to_family_id = to_family and status = 'pending') >= 15 then
    raise exception 'That household already has 15 of your relatives waiting. Wait for them to answer before sharing more.';
  end if;
  if (select count(*) from family_tree_matches
       where offer_family_id = fam and offered_at > now() - interval '1 day') >= 40 then
    raise exception 'You have shared a lot of relatives today. Try again tomorrow.';
  end if;

  insert into family_tree_matches (offer_family_id, offer_person_id, to_family_id, offered_by)
  values (fam, person, to_family, current_member_id())
  returning id into existing;
  return existing;
end;
$$;

-- ── blocking, and undoing it ──────────────────────────────────────────────
-- By the offer that was received, so nobody can block a household they have
-- never been offered anything by.
create or replace function public.block_tree_offers(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_member uuid;
  v_from uuid;
begin
  select m.family_id, m.id into v_family, v_member
  from public.members m
  where m.auth_user_id = auth.uid() and m.status = 'active' and m.role in ('parent', 'adult')
  limit 1;
  if v_family is null then
    raise exception 'Only a grown-up can block offers.' using errcode = '42501';
  end if;
  select offer_family_id into v_from from public.family_tree_matches
   where id = p_match and to_family_id = v_family;
  if v_from is null then
    raise exception 'That offer is not yours to answer.' using errcode = '42501';
  end if;
  insert into public.family_tree_offer_blocks (family_id, blocked_family_id, blocked_by)
  values (v_family, v_from, v_member)
  on conflict do nothing;
  update public.family_tree_matches
     set status = 'declined', decided_by = v_member, decided_at = now()
   where to_family_id = v_family and offer_family_id = v_from and status = 'pending';
end;
$$;

create or replace function public.unblock_tree_offers(p_family uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  select m.family_id into v_family
  from public.members m
  where m.auth_user_id = auth.uid() and m.status = 'active' and m.role in ('parent', 'adult')
  limit 1;
  if v_family is null then
    raise exception 'Only a grown-up can unblock offers.' using errcode = '42501';
  end if;
  delete from public.family_tree_offer_blocks where family_id = v_family and blocked_family_id = p_family;
end;
$$;

-- The households the caller's household has blocked, by name.
create or replace function public.tree_offer_blocks_for_me()
returns table (family_id uuid, family_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_family_id, f.name
  from public.family_tree_offer_blocks b
  join public.families f on f.id = b.blocked_family_id
  where b.family_id = (select public.current_family_id())
  order by f.name;
$$;

-- ── who in a shared branch has an account ────────────────────────────────
-- A companion to shared_branch rather than a new column on it: changing a
-- function's return type cannot be re-run over the migration that made it.
-- It asks shared_branch, so it answers for exactly the people that does --
-- an accepted match the caller is part of, between households that are still
-- linked -- and says only yes or no.
create or replace function public.shared_branch_accounts(match uuid)
returns table (id uuid, has_account boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, p.member_id is not null
  from public.shared_branch(match) b
  join public.family_tree_people p on p.id = b.id;
$$;

revoke all on function public.offer_tree_person(uuid, uuid) from public, anon;
revoke all on function public.block_tree_offers(uuid) from public, anon;
revoke all on function public.unblock_tree_offers(uuid) from public, anon;
revoke all on function public.tree_offer_blocks_for_me() from public, anon;
revoke all on function public.shared_branch_accounts(uuid) from public, anon;
grant execute on function public.offer_tree_person(uuid, uuid) to authenticated;
grant execute on function public.block_tree_offers(uuid) to authenticated;
grant execute on function public.unblock_tree_offers(uuid) to authenticated;
grant execute on function public.tree_offer_blocks_for_me() to authenticated;
grant execute on function public.shared_branch_accounts(uuid) to authenticated;
