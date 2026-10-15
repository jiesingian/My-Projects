-- Helper access for the kasambahay, yaya or driver (approved 14 October).
--
-- A helper is NOT a household member. They get no row in members, so every
-- policy that already exists -- each one keyed on members, current_family_id()
-- or current_member_id() -- goes on refusing them exactly as it refuses a
-- stranger. Nothing below widens any of those policies.
--
-- What a helper may do is written out here, function by function, and
-- nowhere else:
--   - the open To-Buy list: read it, tick and untick a line, add a line
--     (when the household has the list switch on for them);
--   - today's and tomorrow's meals, read only (the meals switch);
--   - the children's plans for today and tomorrow -- title, time, place and
--     the children's first names, nothing more (the children's plans switch).
-- Every one of these reads the helper's row on each call, removed_at
-- included, so taking someone off ends their access on their next tap.
--
-- A grown-up of the household adds a helper (a name and the three switches)
-- and gets a one-time code, good for 7 days. The helper opens the link, signs
-- up or signs in, and claims it; the code is then gone. Children cannot add,
-- change or remove helpers, and a helper cannot change their own switches --
-- the table has no write policy at all, only these functions write it.
--
-- Kin Free: lists, meals and the calendar are Free, so is this.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.household_helpers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  -- Empty until the invite is claimed.
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null,
  can_see_list boolean not null default true,
  can_see_meals boolean not null default true,
  can_see_kids_plans boolean not null default false,
  -- One-time: cleared when claimed or when the helper is removed.
  invite_code text,
  invite_expires_at timestamptz,
  invited_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  removed_at timestamptz,
  constraint household_helpers_name_shape check (char_length(btrim(display_name)) between 1 and 40),
  constraint household_helpers_code_shape check (invite_code is null or invite_code ~ '^[A-HJ-NP-Z2-9]{10}$')
);

create unique index if not exists household_helpers_code_idx on public.household_helpers (invite_code) where invite_code is not null;
-- One live helper row per person per household.
create unique index if not exists household_helpers_one_each on public.household_helpers (family_id, user_id) where user_id is not null and removed_at is null;
create index if not exists household_helpers_family_idx on public.household_helpers (family_id);
create index if not exists household_helpers_user_idx on public.household_helpers (user_id) where user_id is not null;
create index if not exists household_helpers_invited_by_idx on public.household_helpers (invited_by);

alter table public.household_helpers enable row level security;

-- The household's grown-ups see their helpers (Settings, Household). Nobody
-- else does -- not the children, not the helper (they read their own through
-- my_helper_households()), not another household.
drop policy if exists household_helpers_select on public.household_helpers;
create policy household_helpers_select on public.household_helpers
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

-- No insert, update or delete policy: only the functions below write here.
revoke insert, update, delete, truncate on public.household_helpers from authenticated, anon;
revoke all on public.household_helpers from anon;

-- A line the helper added says so on the family's list. The name travels on
-- the row, set by the trigger below from the helper's own row -- never typed
-- by whoever inserts it, so nobody can add a line "by Rosa".
alter table public.buy_items
  add column if not exists helper_id uuid references public.household_helpers(id) on delete set null,
  add column if not exists helper_name text;

create index if not exists buy_items_helper_idx on public.buy_items (helper_id) where helper_id is not null;

-- 1. Internal helpers -------------------------------------------------------

-- A fresh one-time code: 10 characters from an alphabet without 0/O or 1/I,
-- drawn from gen_random_uuid()'s random bytes (about 50 bits).
create or replace function public.new_helper_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- Bytes 6 and 8 of a v4 uuid carry its version and variant; skip them.
  v_pick constant int[] := array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13];
  v_bytes bytea;
  v_code text;
  i int;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    foreach i in array v_pick loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.household_helpers h where h.invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.new_helper_code() from public, anon, authenticated;

-- The caller's live helper row in this household with this switch on, or null.
create or replace function public.helper_row_for(p_family uuid, p_what text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select h.id
  from public.household_helpers h
  where h.family_id = p_family
    and h.user_id = (select auth.uid())
    and h.claimed_at is not null
    and h.removed_at is null
    and case p_what
      when 'list' then h.can_see_list
      when 'meals' then h.can_see_meals
      when 'kids' then h.can_see_kids_plans
      else false
    end
  limit 1;
$$;

revoke execute on function public.helper_row_for(uuid, text) from public, anon, authenticated;

-- 2. The household's side: add, change, renew, remove -------------------------

create or replace function public.create_helper_invite(p_name text, p_list boolean, p_meals boolean, p_kids boolean)
returns table (helper_id uuid, code text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family uuid := public.current_family_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_code text;
  v_id uuid;
begin
  if v_family is null or coalesce(public.current_member_role(), '') not in ('parent', 'adult') then
    raise exception 'Only a grown-up in the household can add a helper.' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Give the helper a name, up to 40 letters.' using errcode = '22023';
  end if;
  if (select count(*) from public.household_helpers h where h.family_id = v_family and h.removed_at is null) >= 10 then
    raise exception 'A household can have up to 10 helpers. Remove one first.' using errcode = '54000';
  end if;
  v_code := public.new_helper_code();
  insert into public.household_helpers (family_id, display_name, can_see_list, can_see_meals, can_see_kids_plans, invite_code, invite_expires_at, invited_by)
  values (v_family, v_name, coalesce(p_list, false), coalesce(p_meals, false), coalesce(p_kids, false), v_code, now() + interval '7 days', public.current_member_id())
  returning id into v_id;
  return query select v_id, v_code;
end;
$$;

-- A new link for a helper who has not claimed theirs yet (it expired, or it
-- went to the wrong phone). The old code stops working.
create or replace function public.renew_helper_invite(p_helper uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if public.current_family_id() is null or coalesce(public.current_member_role(), '') not in ('parent', 'adult') then
    raise exception 'Only a grown-up in the household can do that.' using errcode = '42501';
  end if;
  v_code := public.new_helper_code();
  update public.household_helpers h
  set invite_code = v_code, invite_expires_at = now() + interval '7 days'
  where h.id = p_helper
    and h.family_id = public.current_family_id()
    and h.claimed_at is null
    and h.removed_at is null;
  if not found then
    raise exception 'That helper is not waiting on a link any more.' using errcode = '42501';
  end if;
  return v_code;
end;
$$;

create or replace function public.set_helper_access(p_helper uuid, p_list boolean, p_meals boolean, p_kids boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.current_family_id() is null or coalesce(public.current_member_role(), '') not in ('parent', 'adult') then
    raise exception 'Only a grown-up in the household can change what a helper sees.' using errcode = '42501';
  end if;
  update public.household_helpers h
  set can_see_list = coalesce(p_list, false), can_see_meals = coalesce(p_meals, false), can_see_kids_plans = coalesce(p_kids, false)
  where h.id = p_helper
    and h.family_id = public.current_family_id()
    and h.removed_at is null;
  if not found then
    raise exception 'That helper is no longer here.' using errcode = '42501';
  end if;
end;
$$;

-- Removal ends access at once: every helper function reads removed_at. The
-- row stays, so lines they added keep their name on the list.
create or replace function public.remove_helper(p_helper uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.current_family_id() is null or coalesce(public.current_member_role(), '') not in ('parent', 'adult') then
    raise exception 'Only a grown-up in the household can remove a helper.' using errcode = '42501';
  end if;
  update public.household_helpers h
  set removed_at = now(), invite_code = null, invite_expires_at = null
  where h.id = p_helper
    and h.family_id = public.current_family_id()
    and h.removed_at is null;
  if not found then
    raise exception 'That helper is no longer here.' using errcode = '42501';
  end if;
end;
$$;

-- 3. The helper's side: the invite ------------------------------------------

-- What a helper link is for, before it is accepted: the household's name,
-- the name it gives the helper and what they will see. Nothing when the code
-- is wrong, used or expired.
create or replace function public.helper_invite_preview(p_code text)
returns table (household text, helper_name text, can_see_list boolean, can_see_meals boolean, can_see_kids_plans boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select f.name::text, h.display_name, h.can_see_list, h.can_see_meals, h.can_see_kids_plans
  from public.household_helpers h
  join public.families f on f.id = h.family_id
  where (select auth.uid()) is not null
    and h.invite_code = upper(btrim(coalesce(p_code, '')))
    and h.claimed_at is null
    and h.removed_at is null
    and h.invite_expires_at > now();
$$;

create or replace function public.claim_helper_invite(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  h public.household_helpers%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into h from public.household_helpers x
  where x.invite_code = upper(btrim(coalesce(p_code, '')))
  for update;
  if not found or h.claimed_at is not null or h.removed_at is not null or h.invite_expires_at is null or h.invite_expires_at <= now() then
    raise exception 'That helper link has been used or has expired. Ask the family for a new one.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.members m
    where m.family_id = h.family_id and m.auth_user_id = v_uid and m.status in ('active', 'pending')
  ) then
    raise exception 'You are already in this household, so you do not need a helper link.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.household_helpers x
    where x.family_id = h.family_id and x.user_id = v_uid and x.removed_at is null
  ) then
    raise exception 'You already help this household.' using errcode = '42501';
  end if;
  update public.household_helpers x
  set user_id = v_uid, claimed_at = now(), invite_code = null, invite_expires_at = null
  where x.id = h.id;
  return h.family_id;
end;
$$;

-- The households the caller helps, and what each lets them see. Only the
-- household's name and time zone come from families.
create or replace function public.my_helper_households()
returns table (helper_id uuid, family_id uuid, household text, helper_name text, time_zone text, can_see_list boolean, can_see_meals boolean, can_see_kids_plans boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.family_id, f.name::text, h.display_name, public.safe_time_zone(f.time_zone), h.can_see_list, h.can_see_meals, h.can_see_kids_plans
  from public.household_helpers h
  join public.families f on f.id = h.family_id
  where h.user_id = (select auth.uid())
    and h.claimed_at is not null
    and h.removed_at is null
  order by h.claimed_at;
$$;

-- 4. The helper's side: the To-Buy list --------------------------------------

create or replace function public.helper_buy_items(p_family uuid)
returns table (item_id uuid, item_name text, quantity numeric, unit text, section text, checked boolean, added_by text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.helper_row_for(p_family, 'list') is null then
    raise exception 'This list is not shared with you.' using errcode = '42501';
  end if;
  return query
    -- Cast to the declared types: return query wants them exactly, and the
    -- list's columns predate the migrations folder.
    select b.id, b.name::text, b.quantity::numeric, b.unit::text, b.section::text, b.checked, b.helper_name
    from public.buy_items b
    where b.family_id = p_family and not b.cleared
    order by b.created_at, b.name, b.id;
end;
$$;

create or replace function public.helper_add_buy_item(p_family uuid, p_name text, p_section text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_helper uuid := public.helper_row_for(p_family, 'list');
  v_name text := btrim(coalesce(p_name, ''));
  v_section text := left(btrim(coalesce(nullif(btrim(p_section), ''), 'Other')), 40);
  v_id uuid;
begin
  if v_helper is null then
    raise exception 'This list is not shared with you.' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 150 then
    raise exception 'Name the item.' using errcode = '22023';
  end if;
  -- A brake, not a rule anyone should meet: a helper adds a few lines a day.
  if (select count(*) from public.buy_items b where b.helper_id = v_helper and not b.cleared) >= 100 then
    raise exception 'You have added a lot to this list already. Ask the family to clear it.' using errcode = '54000';
  end if;
  insert into public.buy_items (family_id, name, section, source, helper_id)
  values (p_family, v_name, v_section, 'house', v_helper)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.helper_tick_buy_item(p_item uuid, p_checked boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_name text;
begin
  select b.family_id, b.name into v_family, v_name from public.buy_items b where b.id = p_item and not b.cleared;
  if v_family is null or public.helper_row_for(v_family, 'list') is null then
    raise exception 'This list is not shared with you.' using errcode = '42501';
  end if;
  update public.buy_items b
  set checked = coalesce(p_checked, false), checked_at = case when p_checked then now() else null end
  where b.id = p_item;
  -- Bought: as when the family ticks it (toggleBuyItemAction), whatever was
  -- marked running low under that name in the pantry no longer is.
  if coalesce(p_checked, false) then
    update public.pantry_items p
    set running_low = false, low_since = null
    where p.family_id = v_family
      and p.item_key = regexp_replace(lower(btrim(v_name)), '\s+', ' ', 'g')
      and p.running_low;
  end if;
end;
$$;

-- Who a line was added by. On insert, a helper line takes its name from the
-- caller's own live helper row in that household, or is refused; on update,
-- the helper on a line cannot be changed (clearing it, as the foreign key
-- does, is allowed).
create or replace function public.buy_items_helper_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' then
    if new.helper_id is null then
      new.helper_name := null;
      return new;
    end if;
    select h.display_name into v_name
    from public.household_helpers h
    where h.id = new.helper_id
      and h.family_id = new.family_id
      and h.user_id = (select auth.uid())
      and h.claimed_at is not null
      and h.removed_at is null
      and h.can_see_list;
    if v_name is null then
      raise exception 'Only that helper can add a line in their name.' using errcode = '42501';
    end if;
    new.helper_name := v_name;
    return new;
  end if;
  if new.helper_id is not null and new.helper_id is distinct from old.helper_id then
    raise exception 'Who added a line cannot be changed.' using errcode = '42501';
  end if;
  if new.helper_name is distinct from old.helper_name then
    raise exception 'Who added a line cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.buy_items_helper_author() from public, anon, authenticated;

drop trigger if exists buy_items_helper_author on public.buy_items;
create trigger buy_items_helper_author
  before insert or update of helper_id, helper_name on public.buy_items
  for each row execute function public.buy_items_helper_author();

-- 5. The helper's side: meals and the children's plans ------------------------

-- Today's and tomorrow's meals in the household's own time zone: the day,
-- the meal and the dish. Not the notes, not the recipe, not who it is for.
create or replace function public.helper_meals(p_family uuid)
returns table (plan_date date, slot text, dish text, meal_position integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  if public.helper_row_for(p_family, 'meals') is null then
    raise exception 'The meals are not shared with you.' using errcode = '42501';
  end if;
  -- safe_time_zone (20261007140000): a zone Postgres does not know reads as
  -- Manila rather than failing the page.
  select (now() at time zone public.safe_time_zone(f.time_zone))::date into v_today from public.families f where f.id = p_family;
  return query
    select m.plan_date::date, m.slot::text, m.dish::text, m.position::integer
    from public.meal_plans m
    where m.family_id = p_family
      and m.plan_date between v_today and v_today + 1
    order by m.plan_date, m.position;
end;
$$;

-- The children's plans that could fall today or tomorrow: Planner activities
-- that name a child of the household. One-offs only when they start in those
-- two days; a repeating one when it has started and not ended, and the app
-- picks its days (repeat_days and repeat_until: 20261014120000). Title, time,
-- place and the children's first names -- not the notes, not the budget, not
-- who else is going.
create or replace function public.helper_kids_plans(p_family uuid)
returns table (title text, start_at timestamptz, end_at timestamptz, repeat text, repeat_days smallint[], repeat_until date, place text, children text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
begin
  if public.helper_row_for(p_family, 'kids') is null then
    raise exception 'The children''s plans are not shared with you.' using errcode = '42501';
  end if;
  select public.safe_time_zone(f.time_zone) into v_tz from public.families f where f.id = p_family;
  v_from := ((now() at time zone v_tz)::date)::timestamp at time zone v_tz;
  v_to := (((now() at time zone v_tz)::date) + 2)::timestamp at time zone v_tz;
  return query
    select a.title::text, a.start_at::timestamptz, a.end_at::timestamptz, a.repeat::text, a.repeat_days::smallint[], a.repeat_until::date, a.location::text, kids.names
    from public.activities a
    cross join lateral (
      select array_agg(split_part(btrim(mm.full_name), ' ', 1) order by mm.full_name) as names
      from public.activity_members am
      join public.members mm on mm.id = am.member_id
      where am.activity_id = a.id
        and mm.family_id = p_family
        and mm.role in ('child_self', 'child_managed')
        and mm.status <> 'removed'
    ) kids
    where a.family_id = p_family
      and a.status in ('upcoming', 'completed')
      and kids.names is not null
      and a.start_at < v_to
      and (coalesce(a.repeat, 'once') <> 'once' or a.start_at >= v_from)
      and (a.repeat_until is null or a.repeat_until >= (v_from at time zone v_tz)::date)
    order by a.start_at;
end;
$$;

-- 6. Who may call what ---------------------------------------------------------

revoke execute on function public.create_helper_invite(text, boolean, boolean, boolean) from public, anon;
revoke execute on function public.renew_helper_invite(uuid) from public, anon;
revoke execute on function public.set_helper_access(uuid, boolean, boolean, boolean) from public, anon;
revoke execute on function public.remove_helper(uuid) from public, anon;
revoke execute on function public.helper_invite_preview(text) from public, anon;
revoke execute on function public.claim_helper_invite(text) from public, anon;
revoke execute on function public.my_helper_households() from public, anon;
revoke execute on function public.helper_buy_items(uuid) from public, anon;
revoke execute on function public.helper_add_buy_item(uuid, text, text) from public, anon;
revoke execute on function public.helper_tick_buy_item(uuid, boolean) from public, anon;
revoke execute on function public.helper_meals(uuid) from public, anon;
revoke execute on function public.helper_kids_plans(uuid) from public, anon;

grant execute on function public.create_helper_invite(text, boolean, boolean, boolean) to authenticated;
grant execute on function public.renew_helper_invite(uuid) to authenticated;
grant execute on function public.set_helper_access(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.remove_helper(uuid) to authenticated;
grant execute on function public.helper_invite_preview(text) to authenticated;
grant execute on function public.claim_helper_invite(text) to authenticated;
grant execute on function public.my_helper_households() to authenticated;
grant execute on function public.helper_buy_items(uuid) to authenticated;
grant execute on function public.helper_add_buy_item(uuid, text, text) to authenticated;
grant execute on function public.helper_tick_buy_item(uuid, boolean) to authenticated;
grant execute on function public.helper_meals(uuid) to authenticated;
grant execute on function public.helper_kids_plans(uuid) to authenticated;
