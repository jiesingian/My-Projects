-- "Hey Siri, add rice to Kin" (14 October): a private link per member that an
-- iPhone Shortcut sends spoken words to, and that puts them on the household's
-- shopping list. The Shortcut asks "What do you need?", posts the answer here
-- through api/list-add, and speaks back what was added.
--
-- Built like "Today in Kin" (20260928120000_today_brief.sql): a Shortcut
-- carries no Kin session, so the link is the key -- 32 random bytes shown
-- once, with only the SHA-256 (base64url, 43 characters) kept here. But it is
-- a SEPARATE key on purpose. The brief link only reads; this one writes. A
-- read link that leaked must never be able to add to anybody's list, so the
-- two are made, replaced and turned off independently.
--
-- The keys live in their own table rather than on members, because members
-- is readable by the whole household and editable by more than one person.
-- Row-level security is on with no policies, and the only ways in are the
-- four functions below, the way Apple Health's keys work
-- (20260926100000_apple_health_import.sql).
--
-- WHO MAY ADD
--
-- Anyone in the household may add to the list in the app, children in kid
-- view included (buy_items' policy is the household, nothing narrower). The
-- link follows that: any member with their own login can make one, and it
-- adds for them and only them -- to their own household, with them as the
-- one who added it. The caller never names a household or a member. A member
-- who leaves, or moves to another household, finds the link stops working.
--
-- LIMITS
--
-- At most 20 items per send, each name at most 150 characters (what the app
-- allows), a sane quantity and a short unit. The app splits the words and
-- sends at most 500 characters' worth; this function does not trust that.
-- Lists are Kin Free, so there is no Plus check.

create table if not exists public.list_add_tokens (
  member_id uuid primary key references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists list_add_tokens_family_idx on public.list_add_tokens (family_id);

alter table public.list_add_tokens enable row level security;
revoke all on public.list_add_tokens from public, anon, authenticated;

-- Make (or replace) the caller's own link. The key is made and shown by the
-- server; only its hash arrives here.
create or replace function public.set_list_add_token(p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  fam uuid;
begin
  -- The household of that same member row, read from it rather than asked
  -- for separately, so the two can never come from different rows.
  select m.family_id into fam from public.members m where m.id = me;
  if me is null or fam is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'That link is not the right shape.' using errcode = '22023';
  end if;
  insert into public.list_add_tokens (member_id, family_id, token_hash)
  values (me, fam, p_token_hash)
  on conflict (member_id) do update
    set token_hash = excluded.token_hash, family_id = excluded.family_id, created_at = now(), last_used_at = null;
end;
$$;

create or replace function public.clear_list_add_token()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.list_add_tokens where member_id = public.current_member_id();
$$;

-- Whether the caller has a link on. Never the hash.
create or replace function public.list_add_link_on()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.list_add_tokens where member_id = public.current_member_id());
$$;

-- The Shortcut's way in. Returns how many items were added, or -1 for a key
-- that is not (or no longer) anybody's -- the same answer for a wrong key, a
-- malformed one and a turned-off one, so it says nothing about which exist.
create or replace function public.add_to_list_by_link(p_token_hash text, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.list_add_tokens;
  s jsonb;
  item_name text;
  qty numeric;
  item_unit text;
  item_section text;
  saved integer := 0;
begin
  if p_token_hash is null or p_token_hash !~ '^[A-Za-z0-9_-]{43}$' then
    return -1;
  end if;
  select k.* into t from public.list_add_tokens k
  join public.members m on m.id = k.member_id and m.family_id = k.family_id
    and m.status = 'active' and m.auth_user_id is not null
  where k.token_hash = p_token_hash;
  if not found then
    return -1;
  end if;
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 20
     or length(p_items::text) > 8000 then
    return 0;
  end if;

  for s in select value from jsonb_array_elements(p_items) loop
    continue when jsonb_typeof(s) is distinct from 'object';
    item_name := btrim(coalesce(s->>'name', ''));
    continue when item_name = '' or length(item_name) > 150;
    begin
      qty := (s->>'quantity')::numeric;
    exception when others then
      qty := null;
    end;
    if qty is not null and (qty <= 0 or qty > 10000) then
      qty := null;
    end if;
    item_unit := nullif(btrim(coalesce(s->>'unit', '')), '');
    if item_unit is not null and length(item_unit) > 20 then
      item_unit := null;
    end if;
    item_section := nullif(btrim(coalesce(s->>'section', '')), '');
    if item_section is null or length(item_section) > 40 then
      item_section := 'Other';
    end if;

    insert into public.buy_items (family_id, name, quantity, unit, section, source, created_by)
    values (t.family_id, item_name, qty, case when qty is null then null else item_unit end, item_section, 'house', t.member_id);
    saved := saved + 1;
  end loop;

  update public.list_add_tokens set last_used_at = now() where member_id = t.member_id;
  return saved;
end;
$$;

revoke all on function public.set_list_add_token(text) from public, anon;
revoke all on function public.clear_list_add_token() from public, anon;
revoke all on function public.list_add_link_on() from public, anon;
revoke all on function public.add_to_list_by_link(text, jsonb) from public;
grant execute on function public.set_list_add_token(text) to authenticated;
grant execute on function public.clear_list_add_token() to authenticated;
grant execute on function public.list_add_link_on() to authenticated;
grant execute on function public.add_to_list_by_link(text, jsonb) to anon, authenticated;
