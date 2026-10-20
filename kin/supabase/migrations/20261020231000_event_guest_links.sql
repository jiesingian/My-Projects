-- Answer from a link, no sign-up: a guest link on an event
-- =========================================================
--
-- A relative who is not on Kin gets a link to one event. In a browser they
-- type their name and can answer Who's coming (20261014090000) with how many
-- they are, take or add a dish on the potluck (20261019233100), and -- when
-- the host attaches one of the household's monito-monita draws
-- (20261019233200) -- put themselves in, and read their own pick once drawn.
--
-- Decided 20 October (Jonathan): name only, event only. A guest sees the
-- event's name, dates and host, how many are coming, and the potluck list.
-- Never the thread, the people asked, the photos, another event, or anything
-- of the household.
--
-- THE LINK
--
-- One per event, made by a grown-up of the host household: 32 random bytes
-- shown once, with only the SHA-256 (base64url, 43 characters) kept here,
-- like "Today in Kin" and "Add to Kin" (20261014202000). Its table has
-- row-level security on with no policies; the only ways in are the functions
-- below. It stops working seven days after the event's last day, in the
-- host's zone, and the host turns it off, or replaces it, whenever they like.
--
-- THE GUESTS
--
-- A guest is a name on an event (event_guests). One row per event and name
-- (case-insensitive), so the same name answering again changes its answer
-- rather than adding a second person, and so a forwarded link cannot fill
-- the list with copies. Their answer and headcount live on that row; their
-- potluck claims and their place in the draw are rows on the existing
-- tables with guest_id set instead of member_id -- so the totals, the
-- locking and the draw treat them like anyone else. The household sees
-- them as "Tita Baby (by link)", and the host's grown-ups can take one off.
--
-- FORWARDING AND SPAM
--
-- Caps: 40 guests per event, a headcount of 1 to 20, 3 dishes added per
-- guest, 60 items per event (the app's own cap), a name of 1 to 40
-- characters with no < > or control characters. Unknown, revoked and
-- expired links all answer the same way: nothing.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- ── the link ──────────────────────────────────────────────────────────────

create table if not exists public.event_guest_links (
  event_id uuid primary key references public.events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[A-Za-z0-9_-]{43}$'),
  -- The household's own monito-monita draw guests may put themselves in.
  draw_id uuid references public.gift_draws(id) on delete set null,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists event_guest_links_family_idx on public.event_guest_links (family_id);
create index if not exists event_guest_links_draw_idx on public.event_guest_links (draw_id);
create index if not exists event_guest_links_created_by_idx on public.event_guest_links (created_by);

alter table public.event_guest_links enable row level security;
revoke all on public.event_guest_links from public, anon, authenticated;

-- ── the guests ────────────────────────────────────────────────────────────

create table if not exists public.event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- The host household.
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  name_key text not null,
  -- The link they came through (its hash), so a row says which link made it.
  token_hash text not null,
  answer text,
  headcount integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_guests_name_shape check (
    char_length(name) between 1 and 40 and name = btrim(name) and name !~ '[<>]' and name !~ '[[:cntrl:]]'
  ),
  constraint event_guests_answer_kind check (answer is null or answer in ('going', 'maybe', 'no')),
  constraint event_guests_headcount_range check (headcount between 1 and 20),
  constraint event_guests_one_name unique (event_id, name_key)
);

create index if not exists event_guests_family_idx on public.event_guests (family_id);

-- A place in a monito-monita draw may be a guest's (the draw section below
-- says how); the column comes first because the policy under it reads it.
alter table public.gift_draw_people alter column member_id drop not null;
alter table public.gift_draw_people add column if not exists guest_id uuid references public.event_guests(id) on delete cascade;
alter table public.gift_draw_people drop constraint if exists gift_draw_people_who;
alter table public.gift_draw_people add constraint gift_draw_people_who check ((member_id is null) <> (guest_id is null));
create unique index if not exists gift_draw_people_guest_once on public.gift_draw_people (draw_id, guest_id) where guest_id is not null;
create index if not exists gift_draw_people_guest_idx on public.gift_draw_people (guest_id);

alter table public.event_guests enable row level security;

-- The host household reads its guests; its grown-ups take one off (not one
-- already drawn in a monito-monita, which would break the loop). Nobody
-- signed in adds or changes one: only the link's functions do.
drop policy if exists event_guests_select on public.event_guests;
create policy event_guests_select on public.event_guests
  for select to authenticated
  using (family_id = (select public.current_family_id()));

drop policy if exists event_guests_delete on public.event_guests;
create policy event_guests_delete on public.event_guests
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and not exists (
      select 1 from public.gift_draw_people p
      join public.gift_draws d on d.id = p.draw_id
      where p.guest_id = event_guests.id and d.drawn_at is not null
    )
  );

grant select, delete on public.event_guests to authenticated;

-- ── guests on the potluck ─────────────────────────────────────────────────

alter table public.potluck_claims alter column member_id drop not null;
alter table public.potluck_claims add column if not exists guest_id uuid references public.event_guests(id) on delete cascade;
alter table public.potluck_claims drop constraint if exists potluck_claims_who;
alter table public.potluck_claims add constraint potluck_claims_who check ((member_id is null) <> (guest_id is null));
create unique index if not exists potluck_claims_one_guest_each on public.potluck_claims (item_id, guest_id) where guest_id is not null;
create index if not exists potluck_claims_guest_idx on public.potluck_claims (guest_id);

alter table public.potluck_items add column if not exists guest_id uuid references public.event_guests(id) on delete set null;
create index if not exists potluck_items_guest_idx on public.potluck_items (guest_id);

-- As before, and an item keeps who added it, guest or member.
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
  new.guest_id := old.guest_id;
  if new.wanted < coalesce((select sum(c.qty) from public.potluck_claims c where c.item_id = new.id), 0) then
    raise exception 'More than that is already claimed.';
  end if;
  return new;
end;
$$;

-- As before for members. A guest's claim is written only by the link's
-- functions (kin.guest says so), in the guest's name, under the host
-- household; the same lock and the same cap as everyone else's.
create or replace function public.potluck_claims_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  taken integer;
  g record;
  guest_event uuid;
begin
  if tg_op = 'UPDATE' then
    if new.item_id is distinct from old.item_id or new.member_id is distinct from old.member_id or new.guest_id is distinct from old.guest_id then
      raise exception 'A claim stays on its item, in its claimer''s name.';
    end if;
    new.event_id := old.event_id;
    new.event_family_id := old.event_family_id;
    new.family_id := old.family_id;
    new.member_name := old.member_name;
    new.household_name := old.household_name;
    new.created_at := old.created_at;
  elsif new.guest_id is not null then
    if coalesce(current_setting('kin.guest', true), '') <> 'yes' then
      raise exception 'A claim is in your own name.';
    end if;
    select e.name, e.family_id, e.event_id into g from public.event_guests e where e.id = new.guest_id;
    if g.name is null then
      raise exception 'That guest is no longer on the list.';
    end if;
    guest_event := g.event_id;
    new.member_id := null;
    new.family_id := g.family_id;
    new.member_name := g.name;
    new.household_name := '';
    new.created_at := now();
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
  if guest_event is not null and item.event_id is distinct from guest_event then
    raise exception 'That item is on another event.';
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

-- ── guests in a monito-monita draw ────────────────────────────────────────


-- As before for members; a guest's row (only the link's functions write
-- one) takes the guest's name and the host household's.
create or replace function public.gift_draw_people_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
begin
  if new.guest_id is not null then
    if coalesce(current_setting('kin.guest', true), '') <> 'yes' then
      raise exception 'Only the household can put people in.';
    end if;
    select e.name, e.family_id into g from public.event_guests e where e.id = new.guest_id;
    if g.name is null then
      raise exception 'That guest is no longer on the list.';
    end if;
    new.member_id := null;
    new.family_id := g.family_id;
    new.added_by := null;
    new.name := g.name;
  else
    new.name := coalesce((select m.full_name from public.members m where m.id = new.member_id), '');
  end if;
  new.household_name := coalesce((select f.name from public.families f where f.id = new.family_id), '');
  new.created_at := now();
  return new;
end;
$$;

-- The draw, as in 20261019233200, counting guests in: a guest has no member
-- row to be active, so the join is outer and the status check applies to
-- members only. Everything else is unchanged.
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
    left join public.members m on m.id = p.member_id
    where p.draw_id = p_draw
      and (p.guest_id is not null or m.status = 'active')
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

-- ── the host's side (signed in) ───────────────────────────────────────────

-- Make, or replace, the link on one of the household's own one-off events
-- that is not over: a grown-up of that household. The key is made and shown
-- by the server; only its hash arrives here. The draw, if named, is the
-- household's own and not yet drawn.
create or replace function public.set_event_guest_link(p_event uuid, p_token_hash text, p_draw uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  fam uuid := public.current_family_id();
  e record;
begin
  if me is null or fam is null or public.current_member_role() not in ('parent', 'adult') then
    raise exception 'Only a grown-up of the household can make a guest link.' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'That link is not the right shape.' using errcode = '22023';
  end if;
  select ev.id, ev.recurs_yearly,
         greatest(ev.event_date, coalesce(ev.end_date, ev.event_date)) >= (now() at time zone public.safe_time_zone(f.time_zone))::date as open
    into e
  from public.events ev join public.families f on f.id = ev.family_id
  where ev.id = p_event and ev.family_id = fam;
  if e.id is null then
    raise exception 'That event is no longer there.';
  end if;
  if coalesce(e.recurs_yearly, false) then
    raise exception 'A guest link is for one day, not a yearly event.';
  end if;
  if not e.open then
    raise exception 'This event is over.';
  end if;
  if p_draw is not null and not exists (select 1 from public.gift_draws d where d.id = p_draw and d.family_id = fam) then
    raise exception 'That draw is not this household''s.';
  end if;
  insert into public.event_guest_links (event_id, family_id, token_hash, draw_id, created_by)
  values (p_event, fam, p_token_hash, p_draw, me)
  on conflict (event_id) do update
    set token_hash = excluded.token_hash, draw_id = excluded.draw_id, created_by = excluded.created_by, created_at = now(), last_used_at = null;
end;
$$;

-- Change which draw the link's guests may join, keeping the link itself.
create or replace function public.set_event_guest_link_draw(p_event uuid, p_draw uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fam uuid := public.current_family_id();
begin
  if fam is null or public.current_member_role() not in ('parent', 'adult') then
    raise exception 'Only a grown-up of the household can change the guest link.' using errcode = '42501';
  end if;
  if p_draw is not null and not exists (select 1 from public.gift_draws d where d.id = p_draw and d.family_id = fam) then
    raise exception 'That draw is not this household''s.';
  end if;
  update public.event_guest_links set draw_id = p_draw where event_id = p_event and family_id = fam;
  if not found then
    raise exception 'This event has no guest link.';
  end if;
end;
$$;

create or replace function public.clear_event_guest_link(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_member_role() not in ('parent', 'adult') then
    raise exception 'Only a grown-up of the household can turn the guest link off.' using errcode = '42501';
  end if;
  delete from public.event_guest_links where event_id = p_event and family_id = public.current_family_id();
end;
$$;

-- Whether one of the household's events has a link on, and which draw it
-- names. Never the hash. No row when there is none.
create or replace function public.event_guest_link(p_event uuid)
returns table (draw_id uuid, created_at timestamptz, last_used_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.draw_id, l.created_at, l.last_used_at
  from public.event_guest_links l
  where l.event_id = p_event and l.family_id = public.current_family_id()
$$;

revoke all on function public.set_event_guest_link(uuid, text, uuid) from public, anon;
revoke all on function public.set_event_guest_link_draw(uuid, uuid) from public, anon;
revoke all on function public.clear_event_guest_link(uuid) from public, anon;
revoke all on function public.event_guest_link(uuid) from public, anon;
grant execute on function public.set_event_guest_link(uuid, text, uuid) to authenticated;
grant execute on function public.set_event_guest_link_draw(uuid, uuid) to authenticated;
grant execute on function public.clear_event_guest_link(uuid) to authenticated;
grant execute on function public.event_guest_link(uuid) to authenticated;

-- ── the guest's side (no session; the link is the key) ────────────────────

-- The link's event, while the link is live: a one-off event whose last day
-- is at most seven days gone in the host's zone. One row, or none -- the
-- same nothing for a wrong key, a turned-off one and an expired one.
create or replace function public.guest_link_live(p_token_hash text)
returns table (event_id uuid, family_id uuid, draw_id uuid, title text, event_date date, end_date date, host_name text, open boolean, today date)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.family_id, l.draw_id, e.title, e.event_date, e.end_date, f.name,
         greatest(e.event_date, coalesce(e.end_date, e.event_date)) >= (now() at time zone public.safe_time_zone(f.time_zone))::date,
         (now() at time zone public.safe_time_zone(f.time_zone))::date
  from public.event_guest_links l
  join public.events e on e.id = l.event_id and e.family_id = l.family_id
  join public.families f on f.id = e.family_id
  where p_token_hash is not null
    and p_token_hash ~ '^[A-Za-z0-9_-]{43}$'
    and l.token_hash = p_token_hash
    and not coalesce(e.recurs_yearly, false)
    and greatest(e.event_date, coalesce(e.end_date, e.event_date)) + 7 >= (now() at time zone public.safe_time_zone(f.time_zone))::date
$$;

revoke all on function public.guest_link_live(text) from public, anon, authenticated;

-- What a guest sees of the event: its name, dates and host, whether answers
-- are still open, how many are coming (members and guests, headcounts in),
-- and the draw they may join, if any. Nothing else of the household.
create or replace function public.guest_event(p_token_hash text)
returns table (
  title text, event_date date, end_date date, host_name text, open boolean, coming integer, guests integer,
  draw_id uuid, draw_title text, draw_exchange_date date, draw_price_cap numeric, draw_currency text, draw_drawn boolean, draw_open boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.title, v.event_date, v.end_date, v.host_name, v.open,
         (
           (select count(*)::int from public.event_rsvps r where r.event_id = v.event_id and r.answer = 'going')
           + (select coalesce(sum(g.headcount), 0)::int from public.event_guests g where g.event_id = v.event_id and g.answer = 'going')
         ),
         (select count(*)::int from public.event_guests g where g.event_id = v.event_id),
         d.id, d.title, d.exchange_date, d.price_cap, d.currency, d.drawn_at is not null,
         d.id is not null and d.drawn_at is null and d.exchange_date >= v.today
  from public.guest_link_live(p_token_hash) v
  left join public.gift_draws d on d.id = v.draw_id and d.family_id = v.family_id
$$;

-- The potluck list as a guest sees it: what is wanted and how much is
-- taken, no names.
create or replace function public.guest_potluck(p_token_hash text)
returns table (item_id uuid, label text, wanted integer, taken integer, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.label, i.wanted,
         coalesce((select sum(c.qty) from public.potluck_claims c where c.item_id = i.id), 0)::int,
         i.position
  from public.guest_link_live(p_token_hash) v
  join public.potluck_items i on i.event_id = v.event_id
  order by i.position, i.label
$$;

revoke all on function public.guest_event(text) from public;
revoke all on function public.guest_potluck(text) from public;
grant execute on function public.guest_event(text) to anon, authenticated;
grant execute on function public.guest_potluck(text) to anon, authenticated;

-- A guest's name, cleaned: spaces collapsed, trimmed, 1 to 40 characters,
-- no < > and no control characters. Null when nothing usable is left.
create or replace function public.guest_clean_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when n = '' or char_length(n) > 40 or n ~ '[<>]' or n ~ '[[:cntrl:]]' then null
    else n
  end
  from (select btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')) as n) x
$$;

revoke all on function public.guest_clean_name(text) from public, anon, authenticated;

-- The guest's own row on the link's event, made on first use (40 per event
-- at most). Raises in plain words when the link is dead or the name won't do.
create or replace function public.guest_row(p_token_hash text, p_name text, p_make boolean)
returns public.event_guests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  n text := public.guest_clean_name(p_name);
  g public.event_guests;
begin
  select * into v from public.guest_link_live(p_token_hash);
  if v.event_id is null then
    raise exception 'This link isn''t working any more.' using errcode = 'P0002';
  end if;
  if n is null then
    raise exception 'Write your name first: up to 40 letters, nothing fancy.';
  end if;
  select * into g from public.event_guests e where e.event_id = v.event_id and e.name_key = lower(n);
  if g.id is null and p_make then
    if (select count(*) from public.event_guests e where e.event_id = v.event_id) >= 40 then
      raise exception 'This event''s guest list is full (40 by link). Ask the host to add you.';
    end if;
    insert into public.event_guests (event_id, family_id, name, name_key, token_hash)
    values (v.event_id, v.family_id, n, lower(n), p_token_hash)
    returning * into g;
  elsif g.id is not null then
    update public.event_guests set token_hash = p_token_hash, updated_at = now() where id = g.id;
  end if;
  update public.event_guest_links set last_used_at = now() where event_id = v.event_id;
  return g;
end;
$$;

revoke all on function public.guest_row(text, text, boolean) from public, anon, authenticated;

-- What the guest themselves has said: their answer and headcount, their
-- claims by item, how many dishes they added, whether they are in the
-- draw, and their pick once drawn (the one they picked, with that
-- person's wish list -- what the draw shows anyone who drew someone).
create or replace function public.guest_state(p_guest public.event_guests, p_draw uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', p_guest.name,
    'answer', p_guest.answer,
    'headcount', p_guest.headcount,
    'claims', coalesce((select jsonb_object_agg(c.item_id, c.qty) from public.potluck_claims c where c.guest_id = p_guest.id), '{}'::jsonb),
    'dishes', (select count(*) from public.potluck_items i where i.guest_id = p_guest.id),
    'in_draw', exists (select 1 from public.gift_draw_people p where p.guest_id = p_guest.id and p.draw_id = p_draw),
    'pick', (
      select jsonb_build_object(
        'name', r.name,
        'household', r.household_name,
        'wishes', coalesce((select jsonb_agg(w.body order by w.created_at) from public.gift_draw_wishes w where w.person_id = r.id), '[]'::jsonb)
      )
      from public.gift_draw_people p
      join public.gift_draw_picks k on k.draw_id = p.draw_id and k.giver_id = p.id
      join public.gift_draw_people r on r.id = k.receiver_id
      where p.guest_id = p_guest.id and p.draw_id = p_draw
    )
  )
$$;

revoke all on function public.guest_state(public.event_guests, uuid) from public, anon, authenticated;

-- "It's me": the guest's own state by name, without changing anything.
-- Null when that name has not answered yet.
create or replace function public.guest_hello(p_token_hash text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.event_guests := public.guest_row(p_token_hash, p_name, false);
begin
  if g.id is null then
    return null;
  end if;
  return public.guest_state(g, (select l.draw_id from public.event_guest_links l where l.event_id = g.event_id));
end;
$$;

-- Who's coming, by link: Going, Maybe or Can't go with how many they are
-- (1 to 20); null takes the answer back. Open through the event's last day.
create or replace function public.guest_answer(p_token_hash text, p_name text, p_answer text, p_headcount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.event_guests;
  v record;
begin
  if p_answer is not null and p_answer not in ('going', 'maybe', 'no') then
    raise exception 'Choose Going, Maybe or Can''t go.';
  end if;
  if p_answer is not null and (p_headcount is null or p_headcount < 1 or p_headcount > 20) then
    raise exception 'How many of you are coming? 1 to 20.';
  end if;
  select * into v from public.guest_link_live(p_token_hash);
  if v.event_id is not null and not v.open then
    raise exception 'Answers are closed: the event is over.';
  end if;
  g := public.guest_row(p_token_hash, p_name, p_answer is not null);
  if g.id is null then
    return null;
  end if;
  update public.event_guests
    set answer = p_answer, headcount = case when p_answer is null then 1 else p_headcount end, updated_at = now()
    where id = g.id
    returning * into g;
  return public.guest_state(g, v.draw_id);
end;
$$;

-- Bring `p_qty` of an item (0 takes the claim back), in the guest's name;
-- the trigger holds the item's cap and lock.
create or replace function public.guest_claim(p_token_hash text, p_name text, p_item uuid, p_qty integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.event_guests;
  v record;
  existing uuid;
begin
  if p_qty is null or p_qty < 0 or p_qty > 50 then
    raise exception 'Choose how many you''ll bring.';
  end if;
  select * into v from public.guest_link_live(p_token_hash);
  if v.event_id is not null and not v.open then
    raise exception 'This potluck is closed: the event is over.';
  end if;
  g := public.guest_row(p_token_hash, p_name, p_qty > 0);
  if g.id is null then
    return null;
  end if;
  if not exists (select 1 from public.potluck_items i where i.id = p_item and i.event_id = g.event_id) then
    raise exception 'That item is no longer on the list.';
  end if;
  select c.id into existing from public.potluck_claims c where c.item_id = p_item and c.guest_id = g.id;
  perform set_config('kin.guest', 'yes', true);
  if p_qty = 0 then
    delete from public.potluck_claims c where c.id = existing;
  elsif existing is not null then
    update public.potluck_claims c set qty = p_qty where c.id = existing;
  else
    insert into public.potluck_claims (item_id, event_id, event_family_id, guest_id, family_id, qty)
    values (p_item, g.event_id, g.family_id, g.id, g.family_id, p_qty);
  end if;
  perform set_config('kin.guest', '', true);
  return public.guest_state(g, v.draw_id);
end;
$$;

-- Add a dish of one's own ("Leche flan x2") and bring all of it: at most 3
-- per guest, 60 items on the event like the app's own cap.
create or replace function public.guest_add_dish(p_token_hash text, p_name text, p_label text, p_wanted integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.event_guests;
  v record;
  label text := btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g'));
  item uuid;
  n integer;
begin
  if label = '' or char_length(label) > 80 or label ~ '[<>]' or label ~ '[[:cntrl:]]' then
    raise exception 'Write what you''ll bring, like "Leche flan x2".';
  end if;
  if p_wanted is null or p_wanted < 1 or p_wanted > 50 then
    raise exception 'How many? 1 to 50.';
  end if;
  select * into v from public.guest_link_live(p_token_hash);
  if v.event_id is not null and not v.open then
    raise exception 'This potluck is closed: the event is over.';
  end if;
  g := public.guest_row(p_token_hash, p_name, true);
  if (select count(*) from public.potluck_items i where i.guest_id = g.id) >= 3 then
    raise exception 'Three dishes of your own is plenty. Ask the host to list more.';
  end if;
  select count(*) into n from public.potluck_items i where i.event_id = g.event_id;
  if n >= 60 then
    raise exception 'That''s a long list already: 60 things at most.';
  end if;
  insert into public.potluck_items (event_id, family_id, label, wanted, position, guest_id)
  values (g.event_id, g.family_id, label, p_wanted, n, g.id)
  returning id into item;
  perform set_config('kin.guest', 'yes', true);
  insert into public.potluck_claims (item_id, event_id, event_family_id, guest_id, family_id, qty)
  values (item, g.event_id, g.family_id, g.id, g.family_id, p_wanted);
  perform set_config('kin.guest', '', true);
  return public.guest_state(g, v.draw_id);
end;
$$;

-- In or out of the link's draw, before it is drawn and before the day.
create or replace function public.guest_join_draw(p_token_hash text, p_name text, p_in boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.event_guests;
  v record;
  d record;
begin
  select * into v from public.guest_link_live(p_token_hash);
  g := public.guest_row(p_token_hash, p_name, coalesce(p_in, false));
  if g.id is null then
    return null;
  end if;
  select * into d from public.gift_draws x where x.id = v.draw_id and x.family_id = v.family_id;
  if d.id is null then
    raise exception 'This event has no gift draw to join.';
  end if;
  if d.drawn_at is not null then
    raise exception 'The names are drawn already.';
  end if;
  if d.exchange_date < v.today then
    raise exception 'The exchange day has passed.';
  end if;
  perform set_config('kin.guest', 'yes', true);
  if coalesce(p_in, false) then
    insert into public.gift_draw_people (draw_id, guest_id, family_id)
    values (d.id, g.id, g.family_id)
    on conflict do nothing;
  else
    delete from public.gift_draw_people p where p.draw_id = d.id and p.guest_id = g.id;
  end if;
  perform set_config('kin.guest', '', true);
  return public.guest_state(g, v.draw_id);
end;
$$;

revoke all on function public.guest_hello(text, text) from public;
revoke all on function public.guest_answer(text, text, text, integer) from public;
revoke all on function public.guest_claim(text, text, uuid, integer) from public;
revoke all on function public.guest_add_dish(text, text, text, integer) from public;
revoke all on function public.guest_join_draw(text, text, boolean) from public;
grant execute on function public.guest_hello(text, text) to anon, authenticated;
grant execute on function public.guest_answer(text, text, text, integer) to anon, authenticated;
grant execute on function public.guest_claim(text, text, uuid, integer) to anon, authenticated;
grant execute on function public.guest_add_dish(text, text, text, integer) to anon, authenticated;
grant execute on function public.guest_join_draw(text, text, boolean) to anon, authenticated;
