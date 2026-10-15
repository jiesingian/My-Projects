-- Suki and loyalty cards at checkout (asked for by Janine, 15 October).
--
-- WHAT A CARD IS
--
-- The household's loyalty and membership cards -- SM Advantage, Puregold
-- Perks, Robinsons Rewards, a Mercury Drug Suki card, S&R membership, or the
-- palengke vendor who gives suki prices: which store, the card's name, its
-- number, whether to show the number as a QR code at the counter, and a note
-- ("ask for suki price", "Mama's card"). The Buy list shows them at
-- checkout, the ones for the shopping day's store first.
--
-- WHO SEES IT, AND WHO WRITES IT
--
-- The household only. Never a linked household: a card number is the
-- household's, the way an account number is, and the shared-branch reads
-- hand a linked household names and birth years, nothing like this.
--
-- Everyone in the household who can open the Buy list may see the cards:
-- grown-ups, and children with a login of their own who are not in kid view
-- (kid view keeps a child out of the household pages, so out of this too).
-- A teen sent to the shop shows the card at the counter.
--
-- Only grown-ups (parent, adult) add, change or take off a card. A card is
-- usually a grown-up's own membership; a teen who can show it does not need
-- to rewrite it. Nobody adds one in somebody else's name: created_by must be
-- the caller.
--
-- KIN FREE
--
-- The Buy list is Kin Free, so this is too.

create table if not exists public.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  store text not null check (length(btrim(store)) between 1 and 80),
  card_name text not null default '' check (length(card_name) <= 80),
  card_number text not null check (length(btrim(card_number)) between 1 and 64),
  -- How the number is shown at the counter: as a QR code (lib/qr) under it,
  -- or the number alone for a cashier who types it in. Kept as words so a
  -- barcode can be added without a new column.
  code_format text not null default 'qr' check (code_format in ('qr', 'none')),
  note text check (note is null or length(note) <= 200),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loyalty_cards_family_idx on public.loyalty_cards (family_id);
create index if not exists loyalty_cards_created_by_idx on public.loyalty_cards (created_by);

alter table public.loyalty_cards enable row level security;

-- May the caller see the household's cards? Anyone active in it who is not
-- a child in kid view. Read from their own member row, which a policy on
-- another table cannot do without going through members' own policies.
create or replace function public.can_see_loyalty_cards()
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
      and not (m.role = 'child_self' and coalesce(m.kid_view, false))
  );
$$;

revoke execute on function public.can_see_loyalty_cards() from public, anon;
grant execute on function public.can_see_loyalty_cards() to authenticated;

drop policy if exists loyalty_cards_select on public.loyalty_cards;
create policy loyalty_cards_select on public.loyalty_cards
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.can_see_loyalty_cards())
  );

drop policy if exists loyalty_cards_insert on public.loyalty_cards;
create policy loyalty_cards_insert on public.loyalty_cards
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

-- Any grown-up may change any of the household's cards: they are the
-- household's, and the number on one does change (a renewed membership).
-- created_by stays who added it.
drop policy if exists loyalty_cards_update on public.loyalty_cards;
create policy loyalty_cards_update on public.loyalty_cards
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  )
  with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

drop policy if exists loyalty_cards_delete on public.loyalty_cards;
create policy loyalty_cards_delete on public.loyalty_cards
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

grant select, insert, update, delete on public.loyalty_cards to authenticated;

-- When a card was last changed; and who added it cannot be rewritten.
create or replace function public.loyalty_cards_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.created_by := old.created_by;
  return new;
end;
$$;

revoke execute on function public.loyalty_cards_touch() from public, anon;

drop trigger if exists loyalty_cards_touch on public.loyalty_cards;
create trigger loyalty_cards_touch
  before update on public.loyalty_cards
  for each row execute function public.loyalty_cards_touch();
