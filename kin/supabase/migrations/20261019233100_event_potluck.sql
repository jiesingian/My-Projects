-- Potluck: who brings what, on an event
-- ======================================
--
-- The host household lists what is needed on one of its events ("Pancit,
-- 2 trays", "Ice, 3 bags"); guests claim an item with how many they will
-- bring, until it is covered. Shown on the event's own screen, under Who's
-- coming (20261014090000) and its thread (20261014100000).
--
-- Who takes part:
--   * the host household: anyone in it sees the list and claims; anyone in
--     it but a child in kid view adds, changes and removes items, as they
--     edit the event itself;
--   * linked households (family_links, accepted), only when the host turns
--     on events.potluck_relatives ("Ask linked households too"). They see
--     the event's title, date and list through potluck_event() and
--     relatives_potlucks(), never the events row itself, and claim in their
--     own name.
--
-- Names across households travel on the row (the claim's member_name and
-- household_name, set by a trigger from the caller), never by reading
-- another household's members.
--
-- A claim is in the claimer's own name, one per person per item, for 1 to
-- what is still open; nobody claims on a yearly event or one that is over.
-- The claimer changes or takes back their own; the host's grown-ups may also
-- take any claim off their own list.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.events add column if not exists potluck_relatives boolean not null default false;

create table if not exists public.potluck_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  label text not null,
  wanted integer not null default 1,
  position integer not null default 0,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint potluck_items_label_length check (char_length(btrim(label)) between 1 and 80),
  constraint potluck_items_wanted_range check (wanted between 1 and 50)
);

create index if not exists potluck_items_event_idx on public.potluck_items (event_id, position);
create index if not exists potluck_items_family_idx on public.potluck_items (family_id);
create index if not exists potluck_items_created_by_idx on public.potluck_items (created_by);

create table if not exists public.potluck_claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.potluck_items(id) on delete cascade,
  -- The host household and event, copied from the item by the trigger.
  event_id uuid not null references public.events(id) on delete cascade,
  event_family_id uuid not null references public.families(id) on delete cascade,
  -- Who claimed, from the caller.
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  member_name text not null default '',
  household_name text not null default '',
  qty integer not null default 1,
  created_at timestamptz not null default now(),
  constraint potluck_claims_qty_range check (qty between 1 and 50),
  constraint potluck_claims_one_each unique (item_id, member_id)
);

create index if not exists potluck_claims_event_idx on public.potluck_claims (event_id);
create index if not exists potluck_claims_event_family_idx on public.potluck_claims (event_family_id);
create index if not exists potluck_claims_member_idx on public.potluck_claims (member_id);
create index if not exists potluck_claims_family_idx on public.potluck_claims (family_id);

-- May the caller see this event's potluck? Their own household's event, or a
-- linked household's that asks relatives too. Definer, because the caller
-- cannot read another household's events row.
create or replace function public.potluck_visible(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event
      and (
        e.family_id = public.current_family_id()
        or (e.potluck_relatives and public.families_are_linked(e.family_id, public.current_family_id()))
      )
  )
$$;

revoke all on function public.potluck_visible(uuid) from public, anon;
grant execute on function public.potluck_visible(uuid) to authenticated;

-- Is the event still open for claims: one-off, and its last day not gone in
-- the host household's own zone.
create or replace function public.potluck_open(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    join public.families f on f.id = e.family_id
    where e.id = p_event
      and not coalesce(e.recurs_yearly, false)
      and greatest(e.event_date, coalesce(e.end_date, e.event_date)) >= (now() at time zone public.safe_time_zone(f.time_zone))::date
  )
$$;

revoke all on function public.potluck_open(uuid) from public, anon;
grant execute on function public.potluck_open(uuid) to authenticated;

-- ── items ─────────────────────────────────────────────────────────────────

alter table public.potluck_items enable row level security;

drop policy if exists potluck_items_select on public.potluck_items;
create policy potluck_items_select on public.potluck_items
  for select to authenticated
  using (public.potluck_visible(event_id));

-- The host household's, on its own event, by anyone but a child in kid view.
drop policy if exists potluck_items_insert on public.potluck_items;
create policy potluck_items_insert on public.potluck_items
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and exists (select 1 from public.events e where e.id = event_id and e.family_id = potluck_items.family_id)
    and not exists (select 1 from public.members m where m.id = (select public.current_member_id()) and coalesce(m.kid_view, false))
  );

drop policy if exists potluck_items_update on public.potluck_items;
create policy potluck_items_update on public.potluck_items
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and not exists (select 1 from public.members m where m.id = (select public.current_member_id()) and coalesce(m.kid_view, false))
  )
  with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.events e where e.id = event_id and e.family_id = potluck_items.family_id)
  );

drop policy if exists potluck_items_delete on public.potluck_items;
create policy potluck_items_delete on public.potluck_items
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and not exists (select 1 from public.members m where m.id = (select public.current_member_id()) and coalesce(m.kid_view, false))
  );

grant select, insert, update, delete on public.potluck_items to authenticated;

-- An item stays on its event; wanted never drops below what is claimed.
create or replace function public.potluck_items_fixed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_id is distinct from old.event_id or new.family_id is distinct from old.family_id then
    raise exception 'An item stays on its event.';
  end if;
  new.created_by := old.created_by;
  if new.wanted < coalesce((select sum(c.qty) from public.potluck_claims c where c.item_id = new.id), 0) then
    raise exception 'More than that is already claimed.';
  end if;
  return new;
end;
$$;

drop trigger if exists potluck_items_fixed on public.potluck_items;
create trigger potluck_items_fixed before update on public.potluck_items
  for each row execute function public.potluck_items_fixed();

-- ── claims ────────────────────────────────────────────────────────────────

alter table public.potluck_claims enable row level security;

drop policy if exists potluck_claims_select on public.potluck_claims;
create policy potluck_claims_select on public.potluck_claims
  for select to authenticated
  using (public.potluck_visible(event_id));

-- In one's own name (the trigger sets who, from the caller), on a potluck
-- one can see and that is still open.
drop policy if exists potluck_claims_insert on public.potluck_claims;
create policy potluck_claims_insert on public.potluck_claims
  for insert to authenticated
  with check (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
    and public.potluck_visible(event_id)
    and public.potluck_open(event_id)
  );

drop policy if exists potluck_claims_update on public.potluck_claims;
create policy potluck_claims_update on public.potluck_claims
  for update to authenticated
  using (member_id = (select public.current_member_id()) and public.potluck_open(event_id))
  with check (member_id = (select public.current_member_id()) and public.potluck_visible(event_id));

-- One's own; or, for the host's grown-ups, any on their own list.
drop policy if exists potluck_claims_delete on public.potluck_claims;
create policy potluck_claims_delete on public.potluck_claims
  for delete to authenticated
  using (
    member_id = (select public.current_member_id())
    or (event_family_id = (select public.current_family_id()) and (select public.current_member_role()) in ('parent', 'adult'))
  );

grant select, insert, update, delete on public.potluck_claims to authenticated;

-- Refuses a claim in anyone's name but the caller's, fills in the names
-- and the host from the caller and the item, and keeps the item
-- from being claimed past what is wanted. Locks the item so two people
-- claiming the last tray at once cannot both get it.
create or replace function public.potluck_claims_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  taken integer;
begin
  if tg_op = 'UPDATE' then
    if new.item_id is distinct from old.item_id or new.member_id is distinct from old.member_id then
      raise exception 'A claim stays on its item, in its claimer''s name.';
    end if;
    new.event_id := old.event_id;
    new.event_family_id := old.event_family_id;
    new.family_id := old.family_id;
    new.member_name := old.member_name;
    new.household_name := old.household_name;
    new.created_at := old.created_at;
  else
    if new.member_id is distinct from public.current_member_id() or new.family_id is distinct from public.current_family_id() then
      raise exception 'A claim is in your own name.';
    end if;
    new.member_name := coalesce((select m.full_name from public.members m where m.id = new.member_id), '');
    new.household_name := coalesce((select f.name from public.families f where f.id = new.family_id), '');
    new.created_at := now();
  end if;

  select i.id, i.event_id, i.family_id, i.wanted into item from public.potluck_items i where i.id = new.item_id for update;
  if item.id is null then
    raise exception 'That item is no longer on the list.';
  end if;
  new.event_id := item.event_id;
  new.event_family_id := item.family_id;

  select coalesce(sum(c.qty), 0) into taken from public.potluck_claims c where c.item_id = new.item_id and c.id <> new.id;
  if taken + new.qty > item.wanted then
    raise exception 'Only % left to bring.', greatest(item.wanted - taken, 0);
  end if;
  return new;
end;
$$;

revoke all on function public.potluck_claims_fill() from public;

drop trigger if exists potluck_claims_fill on public.potluck_claims;
create trigger potluck_claims_fill before insert or update on public.potluck_claims
  for each row execute function public.potluck_claims_fill();

-- ── what a linked household may read of the event ─────────────────────────

-- One potluck's event, for its screen: its title and dates and the host
-- household's name, to whoever may see the potluck. Nothing else of the
-- event (notes, people, place) crosses.
create or replace function public.potluck_event(p_event uuid)
returns table (event_id uuid, title text, event_date date, end_date date, host_family_id uuid, host_name text, mine boolean, relatives boolean, open boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.event_date, e.end_date, e.family_id, f.name,
         e.family_id = public.current_family_id(), e.potluck_relatives, public.potluck_open(e.id)
  from public.events e
  join public.families f on f.id = e.family_id
  where e.id = p_event and public.potluck_visible(e.id)
$$;

revoke all on function public.potluck_event(uuid) from public, anon;
grant execute on function public.potluck_event(uuid) to authenticated;

-- Linked households' potlucks the caller may join: open to relatives, with
-- at least one item, not over. Soonest first.
create or replace function public.relatives_potlucks()
returns table (event_id uuid, title text, event_date date, host_name text, items integer, open_items integer)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.event_date, f.name,
         count(i.id)::int,
         count(i.id) filter (where i.wanted > coalesce((select sum(c.qty) from public.potluck_claims c where c.item_id = i.id), 0))::int
  from public.events e
  join public.families f on f.id = e.family_id
  join public.potluck_items i on i.event_id = e.id
  where e.potluck_relatives
    and e.family_id <> public.current_family_id()
    and public.families_are_linked(e.family_id, public.current_family_id())
    and public.potluck_open(e.id)
  group by e.id, e.title, e.event_date, f.name
  order by e.event_date, e.title
  limit 20
$$;

revoke all on function public.relatives_potlucks() from public, anon;
grant execute on function public.relatives_potlucks() to authenticated;
