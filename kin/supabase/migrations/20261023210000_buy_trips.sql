-- Past trips on the to-buy list, kept for a week (23 October, Janine).
--
-- Checking out the basket clears the ticked lines; it now also writes one row
-- here: when, what each line was budgeted at and cost, the totals, and what
-- was paid if a spend was logged. The Household list shows the week's trips
-- under the list, Budget / Actual / Savings each.
--
-- "Only good for a week": a row is readable for seven days after its
-- checkout and is deleted by a daily sweep after that, so nothing older lingers
-- even unread. The lines are a snapshot (items, jsonb) rather than pointers to
-- buy_items, so a trip still reads right after its lines are edited or
-- removed.
--
-- Row-level security: the household's own members read, add and remove its
-- trips, the way they share the list itself. A trip is written by the member
-- checking out (created_by is theirs); nobody edits one afterwards.

create table if not exists public.buy_trips (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  checked_out_at timestamptz not null default now(),
  created_by uuid references public.members(id) on delete set null,
  budget numeric(12, 2) not null default 0,
  actual numeric(12, 2) not null default 0,
  savings numeric(12, 2) not null default 0,
  paid numeric(12, 2),
  item_count integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  constraint buy_trips_amounts check (budget >= 0 and actual >= 0 and (paid is null or paid >= 0)),
  constraint buy_trips_item_count check (item_count between 0 and 1000),
  constraint buy_trips_items_array check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 1000)
);

create index if not exists buy_trips_family_idx on public.buy_trips (family_id, checked_out_at desc);
create index if not exists buy_trips_created_by_idx on public.buy_trips (created_by);

alter table public.buy_trips enable row level security;

drop policy if exists buy_trips_select on public.buy_trips;
create policy buy_trips_select on public.buy_trips
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and checked_out_at > now() - interval '7 days'
  );

drop policy if exists buy_trips_insert on public.buy_trips;
create policy buy_trips_insert on public.buy_trips
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and checked_out_at > now() - interval '5 minutes'
  );

drop policy if exists buy_trips_delete on public.buy_trips;
create policy buy_trips_delete on public.buy_trips
  for delete to authenticated
  using (family_id = (select public.current_family_id()));

grant select, insert, delete on public.buy_trips to authenticated;

-- The week is up: gone, read or not.
create or replace function public.sweep_buy_trips()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.buy_trips where checked_out_at <= now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.sweep_buy_trips() from public, anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable here: %', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    execute $c$ select cron.unschedule('kin-buy-trips') $c$;
  end if;
exception when others then
  null;
end
$$;

do $$
begin
  if to_regnamespace('cron') is not null then
    execute $c$ select cron.schedule('kin-buy-trips', '23 18 * * *', 'select public.sweep_buy_trips()') $c$;
  end if;
end
$$;
