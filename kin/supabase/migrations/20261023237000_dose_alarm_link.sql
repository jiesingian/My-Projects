-- Medicine doses as iPhone Clock alarms (Jonathan, 23 October): the free
-- stopgap until the native app. On an iPhone, Kin's dose reminder is an
-- ordinary banner, silent on silent (20261022190000). A Clock alarm rings
-- full screen with sound even then, and a Shortcut can make one. So a
-- "Kin Alarms" Shortcut fetches the dose times from a private link here and
-- makes one alarm per time, labelled "Kin · Losartan 50 mg".
--
-- Built like "Add to Kin" (20261014202000_list_add_link.sql): a Shortcut
-- carries no Kin session, so the link is the key -- 32 random bytes shown
-- once, with only the SHA-256 (base64url, 43 characters) kept here. Its own
-- key, separate from the brief's, the list's and Send it to Kin's, so each is
-- made, replaced and turned off on its own. This one only reads.
--
-- WHOSE DOSES
--
-- The same people the dose reminder goes to (due_dose_repeats): the link's
-- owner gets an alarm for their own medicines, and a grown-up also for a
-- child's medicine shared with them -- shared with the family, with parents
-- when they are a parent, or added by them. Never another grown-up's.
--
-- WHAT IT SAYS
--
-- Only the times and labels of medicines being taken today in the
-- household's clock (started, not ended, with times set). No notes, no
-- doses taken, nothing else of the household. At most 60 alarms.
--
-- A member who leaves, is removed or deletes their account loses the link:
-- the feed only answers for an active member with a login, and a trigger
-- deletes the key once either stops being true (account deletion keeps the
-- member row, so the cascade from members would never fire).

create table if not exists public.dose_alarm_tokens (
  member_id uuid primary key references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists dose_alarm_tokens_family_idx on public.dose_alarm_tokens (family_id);

alter table public.dose_alarm_tokens enable row level security;
revoke all on public.dose_alarm_tokens from public, anon, authenticated;

create or replace function public.set_dose_alarm_token(p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  fam uuid;
begin
  select m.family_id into fam from public.members m where m.id = me;
  if me is null or fam is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'That link is not the right shape.' using errcode = '22023';
  end if;
  insert into public.dose_alarm_tokens (member_id, family_id, token_hash)
  values (me, fam, p_token_hash)
  on conflict (member_id) do update
    set token_hash = excluded.token_hash, family_id = excluded.family_id, created_at = now(), last_used_at = null;
end;
$$;

create or replace function public.clear_dose_alarm_token()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.dose_alarm_tokens where member_id = public.current_member_id();
$$;

-- Whether the caller has a link on, and when the Shortcut last read it.
-- Never the hash.
create or replace function public.dose_alarm_link_state()
returns table (made_at timestamptz, last_used_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select k.created_at, k.last_used_at from public.dose_alarm_tokens k where k.member_id = public.current_member_id();
$$;

-- The Shortcut's way in. Null for a key that is not (or no longer) anybody's:
-- the same answer for a wrong key, a malformed one and a turned-off one.
create or replace function public.dose_alarms_by_link(p_token_hash text, p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.dose_alarm_tokens;
  me public.members;
  v_tz text;
  v_today date;
  v_alarms jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;
  select k.* into t from public.dose_alarm_tokens k where k.token_hash = p_token_hash;
  if not found then
    return null;
  end if;
  select m.* into me from public.members m
  where m.id = t.member_id and m.family_id = t.family_id and m.status = 'active' and m.auth_user_id is not null;
  if not found then
    return null;
  end if;
  select hc.tz, hc.today into v_tz, v_today from public.household_clock(p_now) hc where hc.family_id = t.family_id;

  select coalesce(jsonb_agg(a order by a->>'time', a->>'label'), '[]'::jsonb) into v_alarms
  from (
    select jsonb_build_object(
             'time', tm.time,
             'hour', split_part(tm.time, ':', 1)::int,
             'minute', split_part(tm.time, ':', 2)::int,
             'label', left('Kin · ' || btrim(med.name)
               || coalesce(' ' || nullif(btrim(med.dose), ''), '')
               || case when med.member_id = me.id then '' else ' · ' || split_part(pm.full_name, ' ', 1) end, 120),
             'until', med.end_date
           ) as a
    from public.health_medicines med
    join public.members pm on pm.id = med.member_id and pm.family_id = med.family_id
    cross join lateral unnest(med.times) as tm(time)
    where med.family_id = t.family_id
      and med.start_date <= v_today and (med.end_date is null or med.end_date >= v_today)
      and tm.time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and (
        med.member_id = me.id
        or (me.role in ('parent', 'adult') and pm.status = 'active' and pm.role in ('child_managed', 'child_self')
            and (med.visibility = 'family' or (med.visibility = 'parents' and me.role = 'parent') or med.created_by = me.id))
      )
    limit 60
  ) x;

  update public.dose_alarm_tokens set last_used_at = p_now where member_id = t.member_id;
  return jsonb_build_object('name', split_part(me.full_name, ' ', 1), 'tz', v_tz, 'today', v_today, 'alarms', v_alarms);
end;
$$;

-- Leaving, being removed or deleting the account ends the link.
create or replace function public.dose_alarm_token_follows_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is null or new.status is distinct from 'active' or new.family_id is distinct from old.family_id then
    delete from public.dose_alarm_tokens where member_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists dose_alarm_token_follows_member on public.members;
create trigger dose_alarm_token_follows_member
  after update of auth_user_id, status, family_id on public.members
  for each row execute function public.dose_alarm_token_follows_member();

revoke all on function public.set_dose_alarm_token(text) from public, anon;
revoke all on function public.clear_dose_alarm_token() from public, anon;
revoke all on function public.dose_alarm_link_state() from public, anon;
revoke all on function public.dose_alarms_by_link(text, timestamptz) from public;
revoke all on function public.dose_alarm_token_follows_member() from public, anon, authenticated;
grant execute on function public.set_dose_alarm_token(text) to authenticated;
grant execute on function public.clear_dose_alarm_token() to authenticated;
grant execute on function public.dose_alarm_link_state() to authenticated;
grant execute on function public.dose_alarms_by_link(text, timestamptz) to anon, authenticated;
