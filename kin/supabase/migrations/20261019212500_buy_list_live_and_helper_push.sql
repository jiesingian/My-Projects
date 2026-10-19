-- The To-Buy list, live; and a push to the helper when the family adds to it
-- (Jonathan, 19 October; the follow-ups 20261015121000_household_helpers left
-- open).
--
-- LIVE
--
-- The family's list and the helper's (/helper) refreshed only when the page
-- was opened again: Rosa at the market did not see the eggs added a minute
-- ago. Now any change to a household's buy_items sends one nudge on the
-- private Realtime topic "buy-list:<household id>", and every screen showing
-- that list reads it again under its own rights -- the household through
-- buy_items' policies, the helper through helper_buy_items(). The nudge
-- carries nothing: no item, no name, not even which row. So who may hear it
-- matters little, but it is still kept to the household's members and its
-- helpers who can see the list (buy_list_topic_is_mine below), and nobody can
-- send on it from a browser (no insert policy): only this trigger does.
--
-- One nudge per household per statement, not per row, so clearing thirty
-- ticked lines wakes each screen once. A failure to send never fails the
-- write: the list is the point, the nudge is a courtesy.
--
-- The helper cannot use postgres_changes, the chat's way: that is filtered by
-- the table's row policies, which refuse a helper by design (they are not a
-- member). A broadcast from the database is the one path both can share.
--
-- THE HELPER'S PUSH
--
-- Optional, and the helper's own choice: "Tell me when the family adds to the
-- list" on /helper saves that phone in helper_push_subscriptions, for that
-- household. A member adding a line then reaches it, through
-- helper_push_targets(), while the helper is live and can see the list.
-- Helpers are not members, so push_subscriptions (keyed on members) cannot
-- hold them; this table is theirs, with no policies at all -- only the
-- functions below read or write it.
--
-- Kin Free, as the list is.

-- ── live ──────────────────────────────────────────────────────────────────

create or replace function public.buy_list_topic_is_mine(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  if p_topic !~ '^buy-list:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_family := substr(p_topic, length('buy-list:') + 1)::uuid;
  return v_family = public.current_family_id() or public.helper_row_for(v_family, 'list') is not null;
end;
$$;

revoke execute on function public.buy_list_topic_is_mine(text) from public, anon;
grant execute on function public.buy_list_topic_is_mine(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages is missing; buy list channel policy not created';
    return;
  end if;
  execute 'drop policy if exists kin_buy_list_receive on realtime.messages';
  execute $p$
    create policy kin_buy_list_receive on realtime.messages
      for select to authenticated
      using (extension = 'broadcast' and realtime.topic() like 'buy-list:%' and (select public.buy_list_topic_is_mine(realtime.topic())))
  $p$;
end
$$;

create or replace function public.buy_items_nudge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  -- Where Realtime is not installed (a local copy, the tests) there is no
  -- one to tell.
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    return null;
  end if;
  for v_family in select distinct c.family_id from changed c where c.family_id is not null loop
    begin
      execute 'select realtime.send($1, $2, $3, true)' using '{}'::jsonb, 'changed', 'buy-list:' || v_family::text;
    exception when others then
      raise warning 'buy list nudge for % was not sent: %', v_family, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

revoke execute on function public.buy_items_nudge() from public, anon, authenticated;

drop trigger if exists buy_items_nudge_insert on public.buy_items;
create trigger buy_items_nudge_insert after insert on public.buy_items
  referencing new table as changed for each statement execute function public.buy_items_nudge();
drop trigger if exists buy_items_nudge_update on public.buy_items;
create trigger buy_items_nudge_update after update on public.buy_items
  referencing new table as changed for each statement execute function public.buy_items_nudge();
drop trigger if exists buy_items_nudge_delete on public.buy_items;
create trigger buy_items_nudge_delete after delete on public.buy_items
  referencing old table as changed for each statement execute function public.buy_items_nudge();

-- ── the helper's push ─────────────────────────────────────────────────────

create table if not exists public.helper_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  helper_id uuid not null references public.household_helpers(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint helper_push_subscriptions_endpoint_https check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  constraint helper_push_subscriptions_keys_length check (char_length(p256dh) between 1 and 200 and char_length(auth) between 1 and 100)
);

create index if not exists helper_push_subscriptions_helper_idx on public.helper_push_subscriptions (helper_id);

alter table public.helper_push_subscriptions enable row level security;
-- No policies: only the functions below touch it.
revoke all on public.helper_push_subscriptions from anon, authenticated;

-- "Tell me when the family adds to the list", on this phone, for this
-- household. A phone that was saved for somebody else (a shared phone,
-- signed in as the next helper) moves to whoever saves it now.
create or replace function public.save_helper_push(p_family uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_helper uuid := public.helper_row_for(p_family, 'list');
begin
  if v_helper is null then
    raise exception 'This list is not shared with you.' using errcode = '42501';
  end if;
  insert into public.helper_push_subscriptions (helper_id, endpoint, p256dh, auth)
  values (v_helper, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set helper_id = excluded.helper_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

-- Off again, for this phone and this household; and whether it is on.
create or replace function public.remove_helper_push(p_family uuid, p_endpoint text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.helper_push_subscriptions s
  using public.household_helpers h
  where s.helper_id = h.id
    and h.family_id = p_family
    and h.user_id = (select auth.uid())
    and s.endpoint = p_endpoint;
$$;

create or replace function public.helper_push_saved(p_family uuid, p_endpoint text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.helper_push_subscriptions s
    where s.endpoint = p_endpoint
      and s.helper_id = public.helper_row_for(p_family, 'list')
  );
$$;

-- Who to tell that a member just added p_item: the household's helpers who
-- can see the list and asked to be told. Only for a line the caller added in
-- the last two minutes, so it cannot be used to ring the helper on demand;
-- never for a line a helper added.
create or replace function public.helper_push_targets(p_item uuid)
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.buy_items b
  join public.household_helpers h on h.family_id = b.family_id
  join public.helper_push_subscriptions s on s.helper_id = h.id
  where b.id = p_item
    and b.family_id = public.current_family_id()
    and b.created_by = public.current_member_id()
    and b.helper_id is null
    and b.created_at > now() - interval '2 minutes'
    and h.claimed_at is not null
    and h.removed_at is null
    and h.can_see_list;
$$;

-- A push service says a phone is gone (404/410): the member whose add found
-- it may forget it, only among their own household's helpers.
create or replace function public.forget_helper_push_endpoint(p_endpoint text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.helper_push_subscriptions s
  using public.household_helpers h
  where s.helper_id = h.id
    and h.family_id = public.current_family_id()
    and s.endpoint = p_endpoint;
$$;

revoke execute on function public.save_helper_push(uuid, text, text, text) from public, anon;
revoke execute on function public.remove_helper_push(uuid, text) from public, anon;
revoke execute on function public.helper_push_saved(uuid, text) from public, anon;
revoke execute on function public.helper_push_targets(uuid) from public, anon;
revoke execute on function public.forget_helper_push_endpoint(text) from public, anon;
grant execute on function public.save_helper_push(uuid, text, text, text) to authenticated;
grant execute on function public.remove_helper_push(uuid, text) to authenticated;
grant execute on function public.helper_push_saved(uuid, text) to authenticated;
grant execute on function public.helper_push_targets(uuid) to authenticated;
grant execute on function public.forget_helper_push_endpoint(text) to authenticated;
