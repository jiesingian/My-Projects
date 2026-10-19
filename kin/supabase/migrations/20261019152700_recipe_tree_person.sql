-- Whose recipe it is (Jonathan, 19 October): "Lola's adobo". A recipe in the
-- household's book can name somebody on the household's tree -- a member, a
-- relative who is only a name, somebody who has passed -- and then shows on
-- their panel on the tree, their profile and their stories page.
--
-- One person per recipe, optional. The column rides on family_recipes'
-- existing household policies (who may read and write a recipe does not
-- change); the trigger below only stops a recipe from naming somebody on
-- another household's tree, which a foreign key alone cannot.
--
-- Taking the person off the tree keeps the recipe, without the name: the
-- adobo is still the family's (on delete set null).
--
-- Kin Free, as the recipe book and the tree are.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.family_recipes
  add column if not exists tree_person_id uuid references public.family_tree_people(id) on delete set null;

create index if not exists family_recipes_tree_person_idx on public.family_recipes (tree_person_id) where tree_person_id is not null;

create or replace function public.family_recipes_person_fits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tree_person_id is not null
     and (tg_op = 'INSERT' or new.tree_person_id is distinct from old.tree_person_id or new.family_id is distinct from old.family_id)
     and not exists (
       select 1 from public.family_tree_people p
       where p.id = new.tree_person_id and p.family_id = new.family_id
     ) then
    raise exception 'That person is not on your family tree.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.family_recipes_person_fits() from public, anon, authenticated;

drop trigger if exists family_recipes_person_fits on public.family_recipes;
create trigger family_recipes_person_fits
  before insert or update on public.family_recipes
  for each row execute function public.family_recipes_person_fits();
