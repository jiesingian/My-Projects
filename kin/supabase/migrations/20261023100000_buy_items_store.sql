-- Which store a line on the to-buy list is bought at (23 October, Janine).
--
-- The Household list is now read one kind of store at a time -- Market (the
-- palengke), Grocery (the supermarket), Bookstore, Drugstore / Pharmacy, Baby
-- store, Pet shop, Gadgets shop, Other -- from a "Shopping for" picker that
-- replaced the By aisle / By event chips. A line can also name the store
-- itself ("Mercury Drug", "Puregold"), and the list groups by that name inside
-- its kind.
--
-- store_kind is filled in when nobody chose one, by the same guess the app
-- makes (lib/grocery.ts guessStoreKind): a medicine's refill and personal care
-- at the pharmacy, fresh food at the market, baby and pet things at their own
-- shops, the rest at the supermarket. A trigger rather than a default, because
-- lines arrive from many places that will never send it -- the meal plan, the
-- helper's add link, medicine refills, the assistant -- and a default could
-- not look at the section. Existing lines get the same guess below.
--
-- store_name is optional free text. Nothing reads it across households, and
-- buy_items' own policies already keep both columns inside the household, so
-- there is no new policy.

alter table public.buy_items
  add column if not exists store_kind text,
  add column if not exists store_name text;

alter table public.buy_items drop constraint if exists buy_items_store_kind_check;
alter table public.buy_items
  add constraint buy_items_store_kind_check
  check (store_kind is null or store_kind in ('market', 'grocery', 'bookstore', 'pharmacy', 'baby', 'pet', 'gadgets', 'other'));

alter table public.buy_items drop constraint if exists buy_items_store_name_check;
alter table public.buy_items
  add constraint buy_items_store_name_check
  check (store_name is null or (char_length(store_name) between 1 and 80));

create or replace function public.buy_item_guess_store_kind(p_section text, p_medicine_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_medicine_id is not null then 'pharmacy'
    when p_section in ('Produce', 'Meat', 'Fish & Seafood') then 'market'
    when p_section = 'Personal Care' then 'pharmacy'
    when p_section = 'Baby' then 'baby'
    when p_section = 'Pet' then 'pet'
    else 'grocery'
  end
$$;

create or replace function public.buy_items_fill_store()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.store_kind is null then
    new.store_kind := public.buy_item_guess_store_kind(new.section, new.medicine_id);
  end if;
  -- A blank name is no name, so it never groups as a store called "".
  new.store_name := nullif(btrim(regexp_replace(coalesce(new.store_name, ''), '\s+', ' ', 'g')), '');
  return new;
end;
$$;

drop trigger if exists buy_items_fill_store on public.buy_items;
create trigger buy_items_fill_store
  before insert or update of store_kind, store_name, section on public.buy_items
  for each row execute function public.buy_items_fill_store();

update public.buy_items
  set store_kind = public.buy_item_guess_store_kind(section, medicine_id)
  where store_kind is null;
