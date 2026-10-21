-- Error capture that outlives Vercel Hobby's one hour of logs (Jonathan,
-- 21 October). A client error (error boundary, window.onerror, an unhandled
-- rejection) or a server error (instrumentation.ts onRequestError: renders,
-- route handlers, server actions) lands here as one row per fingerprint,
-- with a count. Read only by the weekly check's "Errors this week".
--
-- No personal data, by design: no names, emails, ids of people, request
-- bodies or query strings. The app scrubs before sending (lib/error-capture.ts)
-- and log_app_error scrubs again, because anyone can call it.

create table if not exists public.app_errors (
  fingerprint text primary key check (fingerprint ~ '^[0-9a-f]{16}$'),
  kind text not null check (kind in ('client', 'server')),
  route text not null check (char_length(route) <= 200),
  message text not null check (char_length(message) <= 300),
  app_version text not null default '' check (char_length(app_version) <= 40),
  count integer not null default 1 check (count >= 1),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists app_errors_last_seen on public.app_errors (last_seen);

-- How many reports arrived each minute, so a loop in one browser (or someone
-- calling the function by hand) cannot flood the table.
create table if not exists public.app_error_minutes (
  minute timestamptz primary key,
  n integer not null default 0
);

-- RLS on and no policies: nobody reads or writes either table directly.
alter table public.app_errors enable row level security;
alter table public.app_error_minutes enable row level security;
revoke all on public.app_errors from public, anon, authenticated;
revoke all on public.app_error_minutes from public, anon, authenticated;

/** The same scrub as lib/error-capture.ts, for anything that reaches the
 * function without passing through the app. */
create or replace function public.app_error_scrub(p text, p_len integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    btrim(regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(coalesce(p, ''), '[^[:space:]@]+@[^[:space:]@]+\.[a-zA-Z]{2,}', '[email]', 'g'),
            '(https?://[^[:space:]?#]*)[?#][^[:space:]]*', '\1', 'g'),
          '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '[id]', 'g'),
        '[A-Za-z0-9_-]{24,}', '[token]', 'g'),
      '[0-9]{4,}', '[n]', 'g'),
    '[[:space:]]+', ' ', 'g')),
    p_len
  )
$$;

create or replace function public.log_app_error(p_fingerprint text, p_kind text, p_route text, p_message text, p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_route text;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{16}$' or p_kind is null or p_kind not in ('client', 'server') then
    return;
  end if;

  insert into public.app_error_minutes as m (minute, n) values (date_trunc('minute', now()), 1)
  on conflict (minute) do update set n = m.n + 1
  returning n into v_n;
  if v_n > 120 then
    return;
  end if;

  -- The path only: no query string, no fragment, and any id-like segment
  -- folded to [id], so /family/members/<uuid> groups as one route.
  v_route := split_part(split_part(coalesce(p_route, ''), '?', 1), '#', 1);
  v_route := regexp_replace(v_route, '/[^/]*[0-9][^/]*', '/[id]', 'g');
  v_route := regexp_replace(v_route, '/[A-Za-z_-]{24,}', '/[id]', 'g');
  v_route := left(coalesce(nullif(v_route, ''), '/'), 200);

  -- At the cap, a fingerprint already here still counts; a new one waits for
  -- the daily sweep to make room.
  if not exists (select 1 from public.app_errors where fingerprint = p_fingerprint)
     and (select count(*) from public.app_errors) >= 5000 then
    return;
  end if;

  insert into public.app_errors as e (fingerprint, kind, route, message, app_version)
  values (
    p_fingerprint,
    p_kind,
    v_route,
    coalesce(nullif(public.app_error_scrub(p_message, 300), ''), '(no message)'),
    left(regexp_replace(coalesce(p_version, ''), '[^A-Za-z0-9._-]', '', 'g'), 40)
  )
  on conflict (fingerprint) do update
    set count = least(e.count, 2000000000) + 1,
        last_seen = now(),
        route = excluded.route,
        app_version = excluded.app_version;
end;
$$;

/** The weekly check's read: the top fingerprints seen in the last p_days.
 * Only the two QA accounts the weekly check signs in as (docs/QA_HOUSEHOLDS.md,
 * dev and production) may call it; nobody reads it from the app. */
create or replace function public.app_error_digest(p_days integer default 7)
returns table (fingerprint text, kind text, route text, message text, app_version text, count integer, first_seen timestamptz, last_seen timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) in ('kin-dev-qa@example.com', 'kin-e2e-qa@example.com')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select e.fingerprint, e.kind, e.route, e.message, e.app_version, e.count, e.first_seen, e.last_seen
    from public.app_errors e
    where e.last_seen >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 31)))
    order by e.count desc, e.last_seen desc
    limit 25;
end;
$$;

/** Daily: older than 30 days goes, the minute counters older than a day go,
 * and the table is held to 5,000 rows (the least recently seen go first). */
create or replace function public.sweep_app_errors()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.app_errors where last_seen < now() - interval '30 days';
  delete from public.app_error_minutes where minute < now() - interval '1 day';
  delete from public.app_errors where fingerprint in (
    select fingerprint from public.app_errors order by last_seen desc offset 5000
  );
$$;

revoke all on function public.app_error_scrub(text, integer) from public, anon;
revoke all on function public.log_app_error(text, text, text, text, text) from public;
revoke all on function public.app_error_digest(integer) from public, anon;
revoke all on function public.sweep_app_errors() from public, anon, authenticated;
grant execute on function public.log_app_error(text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_error_digest(integer) to authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable here: %', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    execute $c$ select cron.unschedule('kin-app-errors') $c$;
  end if;
exception when others then
  null;
end
$$;

do $$
begin
  if to_regnamespace('cron') is not null then
    execute $c$ select cron.schedule('kin-app-errors', '17 19 * * *', 'select public.sweep_app_errors()') $c$;
  end if;
end
$$;
