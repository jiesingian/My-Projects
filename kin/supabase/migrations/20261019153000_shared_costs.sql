-- Shared costs between linked households (Kin Free, approved 19 October)
-- =====================================================================
--
-- Siblings, each in their own household, sharing a parent's costs: Lola's
-- medicines, her check-ups, the caregiver. A shared pot holds what each
-- household paid, each household's share, and the payments that settle it;
-- the app works out who owes whom from those (lib/shared-costs.ts).
--
-- WHO SEES IT
--
-- The grown-ups (parent, adult) of the households in the pot, and only
-- while their household is still linked with every other household in it.
-- That is the rule family_links has kept since 20260922090000: revoking a
-- link stops the sharing in the same instant, because the policy reads the
-- link rather than a copy. A child in any household sees nothing.
--
-- A household can only be put in a pot with households it is linked to,
-- and every pair in the pot must be linked, so a pot never shows one
-- household's name or money to another it has not agreed to link with.
--
-- NAMES TRAVEL ON THE ROW
--
-- One household cannot read another's families or members rows, so the
-- household's name is written onto its membership by the function that
-- adds it, and the author's name onto each entry by a trigger from the
-- caller's own identity, as family_link_messages does.
--
-- WRITES
--
-- Creating a pot names other households, which a policy cannot check
-- without making families readable across the wall, so it goes through
-- create_shared_pot() (security definer, re-checking the caller first).
-- Shares change through set_shared_pot_share(). Entries are written
-- directly: a household records what it paid, or a payment it made to
-- another household in the pot, as itself; it can take back its own.

create table if not exists public.shared_pots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  created_by_family uuid not null references public.families(id) on delete cascade,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint shared_pots_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint shared_pots_note_length check (note is null or char_length(note) <= 500)
);

create table if not exists public.shared_pot_households (
  pot_id uuid not null references public.shared_pots(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  family_name text not null default '',
  -- A weight, not a percentage: 1 and 1 is half each, 2 and 1 is two
  -- thirds and one third.
  share numeric not null default 1,
  joined_at timestamptz not null default now(),
  primary key (pot_id, family_id),
  constraint shared_pot_households_share_range check (share > 0 and share <= 100)
);

create index if not exists shared_pot_households_family_idx on public.shared_pot_households (family_id);

create table if not exists public.shared_pot_entries (
  id uuid primary key default gen_random_uuid(),
  pot_id uuid not null references public.shared_pots(id) on delete cascade,
  kind text not null,
  -- The household that paid: the cost, or the payment.
  family_id uuid not null references public.families(id) on delete cascade,
  -- A payment's receiving household.
  to_family_id uuid references public.families(id) on delete cascade,
  amount numeric(12, 2) not null,
  description text not null default '',
  spent_on date not null default current_date,
  member_id uuid references public.members(id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now(),
  constraint shared_pot_entries_kind check (kind in ('cost', 'payment')),
  constraint shared_pot_entries_amount check (amount > 0 and amount <= 10000000),
  constraint shared_pot_entries_description_length check (char_length(description) <= 200),
  constraint shared_pot_entries_payment_to check (
    (kind = 'cost' and to_family_id is null)
    or (kind = 'payment' and to_family_id is not null and to_family_id <> family_id)
  )
);

create index if not exists shared_pot_entries_pot_idx on public.shared_pot_entries (pot_id, spent_on desc);

-- May the caller see this pot? A grown-up, of a household in it, still
-- linked with every other household in it. Security definer so the
-- policies below can ask it without reading their own tables (which would
-- recurse) and without reading family_links from one side only.
create or replace function public.shared_pot_open(p_pot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_member_role() in ('parent', 'adult'), false)
    and exists (
      select 1 from public.shared_pot_households h
      where h.pot_id = p_pot and h.family_id = public.current_family_id()
    )
    and not exists (
      select 1 from public.shared_pot_households h
      where h.pot_id = p_pot
        and h.family_id <> public.current_family_id()
        and not public.families_are_linked(h.family_id, public.current_family_id())
    );
$$;

revoke execute on function public.shared_pot_open(uuid) from public, anon;
grant execute on function public.shared_pot_open(uuid) to authenticated;

alter table public.shared_pots enable row level security;
alter table public.shared_pot_households enable row level security;
alter table public.shared_pot_entries enable row level security;

drop policy if exists shared_pots_select on public.shared_pots;
create policy shared_pots_select on public.shared_pots
  for select to authenticated using ((select public.shared_pot_open(id)));

-- The household that made a pot can delete it while nobody else has
-- recorded anything in it -- a mistake, not someone else's history.
drop policy if exists shared_pots_delete on public.shared_pots;
create policy shared_pots_delete on public.shared_pots
  for delete to authenticated using (
    created_by_family = (select public.current_family_id())
    and (select public.shared_pot_open(id))
    and not exists (
      select 1 from public.shared_pot_entries e
      where e.pot_id = shared_pots.id and e.family_id <> (select public.current_family_id())
    )
  );

drop policy if exists shared_pot_households_select on public.shared_pot_households;
create policy shared_pot_households_select on public.shared_pot_households
  for select to authenticated using ((select public.shared_pot_open(pot_id)));

drop policy if exists shared_pot_entries_select on public.shared_pot_entries;
create policy shared_pot_entries_select on public.shared_pot_entries
  for select to authenticated using ((select public.shared_pot_open(pot_id)));

drop policy if exists shared_pot_entries_insert on public.shared_pot_entries;
create policy shared_pot_entries_insert on public.shared_pot_entries
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
    and (select public.shared_pot_open(pot_id))
    and (
      to_family_id is null
      or exists (
        select 1 from public.shared_pot_households h
        where h.pot_id = shared_pot_entries.pot_id and h.family_id = shared_pot_entries.to_family_id
      )
    )
  );

drop policy if exists shared_pot_entries_delete on public.shared_pot_entries;
create policy shared_pot_entries_delete on public.shared_pot_entries
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.shared_pot_open(pot_id))
  );

-- The author's name, from the caller, never from the client. Only assigns;
-- an insert that is not the caller's own is left for the policy to refuse.
create or replace function public.shared_pot_entry_author()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.author_name := coalesce((select m.full_name from public.members m where m.id = public.current_member_id()), '');
  return new;
end;
$$;

drop trigger if exists shared_pot_entries_author on public.shared_pot_entries;
create trigger shared_pot_entries_author
  before insert on public.shared_pot_entries
  for each row execute function public.shared_pot_entry_author();

-- Make a pot with the caller's household and the linked households named.
-- Every pair must be linked; each starts with an equal share.
create or replace function public.create_shared_pot(p_title text, p_note text, p_families uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me_family uuid := public.current_family_id();
  me_member uuid := public.current_member_id();
  everyone uuid[];
  a uuid;
  b uuid;
  pot uuid;
begin
  if me_family is null or coalesce(public.current_member_role() in ('parent', 'adult'), false) is not true then
    raise exception 'shared_pot_grown_up: only a grown-up can start a shared pot';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'shared_pot_title: give the pot a name';
  end if;

  select array_agg(distinct f) into everyone
    from unnest(coalesce(p_families, '{}') || me_family) f
   where f is not null;
  if coalesce(array_length(everyone, 1), 0) < 2 then
    raise exception 'shared_pot_households: choose at least one linked household';
  end if;
  if array_length(everyone, 1) > 8 then
    raise exception 'shared_pot_households: at most eight households';
  end if;

  foreach a in array everyone loop
    foreach b in array everyone loop
      if a < b and not public.families_are_linked(a, b) then
        raise exception 'shared_pot_linked: every household in a pot must be linked with every other';
      end if;
    end loop;
  end loop;

  insert into public.shared_pots (title, note, created_by_family, created_by)
  values (btrim(p_title), nullif(btrim(coalesce(p_note, '')), ''), me_family, me_member)
  returning id into pot;

  insert into public.shared_pot_households (pot_id, family_id, family_name)
  select pot, f.id, coalesce(f.name, '')
    from public.families f
   where f.id = any (everyone);

  return pot;
end;
$$;

revoke execute on function public.create_shared_pot(text, text, uuid[]) from public, anon;
grant execute on function public.create_shared_pot(text, text, uuid[]) to authenticated;

-- Change a household's share. Any grown-up in the pot may; everyone in it
-- sees the result.
create or replace function public.set_shared_pot_share(p_pot uuid, p_family uuid, p_share numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.shared_pot_open(p_pot) then
    raise exception 'shared_pot_open: not a pot you can change';
  end if;
  if p_share is null or p_share <= 0 or p_share > 100 then
    raise exception 'shared_pot_share: a share is more than 0 and at most 100';
  end if;
  update public.shared_pot_households set share = p_share where pot_id = p_pot and family_id = p_family;
  if not found then
    raise exception 'shared_pot_share: that household is not in this pot';
  end if;
end;
$$;

revoke execute on function public.set_shared_pot_share(uuid, uuid, numeric) from public, anon;
grant execute on function public.set_shared_pot_share(uuid, uuid, numeric) to authenticated;
