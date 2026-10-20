-- "Send it to Kin" (Jonathan, 20 October; Kin Plus): from the iPhone share
-- sheet, a Shortcut sends a screenshot -- a school circular, a Viber or
-- Messenger message with dates in it -- to Kin, and Kin opens Planner -> Add
-- with the dates, places and tasks read off it, on the same review screen
-- the flyer scan uses. Nothing is saved until the member ticks what to add.
--
-- A Shortcut carries no Kin session, so the link is the key: 32 random bytes
-- shown once, with only the SHA-256 (base64url, 43 characters) kept here --
-- the same shape as "Today in Kin" (20260928120000_today_brief.sql) and
-- "Add to Kin" (20261014202000_list_add_link.sql), and a SEPARATE key again:
-- this one spends Kin AI, so it is made, replaced and turned off on its own.
-- Row-level security is on with no policies on the keys; the functions below
-- are the only ways in.
--
-- THE PICTURE ITSELF
--
-- A Shortcut cannot show a review screen, so the picture has to wait
-- somewhere between the share sheet and Planner -> Add. It waits in
-- sent_screenshots: the bytes, who sent them, for at most a day. The member
-- who sent it is the only one who can read or delete it (the Add page reads
-- it once, scans it, and deletes it); a sweep removes anything older than 24
-- hours in case the page was never opened. No storage bucket: a bucket
-- policy cannot check a Shortcut's key, and these are a few hundred
-- kilobytes that live for minutes.
--
-- WHO MAY SEND
--
-- A member with their own login, in a household on Kin Plus (the scan costs
-- a Kin AI call; the feature is Plus). A child in kid view is refused: the
-- Planner's Add page is not theirs, and Kin AI is kept from kid view
-- everywhere (K2). The caller never names a household or a member.

create table if not exists public.send_to_kin_tokens (
  member_id uuid primary key references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists send_to_kin_tokens_family_idx on public.send_to_kin_tokens (family_id);

alter table public.send_to_kin_tokens enable row level security;
revoke all on public.send_to_kin_tokens from public, anon, authenticated;

create table if not exists public.sent_screenshots (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  data bytea not null check (octet_length(data) between 1 and 5242880),
  created_at timestamptz not null default now()
);

create index if not exists sent_screenshots_member_idx on public.sent_screenshots (member_id, created_at);
create index if not exists sent_screenshots_created_idx on public.sent_screenshots (created_at);

alter table public.sent_screenshots enable row level security;
revoke all on public.sent_screenshots from public, anon;
grant select, delete on public.sent_screenshots to authenticated;

-- Only the member who sent it, and only in their own household: the Add page
-- reads it as them and deletes it as them. Nobody inserts from the app; the
-- Shortcut's function below does, as the key's owner.
drop policy if exists sent_screenshots_select_own on public.sent_screenshots;
create policy sent_screenshots_select_own on public.sent_screenshots
  for select to authenticated
  using (member_id = (select public.current_member_id()) and family_id = (select public.current_family_id()));

drop policy if exists sent_screenshots_delete_own on public.sent_screenshots;
create policy sent_screenshots_delete_own on public.sent_screenshots
  for delete to authenticated
  using (member_id = (select public.current_member_id()) and family_id = (select public.current_family_id()));

-- Make (or replace) the caller's own link. The key is made and shown by the
-- server; only its hash arrives here. Not for a child in kid view.
create or replace function public.set_send_to_kin_token(p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  fam uuid;
  kid boolean;
begin
  select m.family_id, (m.role = 'child_self' and m.kid_view) into fam, kid from public.members m where m.id = me;
  if me is null or fam is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if kid then
    raise exception 'Not in kid view.' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'That link is not the right shape.' using errcode = '22023';
  end if;
  insert into public.send_to_kin_tokens (member_id, family_id, token_hash)
  values (me, fam, p_token_hash)
  on conflict (member_id) do update
    set token_hash = excluded.token_hash, family_id = excluded.family_id, created_at = now(), last_used_at = null;
end;
$$;

create or replace function public.clear_send_to_kin_token()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.send_to_kin_tokens where member_id = public.current_member_id();
$$;

-- Whether the caller has a link on. Never the hash.
create or replace function public.send_to_kin_link_on()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.send_to_kin_tokens where member_id = public.current_member_id());
$$;

-- The Shortcut's way in. The picture arrives base64-encoded (the route
-- checks it is an image and under 5 MB; this checks again). Returns
--   {"ok": true, "id": "<uuid>"}       -- waiting for the Add page
--   {"ok": false, "why": "unknown"}     -- a key that is not (or no longer)
--                                          anybody's: the same answer for a
--                                          wrong, malformed or turned-off key
--   {"ok": false, "why": "plus"}        -- the household is on Kin Free
--   {"ok": false, "why": "picture"}     -- not a picture Kin can keep
create or replace function public.send_to_kin_by_link(p_token_hash text, p_mime text, p_data_base64 text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.send_to_kin_tokens;
  bytes bytea;
  new_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('ok', false, 'why', 'unknown');
  end if;
  select k.* into t from public.send_to_kin_tokens k
  join public.members m on m.id = k.member_id and m.family_id = k.family_id
    and m.status = 'active' and m.auth_user_id is not null
    and not (m.role = 'child_self' and m.kid_view)
  where k.token_hash = p_token_hash;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'unknown');
  end if;
  if not public.family_has_plus(t.family_id) then
    return jsonb_build_object('ok', false, 'why', 'plus');
  end if;
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
     or p_data_base64 is null or length(p_data_base64) > 7100000 then
    return jsonb_build_object('ok', false, 'why', 'picture');
  end if;
  begin
    bytes := decode(p_data_base64, 'base64');
  exception when others then
    return jsonb_build_object('ok', false, 'why', 'picture');
  end;
  if octet_length(bytes) < 1 or octet_length(bytes) > 5242880 then
    return jsonb_build_object('ok', false, 'why', 'picture');
  end if;

  -- One member keeps at most five waiting; the oldest go first, and so does
  -- anything older than a day, whoever sent it.
  delete from public.sent_screenshots where created_at < now() - interval '24 hours';
  delete from public.sent_screenshots s where s.member_id = t.member_id and s.id in (
    select id from public.sent_screenshots where member_id = t.member_id order by created_at desc offset 4
  );

  insert into public.sent_screenshots (family_id, member_id, mime, data)
  values (t.family_id, t.member_id, p_mime, bytes)
  returning id into new_id;

  update public.send_to_kin_tokens set last_used_at = now() where member_id = t.member_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

-- Anything left waiting for a day goes, in case the Add page was never
-- opened. Hourly, like the other sweeps; pg_cron runs inside the database.
create or replace function public.sweep_sent_screenshots()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.sent_screenshots where created_at < now() - interval '24 hours';
$$;

revoke all on function public.set_send_to_kin_token(text) from public, anon;
revoke all on function public.clear_send_to_kin_token() from public, anon;
revoke all on function public.send_to_kin_link_on() from public, anon;
revoke all on function public.send_to_kin_by_link(text, text, text) from public;
revoke all on function public.sweep_sent_screenshots() from public, anon, authenticated;
grant execute on function public.set_send_to_kin_token(text) to authenticated;
grant execute on function public.clear_send_to_kin_token() to authenticated;
grant execute on function public.send_to_kin_link_on() to authenticated;
grant execute on function public.send_to_kin_by_link(text, text, text) to anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable here: %', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    execute $c$ select cron.unschedule('kin-sent-screenshots') $c$;
  end if;
exception when others then
  null;
end
$$;

do $$
begin
  if to_regnamespace('cron') is not null then
    execute $c$ select cron.schedule('kin-sent-screenshots', '23 * * * *', 'select public.sweep_sent_screenshots()') $c$;
  end if;
end
$$;
