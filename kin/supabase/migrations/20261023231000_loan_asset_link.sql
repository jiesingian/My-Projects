-- A loan and the thing it bought (Janine, 23 October)
-- ===================================================
--
-- A housing loan is owed on the house, a car loan on the car. With the two
-- linked, A&L can show what is truly the household's in each: the asset's
-- value less what is still owed on it -- equity, the way a bank or the
-- SALN would read the pair. liabilities.asset_id is that link, optional:
-- a credit card or a personal loan is owed on nothing in particular.
--
-- An asset deleted leaves its loan standing, unlinked (on delete set null):
-- the debt is still owed whether or not the house is on record.
--
-- liability_asset_in_family keeps the link inside one household, so a
-- forged id cannot hang one household's loan on another's house. Who may
-- see or change the loan is unchanged: liabilities' own policies.

alter table public.liabilities add column if not exists asset_id uuid references public.assets(id) on delete set null;
create index if not exists liabilities_asset_idx on public.liabilities (asset_id);

create or replace function public.liability_asset_in_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.asset_id is not null
    and not exists (select 1 from public.assets a where a.id = new.asset_id and a.family_id = new.family_id) then
    raise exception 'liability_asset_not_in_family' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.liability_asset_in_family() from public, anon, authenticated;

drop trigger if exists liability_asset_in_family on public.liabilities;
create trigger liability_asset_in_family
  before insert or update of asset_id, family_id on public.liabilities
  for each row execute function public.liability_asset_in_family();
