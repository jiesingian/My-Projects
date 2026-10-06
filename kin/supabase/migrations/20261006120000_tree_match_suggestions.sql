-- Suggested matches between linked households' trees: "Is this the same
-- Stella?" (docs/FAMILY_TREE.md, step 3).
--
-- When a linked household's tree has somebody who looks like somebody in
-- yours, a grown-up is asked "Same person?". "Looks like" is strict:
--
--   the same name (first and last word, case and accents ignored, so a middle
--   name or "María" for "Maria" does not keep them apart), and either
--     * the same full birth date, both recorded, or
--     * the same father's and mother's names, all four recorded.
--
-- Nothing is ever merged or linked by this. A suggestion only says the two
-- rows exist; linking goes through the matches that already exist
-- (20260923160000), and needs both households:
--
--   * the first household's "Same person" offers its person to the other
--     (offer_tree_person), which shares a name and a birth year, as an offer
--     always has;
--   * the other household then sees the same suggestion, marked as offered,
--     and its "Same person" accepts that offer pointing at its own person
--     (respond_tree_offer). Only then are they matched.
--
-- So no household learns another's tree without that household choosing to
-- share. What a suggestion reveals is only that the other tree holds someone
-- with a name, and a birth date or parents, that you had already typed in.
--
-- "Not the same" dismisses a pair for your household for good
-- (family_tree_match_dismissals). It is your household's answer only; the
-- other household's suggestion is theirs to answer.
--
-- Grown-ups only (parent or adult): children see no suggestions and cannot
-- dismiss one.

create table if not exists public.family_tree_match_dismissals (
  family_id uuid not null references public.families(id) on delete cascade,
  person_id uuid not null references public.family_tree_people(id) on delete cascade,
  other_person_id uuid not null references public.family_tree_people(id) on delete cascade,
  dismissed_by uuid references public.members(id) on delete set null,
  dismissed_at timestamptz not null default now(),
  primary key (family_id, person_id, other_person_id)
);

create index if not exists family_tree_match_dismissals_person_idx on public.family_tree_match_dismissals (person_id);
create index if not exists family_tree_match_dismissals_other_idx on public.family_tree_match_dismissals (other_person_id);
create index if not exists family_tree_match_dismissals_by_idx on public.family_tree_match_dismissals (dismissed_by);

alter table public.family_tree_match_dismissals enable row level security;

drop policy if exists family_tree_match_dismissals_select on public.family_tree_match_dismissals;
create policy family_tree_match_dismissals_select on public.family_tree_match_dismissals
  for select to authenticated using (family_id = (select public.current_family_id()));
-- No insert, update or delete policy: written only by dismiss_tree_suggestion().

-- The part of a name a match compares: its first and last word, lower case,
-- without accents. Null for a blank name, which never matches anything.
create or replace function public.tree_name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when n = '' then null
           when position(' ' in n) = 0 then n
           else split_part(n, ' ', 1) || ' ' || regexp_replace(n, '^.* ', '')
         end
  from (
    select regexp_replace(
             lower(translate(btrim(coalesce(p_name, '')), 'ÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÑáàâäéèêëíìîïóòôöúùûüñ', 'AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun')),
             '[^a-z0-9 -]+|\s+', ' ', 'g'
           ) as raw
  ) s,
  lateral (select btrim(regexp_replace(s.raw, ' +', ' ', 'g')) as n) t;
$$;

-- Every suggestion for the caller's household, at most 50. Each row is one
-- of our people and one of a linked household's, with what the other
-- household's record says (name and birth year only) and, when the other
-- household has already offered that person to us, the offer to accept.
create or replace function public.tree_match_suggestions()
returns table (
  person_id uuid,
  other_family_id uuid,
  other_family_name text,
  other_person_id uuid,
  other_name text,
  other_birth_year text,
  reason text,
  their_offer_id uuid,
  we_offered boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select m.family_id
    from public.members m
    where m.auth_user_id = auth.uid() and m.status = 'active' and m.role in ('parent', 'adult')
    limit 1
  ),
  linked as (
    select case when l.requester_family_id = me.family_id then l.addressee_family_id else l.requester_family_id end as family_id
    from public.family_links l, me
    where l.status = 'accepted' and me.family_id in (l.requester_family_id, l.addressee_family_id)
  ),
  people as (
    select p.id, p.family_id,
           public.tree_name_key(coalesce(mem.full_name, p.full_name)) as name_key,
           coalesce(mem.full_name, p.full_name) as full_name,
           coalesce(mem.dob, p.dob) as dob,
           public.tree_name_key(coalesce(fm.full_name, f.full_name)) as father_key,
           public.tree_name_key(coalesce(mm.full_name, mo.full_name)) as mother_key
    from public.family_tree_people p
    left join public.members mem on mem.id = p.member_id
    left join public.family_tree_people f on f.id = p.father_id
    left join public.members fm on fm.id = f.member_id
    left join public.family_tree_people mo on mo.id = p.mother_id
    left join public.members mm on mm.id = mo.member_id
    where p.family_id in (select me.family_id from me union select linked.family_id from linked)
  )
  select ours.id,
         theirs.family_id,
         fam.name,
         theirs.id,
         coalesce(theirs.full_name, 'Unnamed'),
         left(theirs.dob::text, 4),
         case when ours.dob is not null and ours.dob = theirs.dob then 'birth date' else 'parents' end,
         offer.id,
         exists (
           select 1 from public.family_tree_matches x
           where x.offer_person_id = ours.id and x.to_family_id = theirs.family_id and x.status = 'pending'
         )
  from me
  join people ours on ours.family_id = me.family_id
  join people theirs on theirs.family_id in (select linked.family_id from linked)
                    and theirs.name_key = ours.name_key
  join public.families fam on fam.id = theirs.family_id
  left join public.family_tree_matches offer
         on offer.offer_person_id = theirs.id and offer.to_family_id = me.family_id and offer.status = 'pending'
  where ours.name_key is not null
    and (
      (ours.dob is not null and ours.dob = theirs.dob)
      or (ours.father_key is not null and ours.mother_key is not null
          and ours.father_key = theirs.father_key and ours.mother_key = theirs.mother_key)
    )
    -- Either of the two already matched with the other household, either
    -- way round: nothing to ask.
    and not exists (
      select 1 from public.family_tree_matches x
      where x.status = 'accepted'
        and ((x.offer_person_id = ours.id and x.to_family_id = theirs.family_id)
          or (x.to_person_id = ours.id and x.offer_family_id = theirs.family_id)
          or (x.offer_person_id = theirs.id and x.to_family_id = me.family_id)
          or (x.to_person_id = theirs.id and x.offer_family_id = me.family_id))
    )
    and not exists (
      select 1 from public.family_tree_match_dismissals d
      where d.family_id = me.family_id and d.person_id = ours.id and d.other_person_id = theirs.id
    )
  order by fam.name, coalesce(theirs.full_name, '')
  limit 50;
$$;

-- "Not the same": this pair is never suggested to this household again. Only
-- a grown-up, only for a pair that is being suggested to them, so nobody can
-- write rows about people they were never shown.
create or replace function public.dismiss_tree_suggestion(p_person uuid, p_other_person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_member uuid;
begin
  select m.family_id, m.id into v_family, v_member
  from public.members m
  where m.auth_user_id = auth.uid() and m.status = 'active' and m.role in ('parent', 'adult')
  limit 1;
  if v_family is null then
    raise exception 'Only a grown-up can answer that.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.tree_match_suggestions() s
    where s.person_id = p_person and s.other_person_id = p_other_person
  ) then
    raise exception 'That suggestion is not yours to answer.' using errcode = '42501';
  end if;
  insert into public.family_tree_match_dismissals (family_id, person_id, other_person_id, dismissed_by)
  values (v_family, p_person, p_other_person, v_member)
  on conflict do nothing;
end;
$$;

revoke all on function public.tree_name_key(text) from public, anon;
revoke all on function public.tree_match_suggestions() from public, anon;
revoke all on function public.dismiss_tree_suggestion(uuid, uuid) from public, anon;
grant execute on function public.tree_name_key(text) to authenticated;
grant execute on function public.tree_match_suggestions() to authenticated;
grant execute on function public.dismiss_tree_suggestion(uuid, uuid) to authenticated;
