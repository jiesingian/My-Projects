-- Pills left, and a refill before they run out (approved 14 October; the
-- way Medisafe's refill reminders work).
--
-- On a medicine, a grown-up can say how many are on hand -- tablets,
-- capsules or ml -- and how many go per dose (1 unless said). The card then
-- says "About 6 days left", "Runs out today" or "Ran out". At 7 days left or
-- fewer the five-minute job puts the medicine on the household's To-Buy list
-- (unless it is already there, open) and tells the grown-ups once: "Lola's
-- Losartan runs out in about 7 days". "Refilled" starts again from a new
-- count, or adds a box to what is left.
--
-- NOTHING IS COUNTED DOWN
--
-- KNOWN_RISKS.md, goals.current_amount: a stored running total, changed by
-- +delta, lost updates and counted twice. So nothing here is decremented.
-- health_medicine_supply keeps the count and when it was counted; what is on
-- hand is always worked out:
--
--   on hand = counted - per_dose x (doses due at or after counted_at, in
--             the household's own clock, and ticked Taken after it)
--
-- Both, because a count is of what is in the box at that moment. A dose due
-- before the count but ticked late was already out of the box; a dose
-- ticked early (the 20:00 one at 19:50) before the count was too, so a
-- count or a box added at 19:55 is not taken down by it again.
--
-- Untick a dose and its row goes, so the pill comes back by itself; tick it
-- twice and the unique (medicine, day, time) row means it is counted once.
-- medicine_on_hand() is that sum, once, for the screen, for "add a box" and
-- for the job.
--
-- A SUPPLY CYCLE
--
-- Each count starts a cycle, keyed by counted_at, which only the server
-- sets: now() when the row is made and whenever counted is written again
-- (even to the same number -- a refill to 30 after 30 is still a refill).
-- Changing only the per-dose amount or the unit keeps the cycle. The job's
-- ledger key is 'refill:<medicine>:<counted_at>', so one cycle gets one list
-- item and one push, and the next refill can get its own.
--
-- WHO CAN DO WHAT
--
-- Grown-ups (parent or adult) who can see the medicine set and change it; a
-- child cannot. Whoever can see the medicine sees what is left. A new row is
-- Kin Plus, like the medicine (require_kin_plus).
--
-- THE LIST ITEM
--
-- lib/grocery.ts has no pharmacy section; Personal Care is the closest of
-- its market sections, so the item goes there. buy_items has no note
-- column, so the name carries who it is for: "Losartan · for Lola, refill".
-- It counts as already on the list when the item this cycle added is still
-- open, or any open item's name starts with the medicine's name.
--
-- Only a medicine the whole household may see goes on the list. Everyone
-- reads the list, children included, so a 'parents' or 'private' medicine
-- is never put there by name; the grown-ups who can see it are still told,
-- and the push says it was not added.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.health_medicine_supply (
  medicine_id uuid primary key references public.health_medicines(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  counted numeric not null check (counted >= 0 and counted <= 100000),
  unit text not null default 'tablet' check (unit in ('tablet', 'capsule', 'ml')),
  per_dose numeric not null default 1 check (per_dose > 0 and per_dose <= 1000),
  counted_at timestamptz not null default now(),
  list_item_id uuid references public.buy_items(id) on delete set null,
  set_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists health_medicine_supply_family_idx on public.health_medicine_supply (family_id);
create index if not exists health_medicine_supply_list_item_idx on public.health_medicine_supply (list_item_id);
create index if not exists health_medicine_supply_set_by_idx on public.health_medicine_supply (set_by);

-- counted_at and list_item_id are the server's. Kept as they were on any
-- update; the second trigger (later by name, so it runs after) starts a new
-- cycle when counted is written.
create or replace function public.health_medicine_supply_keep()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.counted_at := now();
    new.list_item_id := null;
  else
    if new.medicine_id is distinct from old.medicine_id or new.family_id is distinct from old.family_id then
      raise exception 'a supply stays on its own medicine';
    end if;
    new.counted_at := old.counted_at;
    -- Only the job (a definer function, not a signed-in member) records
    -- which list item it added.
    if auth.uid() is not null then
      new.list_item_id := old.list_item_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.health_medicine_supply_recount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.counted_at := now();
  new.list_item_id := null;
  return new;
end;
$$;

revoke execute on function public.health_medicine_supply_keep() from public, anon, authenticated;
revoke execute on function public.health_medicine_supply_recount() from public, anon, authenticated;

drop trigger if exists health_medicine_supply_a_keep on public.health_medicine_supply;
create trigger health_medicine_supply_a_keep
  before insert or update on public.health_medicine_supply
  for each row execute function public.health_medicine_supply_keep();

drop trigger if exists health_medicine_supply_b_recount on public.health_medicine_supply;
create trigger health_medicine_supply_b_recount
  before update of counted on public.health_medicine_supply
  for each row execute function public.health_medicine_supply_recount();

drop trigger if exists require_kin_plus on public.health_medicine_supply;
create trigger require_kin_plus
  before insert on public.health_medicine_supply
  for each row execute function public.require_kin_plus('Medicines');

-- What is on hand now: the sum above. Null when nothing was counted. Asked
-- by a member it answers only for a medicine they can see in their own
-- household (the medicines policy, restated because a definer function does
-- not go through it); the job, with no one signed in, asks for any.
create or replace function public.medicine_on_hand(p_medicine uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select s.counted - s.per_dose * (
           select count(*) from public.health_medicine_doses hd
           where hd.medicine_id = med.id
             and (hd.dose_date + hd.dose_time::time) at time zone public.safe_time_zone(f.time_zone) >= s.counted_at
             and hd.taken_at >= s.counted_at
         )
  from public.health_medicine_supply s
  join public.health_medicines med on med.id = s.medicine_id
  join public.families f on f.id = med.family_id
  where s.medicine_id = p_medicine
    and (
      auth.uid() is null
      or (
        med.family_id = (select public.current_family_id())
        and (
          med.visibility = 'family'
          or med.member_id = (select public.current_member_id())
          or med.created_by = (select public.current_member_id())
          or (med.visibility = 'parents' and (select public.current_member_role()) = 'parent')
        )
      )
    );
$$;

revoke execute on function public.medicine_on_hand(uuid) from public, anon;
grant execute on function public.medicine_on_hand(uuid) to authenticated;

alter table public.health_medicine_supply enable row level security;

drop policy if exists health_medicine_supply_select on public.health_medicine_supply;
create policy health_medicine_supply_select on public.health_medicine_supply for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.health_medicines m where m.id = medicine_id)
  );

drop policy if exists health_medicine_supply_insert on public.health_medicine_supply;
create policy health_medicine_supply_insert on public.health_medicine_supply for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and set_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.health_medicines m where m.id = medicine_id and m.family_id = (select public.current_family_id()))
  );

drop policy if exists health_medicine_supply_update on public.health_medicine_supply;
create policy health_medicine_supply_update on public.health_medicine_supply for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.health_medicines m where m.id = medicine_id)
  )
  with check (
    family_id = (select public.current_family_id())
    and set_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

drop policy if exists health_medicine_supply_delete on public.health_medicine_supply;
create policy health_medicine_supply_delete on public.health_medicine_supply for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.health_medicines m where m.id = medicine_id)
  );

-- "Refilled: add a box". What is left plus the box, worked out here rather
-- than in the browser, so a dose ticked a moment ago is not lost. The new
-- count starts now, so doses already ticked are not taken off it again.
-- Runs as the caller: the update policy above decides who may.
create or replace function public.add_to_medicine_supply(p_medicine uuid, p_add numeric)
returns numeric
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_counted numeric;
begin
  if p_add is null or p_add <= 0 or p_add > 10000 then
    raise exception 'add between 1 and 10000';
  end if;
  update public.health_medicine_supply
     set counted = least(100000, greatest(0, coalesce(public.medicine_on_hand(p_medicine), 0)) + p_add),
         set_by = (select public.current_member_id())
   where medicine_id = p_medicine
  returning counted into v_counted;
  return v_counted;
end;
$$;

revoke execute on function public.add_to_medicine_supply(uuid, numeric) from public, anon;
grant execute on function public.add_to_medicine_supply(uuid, numeric) to authenticated;

-- The five-minute job's part: from 09:00 to before 21:00 in the household's
-- own zone, every medicine still being taken, on a schedule, with 7 days or
-- fewer left. Same secret and shape as due_reminders(); granted to anon
-- because the route calls with the anon key and the secret is the
-- credential.
create or replace function public.due_refill_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  expected text := public.kin_vault_secret('kin_cron_secret');
  r record;
  v_key text;
  v_item uuid;
  v_days numeric;
  v_title text;
  v_body text;
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  for r in
    select med.id as medicine_id, med.family_id, med.member_id, med.name, med.visibility, med.created_by,
           split_part(pm.full_name, ' ', 1) as first_name,
           s.counted_at, s.list_item_id,
           public.medicine_on_hand(med.id) / (s.per_dose * cardinality(med.times)) as days_left
    from public.health_medicine_supply s
    join public.health_medicines med on med.id = s.medicine_id
    join public.members pm on pm.id = med.member_id
    join public.household_clock(p_now) z on z.family_id = med.family_id
    where z.local_now::time >= time '09:00' and z.local_now::time < time '21:00'
      and pm.status = 'active'
      and cardinality(med.times) > 0
      and (med.end_date is null or med.end_date >= z.today)
      and public.medicine_on_hand(med.id) <= 7 * s.per_dose * cardinality(med.times)
  loop
    insert into public.reminder_sends as rs (key)
    values ('refill:' || r.medicine_id || ':' || to_char(r.counted_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS'))
    on conflict do nothing
    returning rs.key into v_key;
    continue when v_key is null;

    -- Not shown to everyone: never named on the shared list.
    -- On the list already? This cycle's own item still open, or any open
    -- item named for the medicine.
    if r.visibility <> 'family' then
      v_item := null;
      v_body := 'Not added to the list, as this medicine isn''t shown to everyone.';
    elsif not exists (
      select 1 from public.buy_items b
      where b.family_id = r.family_id and not b.checked and not b.cleared
        and (b.id = r.list_item_id or left(lower(btrim(b.name)), length(btrim(r.name))) = lower(btrim(r.name)))
    ) then
      insert into public.buy_items (family_id, name, section, source)
      values (r.family_id, left(r.name || ' · for ' || r.first_name || ', refill', 150), 'Personal Care', 'house')
      returning id into v_item;
      update public.health_medicine_supply set list_item_id = v_item where medicine_id = r.medicine_id;
      v_body := 'Added to the list.';
    else
      v_item := null;
      v_body := 'It''s already on the list.';
    end if;

    v_days := floor(greatest(r.days_left, 0));
    v_title := r.first_name || '''s ' || r.name || case
      when r.days_left <= 0 then ' has run out'
      when r.days_left < 1 then ' runs out today'
      when v_days = 1 then ' runs out in about 1 day'
      else ' runs out in about ' || v_days || ' days'
    end;

    return query
    select v_key, sub.member_id, sub.endpoint, sub.p256dh, sub.auth,
           v_title,
           v_body,
           '/family/members/' || r.member_id || '?view=health&seg=medicines'
    from public.members m
    join public.push_subscriptions sub on sub.member_id = m.id and sub.family_id = r.family_id
    where m.family_id = r.family_id
      and m.status = 'active'
      and m.role in ('parent', 'adult')
      and (r.visibility = 'family' or m.id = r.member_id or m.id = r.created_by or (r.visibility = 'parents' and m.role = 'parent'))
      and coalesce((m.notification_prefs ->> 'health')::boolean, true);
  end loop;
end;
$$;

revoke all on function public.due_refill_reminders(text, timestamptz) from public;
grant execute on function public.due_refill_reminders(text, timestamptz) to anon, authenticated;
