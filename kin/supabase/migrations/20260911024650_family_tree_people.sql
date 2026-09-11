-- A family tree: father's side, mother's side, and the people between
-- ====================================================================
--
-- What this is for
-- -----------------
-- Nothing in this schema records who anyone's parents are. members holds a
-- flat list of the household plus a free-text "relationship" string set per
-- person (Mother, Son, Daughter...), which says how someone relates to the
-- household in general but not who links to whom -- there was no way to ask
-- "whose father is this" and no way to represent a grandparent, an aunt, or
-- anyone else who isn't a Kin household member at all.
--
-- This adds exactly that: one table, three self-referencing links
-- (father_id, mother_id, spouse_id), and a nullable member_id for the rows
-- that happen to also be a real Kin login. A grandparent nobody ever signed
-- up sits in this table the same way a parent who did does -- the tree does
-- not care which kind of row it is looking at, only how the links connect.
--
-- "Father's side" and "mother's side" are not stored anywhere. They fall out
-- of the graph itself: from whoever the tree is centred on, father_id points
-- one way and mother_id points the other, and everything reachable from
-- there (walking father_id, mother_id and spouse_id outward, plus anyone who
-- shares a parent along the way, i.e. siblings) belongs to that side. No
-- extra column to keep in sync, and no way for it to say something the links
-- themselves don't already say.
--
-- Why member_id is nullable, not the other way around
-- -----------------------------------------------------
-- A household's own members are the minority of a family tree, not the
-- majority -- most of a father's side and a mother's side has never had a
-- Kin login and never will. Making every tree row require one would have
-- meant creating a throwaway member row for every grandparent just to give
-- them a place to exist, which is a bigger lie than a nullable column.
--
-- full_name is nullable for the opposite reason: a row that IS a household
-- member already has a name, on members, and duplicating it here would
-- drift the moment someone corrected a spelling on their profile and not
-- here. The CHECK below just insists every row has a name one way or the
-- other -- the query layer prefers the members join when member_id is set.
--
-- Visibility follows the income_schedules/bills convention: any signed-in
-- member of the family can see and edit every row, because a family tree is
-- something a household builds together, not something one person owns.
create table public.family_tree_people (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  member_id uuid references public.members(id),
  full_name text,
  dob date,
  notes text,
  father_id uuid references public.family_tree_people(id) on delete set null,
  mother_id uuid references public.family_tree_people(id) on delete set null,
  spouse_id uuid references public.family_tree_people(id) on delete set null,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  constraint family_tree_people_has_a_name check (member_id is not null or full_name is not null),
  constraint family_tree_people_not_own_father check (id is distinct from father_id),
  constraint family_tree_people_not_own_mother check (id is distinct from mother_id),
  constraint family_tree_people_not_own_spouse check (id is distinct from spouse_id)
);

alter table public.family_tree_people enable row level security;

-- father_id and mother_id are read in reverse as often as forward: finding
-- a person's children/siblings means "who has father_id = me", which a plain
-- primary-key index does nothing for.
create index if not exists family_tree_people_father_id_idx on public.family_tree_people (father_id);
create index if not exists family_tree_people_mother_id_idx on public.family_tree_people (mother_id);
create index if not exists family_tree_people_spouse_id_idx on public.family_tree_people (spouse_id);
create index if not exists family_tree_people_member_id_idx on public.family_tree_people (member_id);

create policy family_tree_people_select on public.family_tree_people
  for select using (family_id = current_family_id());

create policy family_tree_people_insert on public.family_tree_people
  for insert with check (family_id = current_family_id());

create policy family_tree_people_update on public.family_tree_people
  for update using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy family_tree_people_delete on public.family_tree_people
  for delete using (family_id = current_family_id());


-- How to run it
-- =============
--
-- STEP 1 -- the create table, the four indexes, the four policies, and the
-- four CHECK constraints above. Touches no existing table, no existing row.
-- Expect "Success. No rows returned."
--
-- STEP 2 -- confirm RLS is on and all four policies exist. Read-only.
--
--   select relrowsecurity from pg_class where relname = 'family_tree_people';
--   -- expect true
--
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'family_tree_people'
--    order by policyname;
--   -- expect four rows: family_tree_people_delete, family_tree_people_insert,
--   -- family_tree_people_select, family_tree_people_update
--
--
-- To roll back
-- ------------
-- The table is new and, until the accompanying code ships, nothing writes to
-- it -- dropping it is safe at any point before that:
--
--   drop table public.family_tree_people;
