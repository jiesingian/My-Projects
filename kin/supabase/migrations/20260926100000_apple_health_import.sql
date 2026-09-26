-- Apple Health, through an iPhone Shortcut (26 September).
--
-- A web app cannot read Apple Health; Apple keeps that for App Store apps.
-- What an iPhone can do is run a Shortcut every evening that reads the day's
-- steps, weight, resting heart rate and sleep and sends them to Kin. This is
-- the Kin end of that.
--
-- WHO THE NUMBERS BELONG TO
--
-- The Shortcut has no Kin login; it carries a key instead. Each person makes
-- their own key in Settings (one at a time; a new one replaces the old), and
-- the key can write readings for that person and nobody else -- never read
-- anything, never touch another member. Only a SHA-256 hash of the key is
-- stored, so the table holding it is worth nothing to anyone who reads it,
-- and nobody can read it anyway: row-level security is on with no policies,
-- and the only ways in are the four functions below.
--
-- ingest_apple_health() is callable without a login, because the Shortcut
-- has none. It is safe to be: without a key that hashes to a stored one it
-- does nothing and says only "no"; with one, it writes that key's owner's
-- readings, bounded, typed and deduplicated per day, and nothing else.
--
-- THE TWO CHECK CONSTRAINTS
--
-- health_vitals.vital_type and .source are each limited to a fixed list, and
-- the lists predate the migration pipeline, so this file does not know them.
-- Rather than restate them and risk dropping one, it reads each constraint as
-- it stands and re-adds it as "the old rule, or one of these new values".
-- Every value allowed before is still allowed after, exactly.

-- ── new values the readings need ───────────────────────────────────────────

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
  where conrelid = 'public.health_vitals'::regclass and conname = 'health_vitals_vital_type_check';
  if def is not null and (def not like '%''steps''%' or def not like '%''heart_rate''%' or def not like '%''sleep''%' or def not like '%''weight''%') then
    execute 'alter table public.health_vitals drop constraint health_vitals_vital_type_check';
    execute format(
      'alter table public.health_vitals add constraint health_vitals_vital_type_check check ((%s) or vital_type in (''steps'', ''heart_rate'', ''sleep'', ''weight''))',
      regexp_replace(regexp_replace(def, ' NOT VALID$', ''), '^CHECK \((.*)\)$', '\1')
    );
  end if;

  select pg_get_constraintdef(oid) into def from pg_constraint
  where conrelid = 'public.health_vitals'::regclass and conname = 'health_vitals_source_check';
  if def is not null and def not like '%''apple_health''%' then
    execute 'alter table public.health_vitals drop constraint health_vitals_source_check';
    execute format(
      'alter table public.health_vitals add constraint health_vitals_source_check check ((%s) or source = ''apple_health'')',
      regexp_replace(regexp_replace(def, ' NOT VALID$', ''), '^CHECK \((.*)\)$', '\1')
    );
  end if;
end
$$;

-- One reading per person, kind and day from Apple Health: the Shortcut can
-- run twice, or late, and the second run corrects the first.
create unique index if not exists health_vitals_apple_health_day
  on public.health_vitals (member_id, vital_type, reading_date)
  where source = 'apple_health';

-- ── the keys ───────────────────────────────────────────────────────────────

create table if not exists public.health_import_tokens (
  member_id uuid primary key references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  visibility text not null default 'family' check (visibility in ('family', 'parents', 'private')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists health_import_tokens_family_idx on public.health_import_tokens (family_id);

alter table public.health_import_tokens enable row level security;
revoke all on public.health_import_tokens from anon, authenticated;

-- Make (or replace) the caller's own key. The key itself is made and shown
-- by the server; only its hash arrives here.
create or replace function public.set_apple_health_token(p_token_hash text, p_visibility text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := current_member_id();
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if exists (select 1 from members where id = me and (kid_view or status <> 'active')) then
    raise exception 'Apple Health can only be connected by a grown-up with their own login.' using errcode = '42501';
  end if;
  if p_visibility not in ('family', 'parents', 'private') or (p_visibility = 'parents' and current_member_role() <> 'parent') then
    raise exception 'Choose who can see the readings.' using errcode = '22023';
  end if;
  insert into health_import_tokens (member_id, family_id, token_hash, visibility)
  values (me, current_family_id(), p_token_hash, p_visibility)
  on conflict (member_id) do update
    set token_hash = excluded.token_hash, visibility = excluded.visibility, family_id = excluded.family_id, created_at = now(), last_used_at = null;
end;
$$;

create or replace function public.clear_apple_health_token()
returns void
language sql
security definer
set search_path = public
as $$
  delete from health_import_tokens where member_id = current_member_id();
$$;

-- Whether the caller has a key, and when it was last used. Never the hash.
create or replace function public.apple_health_status()
returns table (connected_at timestamptz, last_used_at timestamptz, visibility text)
language sql
stable
security definer
set search_path = public
as $$
  select created_at, last_used_at, visibility from health_import_tokens where member_id = current_member_id();
$$;

-- The Shortcut's way in. Returns how many readings were saved, or -1 for a
-- key that is not (or no longer) anybody's.
create or replace function public.ingest_apple_health(p_token_hash text, p_samples jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t health_import_tokens;
  s jsonb;
  kind text;
  val numeric;
  day date;
  saved integer := 0;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return -1;
  end if;
  select k.* into t from health_import_tokens k
  join members m on m.id = k.member_id and m.family_id = k.family_id and m.status = 'active'
  where k.token_hash = p_token_hash;
  if not found then
    return -1;
  end if;
  if jsonb_typeof(p_samples) is distinct from 'array' or jsonb_array_length(p_samples) > 40 then
    return 0;
  end if;

  for s in select value from jsonb_array_elements(p_samples) loop
    kind := s->>'type';
    continue when kind is null or kind not in ('steps', 'weight', 'heart_rate', 'sleep');
    begin
      val := (s->>'value')::numeric;
      day := (s->>'date')::date;
    exception when others then
      continue;
    end;
    continue when val is null or day is null or day > current_date + 1 or day < current_date - 400;
    if kind = 'weight' and lower(coalesce(s->>'unit', 'kg')) in ('lb', 'lbs') then
      val := val * 0.45359237;
    end if;
    continue when (kind = 'steps' and (val < 0 or val > 200000))
      or (kind = 'weight' and (val < 1 or val > 400))
      or (kind = 'heart_rate' and (val < 20 or val > 250))
      or (kind = 'sleep' and (val < 0 or val > 24));

    insert into health_vitals (family_id, member_id, vital_type, reading_date, value_text, unit, source, visibility, created_by)
    values (
      t.family_id, t.member_id, kind, day,
      case when kind in ('steps', 'heart_rate') then round(val)::bigint::text else round(val, 1)::text end,
      case kind when 'steps' then 'steps' when 'weight' then 'kg' when 'heart_rate' then 'bpm' else 'h' end,
      'apple_health', t.visibility, t.member_id
    )
    on conflict (member_id, vital_type, reading_date) where source = 'apple_health'
    do update set value_text = excluded.value_text, unit = excluded.unit, visibility = excluded.visibility;
    saved := saved + 1;
  end loop;

  update health_import_tokens set last_used_at = now() where member_id = t.member_id;
  return saved;
end;
$$;

revoke all on function public.set_apple_health_token(text, text) from public;
revoke all on function public.clear_apple_health_token() from public;
revoke all on function public.apple_health_status() from public;
revoke all on function public.ingest_apple_health(text, jsonb) from public;
grant execute on function public.set_apple_health_token(text, text) to authenticated;
grant execute on function public.clear_apple_health_token() to authenticated;
grant execute on function public.apple_health_status() to authenticated;
grant execute on function public.ingest_apple_health(text, jsonb) to anon, authenticated;
