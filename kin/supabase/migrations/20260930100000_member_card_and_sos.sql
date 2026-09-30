-- The member card on Today, its "Are you okay?" check-in, and Emergency SOS
-- (approved by Jonathan, 30 September).
--
-- Three things, all new, none of them changing an existing row:
--
--   members.timezone   the IANA zone the person's own phone reports, so the
--                      card can say "3:40 pm in Dubai" for someone working
--                      abroad even with location sharing off. A zone is a
--                      region, not a position; the card shows it to the
--                      household and shows the person that it does.
--
--   member_checkins    one person asks another "Are you okay?"; the other
--                      answers with one tap. Seen only by the two of them.
--
--   sos_alerts         the log of every SOS sent: who, when, where if the
--                      phone allowed, and how it ended. Seen by the sender
--                      and the household's grown-ups, nobody else.
--
-- Writes that change state after the insert go through two functions rather
-- than UPDATE policies, so each can only do the one thing it is for: answer a
-- check-in addressed to you, or end / take on an SOS.

-- ── members.timezone ─────────────────────────────────────────────────────
-- members_update_self already lets a person write their own row; the check
-- keeps the value to something shaped like a zone name and short.
alter table public.members add column if not exists timezone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_timezone_shape') then
    alter table public.members add constraint members_timezone_shape
      check (timezone is null or (length(timezone) <= 64 and timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'));
  end if;
end $$;

-- ── member_checkins ──────────────────────────────────────────────────────
create table if not exists public.member_checkins (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  asked_by uuid not null references public.members(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  asked_at timestamptz not null default now(),
  answer text check (answer in ('ok', 'call_me')),
  answered_at timestamptz,
  constraint member_checkins_not_self check (asked_by <> member_id),
  constraint member_checkins_answer_pair check ((answer is null) = (answered_at is null))
);

create index if not exists member_checkins_member_idx on public.member_checkins (member_id, asked_at desc);
create index if not exists member_checkins_asker_idx on public.member_checkins (asked_by, asked_at desc);
-- Every foreign key indexed, so deleting a household or a member never
-- scans the table.
create index if not exists member_checkins_family_idx on public.member_checkins (family_id);

alter table public.member_checkins enable row level security;

drop policy if exists member_checkins_select on public.member_checkins;
create policy member_checkins_select on public.member_checkins
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and (asked_by = (select public.current_member_id()) or member_id = (select public.current_member_id()))
  );

-- Asked only by yourself, only of someone active in your own household who
-- can sign in to answer, and never pre-answered.
drop policy if exists member_checkins_insert on public.member_checkins;
create policy member_checkins_insert on public.member_checkins
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and asked_by = (select public.current_member_id())
    and answer is null
    and answered_at is null
    and exists (
      select 1 from public.members m
      where m.id = member_checkins.member_id
        and m.family_id = (select public.current_family_id())
        and m.status = 'active'
        and m.auth_user_id is not null
    )
  );

-- No UPDATE or DELETE policy: answering is answer_checkin() below.

create or replace function public.answer_checkin(p_id uuid, p_answer text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asker uuid;
begin
  if p_answer not in ('ok', 'call_me') then
    raise exception 'That is not an answer' using errcode = '22023';
  end if;
  update member_checkins
     set answer = p_answer, answered_at = now()
   where id = p_id
     and member_id = current_member_id()
     and family_id = current_family_id()
     and answered_at is null
  returning asked_by into v_asker;
  -- Null when it was not yours to answer or was answered already.
  return v_asker;
end;
$$;

revoke all on function public.answer_checkin(uuid, text) from public, anon;
grant execute on function public.answer_checkin(uuid, text) to authenticated;

-- ── sos_alerts ───────────────────────────────────────────────────────────
create table if not exists public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  accuracy_m integer,
  -- How many grown-ups' phones the alert was handed to, as the server saw it.
  notified integer not null default 0,
  handled_by uuid references public.members(id) on delete set null,
  handled_at timestamptz,
  resolved_at timestamptz,
  constraint sos_alerts_position check (
    (lat is null and lng is null and accuracy_m is null)
    or (lat between -90 and 90 and lng between -180 and 180)
  ),
  constraint sos_alerts_accuracy check (accuracy_m is null or accuracy_m between 0 and 10000000)
);

create index if not exists sos_alerts_family_idx on public.sos_alerts (family_id, created_at desc);
create index if not exists sos_alerts_member_idx on public.sos_alerts (member_id, created_at desc);
create index if not exists sos_alerts_handled_by_idx on public.sos_alerts (handled_by) where handled_by is not null;

alter table public.sos_alerts enable row level security;

-- The sender, and the household's grown-ups. A child sees their own alert
-- and nobody else's.
drop policy if exists sos_alerts_select on public.sos_alerts;
create policy sos_alerts_select on public.sos_alerts
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and (
      member_id = (select public.current_member_id())
      or (select public.current_member_role()) in ('parent', 'adult')
    )
  );

-- Only ever sent as yourself, and only ever sent open.
drop policy if exists sos_alerts_insert on public.sos_alerts;
create policy sos_alerts_insert on public.sos_alerts
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and member_id = (select public.current_member_id())
    and handled_by is null
    and handled_at is null
    and resolved_at is null
  );

-- `notified` is written once, by the sender's own request, right after the
-- push went out. Nothing else about the row is theirs to change this way.
create or replace function public.sos_record_notified(p_id uuid, p_count integer)
returns void
language sql
security definer
set search_path = public
as $$
  update sos_alerts
     set notified = greatest(0, least(p_count, 1000))
   where id = p_id
     and member_id = current_member_id()
     and family_id = current_family_id()
     and notified = 0;
$$;

revoke all on function public.sos_record_notified(uuid, integer) from public, anon;
grant execute on function public.sos_record_notified(uuid, integer) to authenticated;

-- 'safe'     the sender says they are all right; ends the alert.
-- 'handling' a grown-up other than the sender says they are dealing with it;
--            the first one to say so is recorded.
-- Returns the alert's sender when something changed, null otherwise.
create or replace function public.sos_act(p_id uuid, p_action text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid;
begin
  if p_action = 'safe' then
    update sos_alerts
       set resolved_at = now()
     where id = p_id
       and member_id = current_member_id()
       and family_id = current_family_id()
       and resolved_at is null
    returning member_id into v_sender;
  elsif p_action = 'handling' then
    if current_member_role() not in ('parent', 'adult') then
      return null;
    end if;
    update sos_alerts
       set handled_by = current_member_id(), handled_at = now()
     where id = p_id
       and member_id <> current_member_id()
       and family_id = current_family_id()
       and resolved_at is null
       and handled_by is null
    returning member_id into v_sender;
  else
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  return v_sender;
end;
$$;

revoke all on function public.sos_act(uuid, text) from public, anon;
grant execute on function public.sos_act(uuid, text) to authenticated;
