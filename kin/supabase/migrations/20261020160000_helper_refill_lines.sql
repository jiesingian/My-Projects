-- A helper's To-Buy list says "Medicine refill", not the medicine's name
-- (Jonathan, 20 October; the stabilisation pass's design question "A helper
-- sees medicine names on To-Buy refill lines").
--
-- When pills run low the five-minute job puts "Losartan · for Lola, refill"
-- on the household's list (20261014201000_medicine_supply.sql). The family
-- reads that line as it is. The helper -- a kasambahay, yaya or driver, not
-- a member -- reads the same list through helper_buy_items(), and until now
-- read the medicine's name too. A medicine is health information; the list
-- was only ever meant to tell the helper what to buy.
--
-- So the line is marked as a refill where it is made (buy_items.medicine_id,
-- set by the job), and helper_buy_items() shows such a line as
-- "Medicine refill", with the store it is usually bought at when the family
-- has said one ("Medicine refill · Mercury Drug"). A grown-up can choose, per
-- medicine, to show the name to the helper after all (show_name_to_helper,
-- off to begin with). Both live on health_medicine_supply, the refill
-- feature's own row, which only grown-ups write. Ticking the line is
-- unchanged: the helper buys it, the family sees it ticked.
--
-- The link is the row's own column, not health_medicine_supply.list_item_id:
-- that one is cleared by the next count and by "Stop counting", and a line
-- still open on the list must stay a refill line whatever happens to the
-- count behind it. A line without a supply row behind it (counting stopped)
-- stays hidden, since nobody can say to show it.
--
-- The store is joined by the line's own household as well as the medicine:
-- a member can write any uuid into medicine_id on their own line, and
-- without that the store named on another household's medicine would show
-- on this household's helper page.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.health_medicine_supply
  add column if not exists show_name_to_helper boolean not null default false,
  add column if not exists store text;

alter table public.health_medicine_supply drop constraint if exists health_medicine_supply_store_check;
alter table public.health_medicine_supply
  add constraint health_medicine_supply_store_check check (store is null or char_length(store) between 1 and 60);

alter table public.buy_items
  add column if not exists medicine_id uuid references public.health_medicines(id) on delete set null;

create index if not exists buy_items_medicine_idx on public.buy_items (medicine_id) where medicine_id is not null;

-- The helper's list, with refill lines renamed.
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
    select b.id,
           case
             when b.medicine_id is null or coalesce(s.show_name_to_helper, false) then b.name::text
             else 'Medicine refill' || coalesce(' · ' || nullif(btrim(s.store), ''), '')
           end,
           b.quantity::numeric, b.unit::text, b.section::text, b.checked, b.helper_name
    from public.buy_items b
    left join public.health_medicine_supply s on s.medicine_id = b.medicine_id and s.family_id = b.family_id
    where b.family_id = p_family and not b.cleared
    order by b.created_at, b.name, b.id;
end;
$$;

-- The job, as 20261014201000 wrote it, with one change: the line it adds
-- carries the medicine's id.
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
        and (b.id = r.list_item_id or b.medicine_id = r.medicine_id or left(lower(btrim(b.name)), length(btrim(r.name))) = lower(btrim(r.name)))
    ) then
      insert into public.buy_items (family_id, name, section, source, medicine_id)
      values (r.family_id, left(r.name || ' · for ' || r.first_name || ', refill', 150), 'Personal Care', 'house', r.medicine_id)
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
