-- Typhoon mode (Jonathan, 29 October): when a storm or a long brownout is
-- coming, a grown-up switches the household into Typhoon mode. Today then
-- leads with it: the go-bag checklist the whole household ticks together,
-- the emergency card, and one tap to ask everyone "Are you okay?". It is a
-- manual switch on purpose: there is no reliable free feed of PAGASA
-- signals or class suspensions to turn it on by itself.
--
-- families.typhoon_mode_since: when it was switched on, null when off. Set
-- only through set_typhoon_mode(), by a grown-up of that household.
--
-- ready_items: the household's checklist. Everyone in the household,
-- children included, reads and ticks it (a child can check the flashlight);
-- who ticked an item is stamped by a trigger from the caller, never taken
-- from the row. Items are the household's own: another household sees none.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.families add column if not exists typhoon_mode_since timestamptz;

create table if not exists public.ready_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80 and label = btrim(label)),
  sort integer not null default 0,
  done_at timestamptz,
  done_by uuid references public.members(id) on delete set null,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ready_items_family_idx on public.ready_items (family_id, sort);

alter table public.ready_items enable row level security;
revoke all on public.ready_items from public, anon, authenticated;
grant select, insert, update, delete on public.ready_items to authenticated;

drop policy if exists ready_items_select on public.ready_items;
create policy ready_items_select on public.ready_items for select to authenticated
  using (family_id = (select public.current_family_id()));

drop policy if exists ready_items_insert on public.ready_items;
create policy ready_items_insert on public.ready_items for insert to authenticated
  with check (family_id = (select public.current_family_id()));

drop policy if exists ready_items_update on public.ready_items;
create policy ready_items_update on public.ready_items for update to authenticated
  using (family_id = (select public.current_family_id()))
  with check (family_id = (select public.current_family_id()));

drop policy if exists ready_items_delete on public.ready_items;
create policy ready_items_delete on public.ready_items for delete to authenticated
  using (family_id = (select public.current_family_id()));

-- Who added and who ticked come from the caller, not the row.
create or replace function public.ready_items_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := public.current_member_id();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.family_id := old.family_id;
  end if;
  if new.done_at is null then
    new.done_by := null;
  elsif tg_op = 'INSERT' or old.done_at is null then
    new.done_at := now();
    new.done_by := public.current_member_id();
  else
    new.done_at := old.done_at;
    new.done_by := old.done_by;
  end if;
  return new;
end;
$$;

revoke execute on function public.ready_items_stamp() from public, anon, authenticated;

drop trigger if exists ready_items_stamp on public.ready_items;
create trigger ready_items_stamp before insert or update on public.ready_items
  for each row execute function public.ready_items_stamp();

-- Switching Typhoon mode on or off: a grown-up (parent or adult) of the
-- caller's own household. Returns the new value.
create or replace function public.set_typhoon_mode(p_on boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_role text;
  v_since timestamptz;
begin
  select m.family_id, m.role into v_family, v_role
  from public.members m
  where m.auth_user_id = (select auth.uid()) and m.status = 'active'
  limit 1;
  if v_family is null or v_role not in ('parent', 'adult') then
    raise exception 'Only a grown-up in the household can switch Typhoon mode.' using errcode = '42501';
  end if;
  update public.families f
  set typhoon_mode_since = case when p_on then coalesce(f.typhoon_mode_since, now()) else null end
  where f.id = v_family
  returning f.typhoon_mode_since into v_since;
  return v_since;
end;
$$;

revoke execute on function public.set_typhoon_mode(boolean) from public, anon;
grant execute on function public.set_typhoon_mode(boolean) to authenticated;
