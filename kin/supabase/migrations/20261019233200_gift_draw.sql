-- Monito-monita: a gift draw across the household and linked households
-- =====================================================================
--
-- A grown-up starts a draw (a name, a price cap, the exchange date, whether
-- nobody may pick someone from their own household, whether to show who
-- picked whom on the day) and asks linked households in. Each household's
-- grown-ups put their own people in (managed children included); a teen may
-- put themselves in. Then the organizing household's grown-up draws.
--
-- The draw itself runs here (draw_gift_draw), so nobody -- the organizer
-- included -- ever reads more than their own pick:
--   * gift_draw_picks: one row per giver. Read by the giver, by a grown-up
--     of the giver's household when the giver is a managed child (no login
--     of their own), and, when the draw reveals on the day, by everyone in
--     the draw from the exchange date.
--   * gift_draw_wishes: each person's wish list. Read by its owner (and
--     their household's grown-ups for a managed child) and by whoever drew
--     them -- never by anyone else.
--
-- Nobody draws themselves. The picks make one loop through everyone, so
-- nobody's pick says anything about anybody else's. With "not their own
-- household", the loop never passes between two people of one household;
-- that needs no household to be more than half of the draw.
--
-- Names across households travel on the row (gift_draw_people.name and
-- household_name, set by a trigger), never by reading another household's
-- members.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.gift_draws (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null default 'Monito-monita',
  price_cap numeric(12, 2),
  currency text not null default 'PHP',
  exchange_date date not null,
  not_own_household boolean not null default false,
  reveal_on_day boolean not null default false,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  drawn_at timestamptz,
  constraint gift_draws_title_length check (char_length(btrim(title)) between 1 and 80),
  constraint gift_draws_price_cap_range check (price_cap is null or (price_cap > 0 and price_cap <= 1000000))
);

create index if not exists gift_draws_family_idx on public.gift_draws (family_id);
create index if not exists gift_draws_created_by_idx on public.gift_draws (created_by);

-- The households asked in, besides the organizer's own.
create table if not exists public.gift_draw_households (
  draw_id uuid not null references public.gift_draws(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  household_name text not null default '',
  primary key (draw_id, family_id)
);

create index if not exists gift_draw_households_family_idx on public.gift_draw_households (family_id);

create table if not exists public.gift_draw_people (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.gift_draws(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null default '',
  household_name text not null default '',
  added_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint gift_draw_people_once unique (draw_id, member_id)
);

create index if not exists gift_draw_people_member_idx on public.gift_draw_people (member_id);
create index if not exists gift_draw_people_family_idx on public.gift_draw_people (family_id);
create index if not exists gift_draw_people_added_by_idx on public.gift_draw_people (added_by);

create table if not exists public.gift_draw_picks (
  draw_id uuid not null references public.gift_draws(id) on delete cascade,
  giver_id uuid not null references public.gift_draw_people(id) on delete cascade,
  receiver_id uuid not null references public.gift_draw_people(id) on delete cascade,
  primary key (draw_id, giver_id),
  constraint gift_draw_picks_receiver_once unique (draw_id, receiver_id),
  constraint gift_draw_picks_not_self check (giver_id <> receiver_id)
);

create index if not exists gift_draw_picks_receiver_idx on public.gift_draw_picks (receiver_id);

create table if not exists public.gift_draw_wishes (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.gift_draws(id) on delete cascade,
  person_id uuid not null references public.gift_draw_people(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint gift_draw_wishes_body_length check (char_length(btrim(body)) between 1 and 200)
);

create index if not exists gift_draw_wishes_person_idx on public.gift_draw_wishes (person_id, created_at);
create index if not exists gift_draw_wishes_draw_idx on public.gift_draw_wishes (draw_id);

-- ── helpers (definer: they read across households so the policies need not) ──

-- Is the caller's household in this draw: the organizer's, or one asked in
-- that is still linked to it.
create or replace function public.gift_draw_member(p_draw uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gift_draws d
    where d.id = p_draw
      and (
        d.family_id = public.current_family_id()
        or (
          exists (select 1 from public.gift_draw_households h where h.draw_id = d.id and h.family_id = public.current_family_id())
          and public.families_are_linked(d.family_id, public.current_family_id())
        )
      )
  )
$$;

revoke all on function public.gift_draw_member(uuid) from public, anon;
grant execute on function public.gift_draw_member(uuid) to authenticated;

-- May the caller act for this person in the draw: it is them, or they are a
-- grown-up of the person's own household and the person is a managed child.
create or replace function public.gift_draw_speaks_for(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gift_draw_people p
    join public.members m on m.id = p.member_id
    where p.id = p_person
      and (
        p.member_id = public.current_member_id()
        or (
          m.role = 'child_managed'
          and m.family_id = public.current_family_id()
          and public.current_member_role() in ('parent', 'adult')
        )
      )
  )
$$;

revoke all on function public.gift_draw_speaks_for(uuid) from public, anon;
grant execute on function public.gift_draw_speaks_for(uuid) to authenticated;

-- Did the caller (or a managed child they speak for) draw this person?
create or replace function public.gift_draw_drew(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gift_draw_picks k
    where k.receiver_id = p_person and public.gift_draw_speaks_for(k.giver_id)
  )
$$;

revoke all on function public.gift_draw_drew(uuid) from public, anon;
grant execute on function public.gift_draw_drew(uuid) to authenticated;

-- Has this draw's exchange day come, in the organizer's own zone, with
-- reveal on the day turned on?
create or replace function public.gift_draw_revealed(p_draw uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gift_draws d
    join public.families f on f.id = d.family_id
    where d.id = p_draw
      and d.reveal_on_day
      and d.exchange_date <= (now() at time zone public.safe_time_zone(f.time_zone))::date
  )
$$;

revoke all on function public.gift_draw_revealed(uuid) from public, anon;
grant execute on function public.gift_draw_revealed(uuid) to authenticated;

-- ── draws ────────────────────────────────────────────────────────────────

alter table public.gift_draws enable row level security;

drop policy if exists gift_draws_select on public.gift_draws;
create policy gift_draws_select on public.gift_draws
  for select to authenticated
  -- The first half reads the row itself, so a draw just inserted can be
  -- returned to its maker (the helper's snapshot cannot see it yet).
  using (family_id = (select public.current_family_id()) or public.gift_draw_member(id));

drop policy if exists gift_draws_insert on public.gift_draws;
create policy gift_draws_insert on public.gift_draws
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and drawn_at is null
  );

-- The organizer household's grown-ups change the details until the draw;
-- drawn_at is set only by draw_gift_draw (a trigger keeps it).
drop policy if exists gift_draws_update on public.gift_draws;
create policy gift_draws_update on public.gift_draws
  for update to authenticated
  using (family_id = (select public.current_family_id()) and (select public.current_member_role()) in ('parent', 'adult'))
  with check (family_id = (select public.current_family_id()));

drop policy if exists gift_draws_delete on public.gift_draws;
create policy gift_draws_delete on public.gift_draws
  for delete to authenticated
  using (family_id = (select public.current_family_id()) and (select public.current_member_role()) in ('parent', 'adult'));

grant select, insert, update, delete on public.gift_draws to authenticated;

create or replace function public.gift_draws_fixed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.family_id is distinct from old.family_id or new.created_by is distinct from old.created_by then
    raise exception 'A draw stays with its household.';
  end if;
  -- Only draw_gift_draw sets or clears drawn_at (it says so in kin.drawing).
  if new.drawn_at is distinct from old.drawn_at and coalesce(current_setting('kin.drawing', true), '') <> 'yes' then
    new.drawn_at := old.drawn_at;
  end if;
  -- After the draw, who avoids whom is settled.
  if old.drawn_at is not null and new.not_own_household is distinct from old.not_own_household then
    raise exception 'The draw is done; draw again to change that.';
  end if;
  return new;
end;
$$;

drop trigger if exists gift_draws_fixed on public.gift_draws;
create trigger gift_draws_fixed before update on public.gift_draws
  for each row execute function public.gift_draws_fixed();

-- ── households asked in ───────────────────────────────────────────────────

alter table public.gift_draw_households enable row level security;

drop policy if exists gift_draw_households_select on public.gift_draw_households;
create policy gift_draw_households_select on public.gift_draw_households
  for select to authenticated
  using (public.gift_draw_member(draw_id));

-- The organizer's grown-ups ask a linked household in, before the draw.
drop policy if exists gift_draw_households_insert on public.gift_draw_households;
create policy gift_draw_households_insert on public.gift_draw_households
  for insert to authenticated
  with check (
    (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.gift_draws d where d.id = draw_id and d.family_id = (select public.current_family_id()) and d.drawn_at is null)
    and family_id <> (select public.current_family_id())
    and public.families_are_linked(family_id, (select public.current_family_id()))
  );

-- The organizer takes a household out, or that household leaves; before
-- the draw. Its people go with it.
drop policy if exists gift_draw_households_delete on public.gift_draw_households;
create policy gift_draw_households_delete on public.gift_draw_households
  for delete to authenticated
  using (
    (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.gift_draws d where d.id = draw_id and d.drawn_at is null and d.family_id = (select public.current_family_id()))
    or (
      family_id = (select public.current_family_id())
      and (select public.current_member_role()) in ('parent', 'adult')
      and exists (select 1 from public.gift_draws d where d.id = draw_id and d.drawn_at is null)
    )
  );

grant select, insert, delete on public.gift_draw_households to authenticated;

create or replace function public.gift_draw_households_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.gift_draw_people p where p.draw_id = old.draw_id and p.family_id = old.family_id;
    return old;
  end if;
  new.household_name := coalesce((select f.name from public.families f where f.id = new.family_id), '');
  return new;
end;
$$;

revoke all on function public.gift_draw_households_fill() from public;

drop trigger if exists gift_draw_households_fill on public.gift_draw_households;
create trigger gift_draw_households_fill before insert on public.gift_draw_households
  for each row execute function public.gift_draw_households_fill();

drop trigger if exists gift_draw_households_leave on public.gift_draw_households;
create trigger gift_draw_households_leave after delete on public.gift_draw_households
  for each row execute function public.gift_draw_households_fill();

-- ── people ───────────────────────────────────────────────────────────────

alter table public.gift_draw_people enable row level security;

drop policy if exists gift_draw_people_select on public.gift_draw_people;
create policy gift_draw_people_select on public.gift_draw_people
  for select to authenticated
  using (public.gift_draw_member(draw_id));

-- Each household puts in its own people, before the draw: a grown-up anyone
-- active in it, a teen with a login only themselves.
drop policy if exists gift_draw_people_insert on public.gift_draw_people;
create policy gift_draw_people_insert on public.gift_draw_people
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and added_by = (select public.current_member_id())
    and public.gift_draw_member(draw_id)
    and exists (select 1 from public.gift_draws d where d.id = draw_id and d.drawn_at is null)
    and exists (
      select 1 from public.members m
      where m.id = member_id
        and m.family_id = (select public.current_family_id())
        and m.status = 'active'
        and (m.id = (select public.current_member_id()) or (select public.current_member_role()) in ('parent', 'adult'))
    )
  );

-- Taken out before the draw by themselves or their household's grown-ups.
drop policy if exists gift_draw_people_delete on public.gift_draw_people;
create policy gift_draw_people_delete on public.gift_draw_people
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (member_id = (select public.current_member_id()) or (select public.current_member_role()) in ('parent', 'adult'))
    and exists (select 1 from public.gift_draws d where d.id = draw_id and d.drawn_at is null)
  );

grant select, insert, delete on public.gift_draw_people to authenticated;

create or replace function public.gift_draw_people_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := coalesce((select m.full_name from public.members m where m.id = new.member_id), '');
  new.household_name := coalesce((select f.name from public.families f where f.id = new.family_id), '');
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.gift_draw_people_fill() from public;

drop trigger if exists gift_draw_people_fill on public.gift_draw_people;
create trigger gift_draw_people_fill before insert on public.gift_draw_people
  for each row execute function public.gift_draw_people_fill();

-- ── picks: written only by draw_gift_draw ────────────────────────────────

alter table public.gift_draw_picks enable row level security;

drop policy if exists gift_draw_picks_select on public.gift_draw_picks;
create policy gift_draw_picks_select on public.gift_draw_picks
  for select to authenticated
  using (
    public.gift_draw_speaks_for(giver_id)
    or (public.gift_draw_revealed(draw_id) and public.gift_draw_member(draw_id))
  );

grant select on public.gift_draw_picks to authenticated;

-- ── wishes ───────────────────────────────────────────────────────────────

alter table public.gift_draw_wishes enable row level security;

drop policy if exists gift_draw_wishes_select on public.gift_draw_wishes;
create policy gift_draw_wishes_select on public.gift_draw_wishes
  for select to authenticated
  using (public.gift_draw_speaks_for(person_id) or public.gift_draw_drew(person_id));

drop policy if exists gift_draw_wishes_insert on public.gift_draw_wishes;
create policy gift_draw_wishes_insert on public.gift_draw_wishes
  for insert to authenticated
  with check (
    public.gift_draw_speaks_for(person_id)
    and exists (select 1 from public.gift_draw_people p where p.id = person_id and p.draw_id = gift_draw_wishes.draw_id)
  );

drop policy if exists gift_draw_wishes_update on public.gift_draw_wishes;
create policy gift_draw_wishes_update on public.gift_draw_wishes
  for update to authenticated
  using (public.gift_draw_speaks_for(person_id))
  with check (
    public.gift_draw_speaks_for(person_id)
    and exists (select 1 from public.gift_draw_people p where p.id = person_id and p.draw_id = gift_draw_wishes.draw_id)
  );

drop policy if exists gift_draw_wishes_delete on public.gift_draw_wishes;
create policy gift_draw_wishes_delete on public.gift_draw_wishes
  for delete to authenticated
  using (public.gift_draw_speaks_for(person_id));

grant select, insert, update, delete on public.gift_draw_wishes to authenticated;

-- ── the draw ─────────────────────────────────────────────────────────────

-- Draws (or draws again) for one draw: the organizer household's grown-ups
-- only, with at least three people in. One loop through everyone in a
-- random order; with not_own_household, an order in which no two people of
-- one household are next to each other (the biggest household's people on
-- every other place first), found on the first try whenever one exists.
-- Returns how many were drawn.
create or replace function public.draw_gift_draw(p_draw uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d record;
  ids uuid[];
  fams uuid[];
  n integer;
  biggest integer;
  ordered uuid[];
  slots uuid[];
  slot_fams uuid[];
  i integer;
begin
  select * into d from public.gift_draws g where g.id = p_draw for update;
  if d.id is null or d.family_id is distinct from public.current_family_id() or public.current_member_role() not in ('parent', 'adult') then
    raise exception 'Only a grown-up of the household that started the draw can draw.';
  end if;
  if d.exchange_date < (now() at time zone public.safe_time_zone((select f.time_zone from public.families f where f.id = d.family_id)))::date then
    raise exception 'The exchange day has passed.';
  end if;

  -- People still in: their household is the organizer's or still asked and linked.
  select array_agg(p.id order by p.r), array_agg(p.family_id order by p.r)
    into ids, fams
  from (
    select p.id, p.family_id, random() as r
    from public.gift_draw_people p
    join public.members m on m.id = p.member_id and m.status = 'active'
    where p.draw_id = p_draw
      and (
        p.family_id = d.family_id
        or (
          exists (select 1 from public.gift_draw_households h where h.draw_id = p_draw and h.family_id = p.family_id)
          and public.families_are_linked(d.family_id, p.family_id)
        )
      )
  ) p;
  n := coalesce(array_length(ids, 1), 0);
  if n < 3 then
    raise exception 'A draw needs at least three people in.';
  end if;

  if d.not_own_household then
    select max(c) into biggest from (select count(*) as c from unnest(fams) f group by f) x;
    if biggest * 2 > n then
      raise exception 'One household is more than half the draw, so someone would pick their own. Turn off "not their own household" or ask more people in.';
    end if;
    -- Biggest households first, a random order among equals and within each;
    -- then every other place first (1, 3, 5...), then the places between.
    -- With no household over half, no two neighbours in the loop share one
    -- (checked below all the same).
    select array_agg(x.id order by x.size desc, x.fr, x.r), array_agg(x.family_id order by x.size desc, x.fr, x.r)
      into ordered, slot_fams
    from (
      select u.id, u.family_id, count(*) over (partition by u.family_id) as size,
             max(u.gr) over (partition by u.family_id) as fr, random() as r
      from (select v.id, v.family_id, random() as gr from unnest(ids, fams) as v(id, family_id)) u
    ) x;
    slots := array_fill(null::uuid, array[n]);
    fams := array_fill(null::uuid, array[n]);
    for i in 1..n loop
      if i <= (n + 1) / 2 then
        slots[2 * i - 1] := ordered[i];
        fams[2 * i - 1] := slot_fams[i];
      else
        slots[2 * (i - (n + 1) / 2)] := ordered[i];
        fams[2 * (i - (n + 1) / 2)] := slot_fams[i];
      end if;
    end loop;
    for i in 1..n loop
      if fams[i] = fams[(i % n) + 1] then
        raise exception 'Kin could not keep households apart in this draw. Turn off "not their own household" and draw again.';
      end if;
    end loop;
    ids := slots;
  end if;

  delete from public.gift_draw_picks k where k.draw_id = p_draw;
  insert into public.gift_draw_picks (draw_id, giver_id, receiver_id)
  select p_draw, ids[g.k], ids[(g.k % n) + 1] from generate_series(1, n) as g(k);

  perform set_config('kin.drawing', 'yes', true);
  update public.gift_draws g set drawn_at = now() where g.id = p_draw;
  perform set_config('kin.drawing', '', true);
  return n;
end;
$$;

revoke all on function public.draw_gift_draw(uuid) from public, anon;
grant execute on function public.draw_gift_draw(uuid) to authenticated;

-- Linked households' draws the caller's household is asked to, for the
-- Planner: the draw's own row is visible through gift_draw_member already;
-- this only adds whether anyone of ours is in yet.
create or replace function public.my_gift_draws()
returns table (draw_id uuid, title text, exchange_date date, host_name text, mine boolean, drawn boolean, people integer, ours integer)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.title, d.exchange_date, f.name, d.family_id = public.current_family_id(), d.drawn_at is not null,
         (select count(*)::int from public.gift_draw_people p where p.draw_id = d.id),
         (select count(*)::int from public.gift_draw_people p where p.draw_id = d.id and p.family_id = public.current_family_id())
  from public.gift_draws d
  join public.families f on f.id = d.family_id
  where public.gift_draw_member(d.id)
    and d.exchange_date >= (now() at time zone 'Asia/Manila')::date - 30
  order by d.exchange_date, d.title
  limit 20
$$;

revoke all on function public.my_gift_draws() from public, anon;
grant execute on function public.my_gift_draws() to authenticated;
