-- Web Push: the phones and browsers that asked to be told when something
-- happens in the household.
--
-- One row per device a member switched notifications on for. The endpoint and
-- keys are what the browser hands out for that purpose; they let a server
-- deliver a message to that device and nothing else.
--
-- A member sees and manages only their own devices. Sending is done from the
-- server in the session of whoever caused it (the person who posted, asked,
-- added), through push_targets(): it returns the devices of OTHER members of
-- the caller's own household whose matching notification switch is on --
-- never another household's, never the caller's own. No service-role key is
-- involved anywhere.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  constraint push_subscriptions_keys_length check (char_length(p256dh) <= 200 and char_length(auth) <= 100)
);

create index if not exists push_subscriptions_family_idx on public.push_subscriptions (family_id, member_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all
  using (member_id = current_member_id())
  with check (member_id = current_member_id() and family_id = current_family_id());

create or replace function public.push_targets(p_kind text, p_member_ids uuid[] default null)
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth
  from push_subscriptions s
  join members m on m.id = s.member_id
  where s.family_id = current_family_id()
    and m.family_id = current_family_id()
    and m.status = 'active'
    and s.member_id <> current_member_id()
    and (p_member_ids is null or s.member_id = any (p_member_ids))
    and p_kind ~ '^[a-z_]{1,32}$'
    and coalesce((m.notification_prefs ->> p_kind)::boolean, true)
$$;

-- A push service answers 404/410 when a device has unsubscribed or gone.
-- The sender, in someone else's session, may remove exactly that endpoint --
-- only within its own household.
create or replace function public.forget_push_endpoint(p_endpoint text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from push_subscriptions where endpoint = p_endpoint and family_id = current_family_id()
$$;

revoke all on function public.push_targets(text, uuid[]) from public;
revoke all on function public.forget_push_endpoint(text) from public;
grant execute on function public.push_targets(text, uuid[]) to authenticated;
grant execute on function public.forget_push_endpoint(text) to authenticated;
