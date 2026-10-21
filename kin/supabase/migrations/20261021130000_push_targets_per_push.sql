-- Push subscriptions are per user, and a sender gets only the devices of the
-- people this one push is for (Jonathan, 21 October; stabilisation finding).
--
-- The app sends Web Push in the signed-in sender's own session (no
-- service-role key), so it has to be handed the recipients' device
-- subscriptions. push_targets(kind, member_ids) handed over every other
-- member's devices to anyone in the household, at any time, for any list
-- they named -- a child could fetch a grown-up's, with no message, call or
-- alert behind it, and the function is callable from the browser like any
-- other. Now:
--
-- * push_targets(kind, member_ids, source): `source` is the one thing this
--   push is about (the message, entry, list line, comment, chore, alert,
--   check-in, place or call), and the caller must have caused it moments ago
--   (push_warranted, below). Only the named members the event warrants come
--   back: the household for chat, arrivals, a household journal entry, the
--   list and an event's thread; the grown-ups for a chore to approve and an
--   SOS (and the SOS's sender when someone responds); the one asked or the
--   asker for "Are you okay?"; the callee for a call and the other
--   grown-ups for "is calling". Never the caller. Same switches and chat
--   mute as before.
-- * Each recipient's devices are handed out once per push (push_handouts),
--   so the same event cannot be replayed to fetch them again. A call is the
--   exception -- it rings every few seconds until answered -- and is held
--   instead to the callee it first rang (push_call_rings), for its two
--   minutes, at most 30 new calls an hour per caller.
-- * tree_story_push_targets() and helper_push_targets() were already tied to
--   one story or list line the caller had just written; they now hand each
--   device out once too.
-- * The cron path is unchanged in what it does. due_scheduled_messages()
--   posts as the writer and then asked the wide push_targets('chat'); it now
--   asks for the household about the message it just posted (the one line
--   that differs from 20261006100400). The other due_*() senders and the
--   cron route never used these.
--
-- The two-argument push_targets is dropped, so nothing can still ask the
-- wide question. App code that called it fails quietly (a push never fails
-- its action) until the matching deploy, which is this same merge.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.push_handouts (
  kind text not null,
  source uuid not null,
  recipient uuid not null,
  handed_at timestamptz not null default now(),
  primary key (kind, source, recipient)
);
create index if not exists push_handouts_at_idx on public.push_handouts (handed_at);
alter table public.push_handouts enable row level security;
-- No policies: only the definer functions below read or write it.
revoke all on public.push_handouts from anon, authenticated;

create table if not exists public.push_call_rings (
  call_id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  caller uuid not null references public.members(id) on delete cascade,
  callee uuid not null references public.members(id) on delete cascade,
  rang_at timestamptz not null default now()
);
create index if not exists push_call_rings_caller_idx on public.push_call_rings (caller, rang_at desc);
alter table public.push_call_rings enable row level security;
revoke all on public.push_call_rings from anon, authenticated;

-- Takes one recipient's devices for this push, once: true the first time.
-- Internal.
create or replace function public.push_hand_out(p_kind text, p_source uuid, p_recipient uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.push_handouts where handed_at < now() - interval '30 days';
  insert into public.push_handouts (kind, source, recipient) values (p_kind, p_source, p_recipient)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke execute on function public.push_hand_out(text, uuid, uuid) from public, anon, authenticated;

-- Who this push may reach: the members the event `p_source` warrants for
-- `p_kind`, caused by the caller just now. Empty when it warrants nobody.
-- Internal: push_targets() is the only caller.
create or replace function public.push_warranted(p_kind text, p_source uuid, p_member_ids uuid[])
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  fam uuid := public.current_family_id();
  recent constant interval := interval '5 minutes';
  household uuid[];
  grownups uuid[];
  who uuid[];
  r record;
begin
  if me is null or fam is null or p_source is null then return '{}'; end if;
  select coalesce(array_agg(m.id), '{}'),
         coalesce(array_agg(m.id) filter (where m.role in ('parent', 'adult')), '{}')
    into household, grownups
    from public.members m
   where m.family_id = fam and m.status = 'active' and m.id <> me;

  if p_kind = 'chat' or p_kind = 'arrivals' then
    if exists (select 1 from public.family_messages f
                where f.id = p_source and f.family_id = fam and f.member_id = me
                  and f.deleted_at is null and f.created_at > now() - recent) then
      who := household;
    elsif p_kind = 'arrivals' and exists (
      select 1 from public.member_locations l
      join public.household_places p on p.id = l.place_id
      where l.member_id = me and l.place_id = p_source and p.family_id = fam
        and l.updated_at > now() - recent) then
      who := household;
    end if;
  elsif p_kind = 'journal' then
    if exists (select 1 from public.journal_entries e
                where e.id = p_source and e.family_id = fam and e.visibility = 'household'
                  and e.owner_person_id = public.current_person_id()) then
      who := household;
    end if;
  elsif p_kind = 'shopping' then
    if exists (select 1 from public.buy_items b
                where b.id = p_source and b.family_id = fam and b.created_by = me
                  and b.created_at > now() - recent) then
      who := household;
    end if;
  elsif p_kind = 'events' then
    if exists (select 1 from public.event_comments c
                where c.id = p_source and c.family_id = fam and c.member_id = me
                  and c.created_at > now() - recent) then
      who := household;
    end if;
  elsif p_kind = 'approvals' then
    if exists (select 1 from public.routine_log l
                where l.routine_id = p_source and l.family_id = fam and l.logged_by = me
                  and l.approval = 'pending' and l.logged_at > now() - recent) then
      who := grownups;
    end if;
  elsif p_kind = 'sos' then
    select a.member_id into r from public.sos_alerts a
     where a.id = p_source and a.family_id = fam
       and ((a.member_id = me and (a.created_at > now() - recent or a.resolved_at > now() - recent))
         or (a.handled_by = me and a.handled_at > now() - recent));
    if found then
      who := grownups || array_remove(array[r.member_id], me);
    end if;
  elsif p_kind = 'checkins' then
    select c.asked_by, c.member_id, c.asked_at, c.answered_at into r from public.member_checkins c
     where c.id = p_source and c.family_id = fam;
    if found then
      if r.asked_by = me and r.asked_at > now() - recent then who := array[r.member_id];
      elsif r.member_id = me and r.answered_at > now() - recent then who := array[r.asked_by];
      end if;
    end if;
  elsif p_kind = 'calls' or p_kind = 'family_calls' then
    select c.callee, c.rang_at, c.caller into r from public.push_call_rings c where c.call_id = p_source;
    if not found and p_kind = 'calls' and cardinality(p_member_ids) = 1 and p_member_ids[1] = any (household)
       and (select count(*) from public.push_call_rings c where c.caller = me and c.rang_at > now() - interval '1 hour') < 30 then
      insert into public.push_call_rings (call_id, family_id, caller, callee) values (p_source, fam, me, p_member_ids[1])
      on conflict do nothing;
      select c.callee, c.rang_at, c.caller into r from public.push_call_rings c where c.call_id = p_source;
    end if;
    if found and r.caller = me and r.rang_at > now() - interval '2 minutes' then
      who := case when p_kind = 'calls' then array[r.callee] else array_remove(grownups, r.callee) end;
    end if;
  end if;

  return array(select x from unnest(coalesce(who, '{}')) x where x = any (p_member_ids) and x <> me and x = any (household));
end;
$$;
revoke execute on function public.push_warranted(text, uuid, uuid[]) from public, anon, authenticated;

drop function if exists public.push_targets(text, uuid[]);

create or replace function public.push_targets(p_kind text, p_member_ids uuid[], p_source uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  who uuid[];
begin
  if p_kind is null or p_kind !~ '^[a-z_]{1,32}$' or p_member_ids is null or cardinality(p_member_ids) = 0 then return; end if;
  who := public.push_warranted(p_kind, p_source, p_member_ids);
  if cardinality(who) = 0 then return; end if;
  -- A call rings again every few seconds until answered: held to its callee
  -- and its two minutes above, not to one hand-out.
  if p_kind not in ('calls', 'family_calls') then
    who := array(select x from unnest(who) x where public.push_hand_out(p_kind, p_source, x));
  end if;
  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.members m on m.id = s.member_id
    where m.id = any (who)
      and s.family_id = m.family_id
      and m.status = 'active'
      and coalesce((m.notification_prefs ->> p_kind)::boolean, true)
      and not (p_kind = 'chat' and public.chat_thread_muted(m.person_id, 'household'));
end;
$$;

revoke execute on function public.push_targets(text, uuid[], uuid) from public, anon;
grant execute on function public.push_targets(text, uuid[], uuid) to authenticated;

-- A story's push: unchanged in who (the writer's household when it is new,
-- the linked households with that person on their tree when it is shared,
-- each under their "journal" switch), now handed out once per recipient.
-- The recipients are found first and handed out one by one: a hand-out in
-- the same query's filter would be evaluated on rows the filter drops.
create or replace function public.tree_story_recipients(p_story uuid, p_new boolean)
returns table (member_id uuid, person_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with story as (
    select s.*
    from public.tree_person_stories s
    where s.id = p_story
      and s.family_id = public.current_family_id()
      and s.created_by = public.current_member_id()
  )
  select m.id, st.person_id
  from story st
  join public.members m on m.family_id = st.family_id
  where p_new
    and st.created_at > now() - interval '10 minutes'
    and m.status = 'active'
    and m.id <> public.current_member_id()
    and coalesce((m.notification_prefs ->> 'journal')::boolean, true)
  union
  select m.id,
         case when mt.offer_family_id = st.family_id then mt.to_person_id else mt.offer_person_id end
  from story st
  join public.family_tree_matches mt
    on mt.status = 'accepted'
   and (
     (mt.offer_family_id = st.family_id and mt.offer_person_id = st.person_id)
     or (mt.to_family_id = st.family_id and mt.to_person_id = st.person_id)
   )
  join public.members m
    on m.family_id = case when mt.offer_family_id = st.family_id then mt.to_family_id else mt.offer_family_id end
  where st.shared_at is not null
    and st.shared_at > now() - interval '10 minutes'
    and public.families_are_linked(st.family_id, m.family_id)
    and m.status = 'active'
    and m.id <> public.current_member_id()
    and coalesce((m.notification_prefs ->> 'journal')::boolean, true);
$$;
revoke execute on function public.tree_story_recipients(uuid, boolean) from public, anon, authenticated;

drop function if exists public.tree_story_push_targets(uuid, boolean);
create function public.tree_story_push_targets(p_story uuid, p_new boolean)
returns table (endpoint text, p256dh text, auth text, person_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select * from public.tree_story_recipients(p_story, p_new) loop
    if public.push_hand_out(case when p_new then 'tree_story_new' else 'tree_story_shared' end, p_story, r.member_id) then
      return query
        select s.endpoint, s.p256dh, s.auth, r.person_id
        from public.push_subscriptions s
        join public.members m on m.id = s.member_id and m.family_id = s.family_id
        where s.member_id = r.member_id;
    end if;
  end loop;
end;
$$;

revoke execute on function public.tree_story_push_targets(uuid, boolean) from public, anon;
grant execute on function public.tree_story_push_targets(uuid, boolean) to authenticated;

-- A list line's push to the helpers: unchanged in who, now once per helper.
drop function if exists public.helper_push_targets(uuid);
create function public.helper_push_targets(p_item uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  helper uuid;
begin
  for helper in
    select h.id
    from public.buy_items b
    join public.household_helpers h on h.family_id = b.family_id
    where b.id = p_item
      and b.family_id = public.current_family_id()
      and b.created_by = public.current_member_id()
      and b.helper_id is null
      and b.created_at > now() - interval '2 minutes'
      and h.claimed_at is not null
      and h.removed_at is null
      and h.can_see_list
  loop
    if public.push_hand_out('helper_list', p_item, helper) then
      return query
        select s.endpoint, s.p256dh, s.auth
        from public.helper_push_subscriptions s
        where s.helper_id = helper;
    end if;
  end loop;
end;
$$;

revoke execute on function public.helper_push_targets(uuid) from public, anon;
grant execute on function public.helper_push_targets(uuid) to authenticated;

-- The scheduled-messages sender, as in 20261006100400 but for its one
-- push_targets() line.
create or replace function public.due_scheduled_messages(p_secret text, p_now timestamptz default now())
returns table (key text, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  expected text := public.kin_vault_secret('kin_cron_secret');
  s record;
  who uuid;
  first text;
  fam uuid;
  other uuid;
  grp uuid;
  gname text;
  why text;
  msg uuid;
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  for s in
    select * from public.scheduled_messages
    where sent_at is null and send_at <= p_now
    order by send_at
    limit 100
    for update skip locked
  loop
    why := null;
    msg := null;
    select p.auth_user_id into who from public.people p where p.id = s.person_id;
    if who is null then
      why := 'The sender no longer has a login.';
    else
      -- Become the writer for this one message.
      perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', who::text, true);
      fam := public.current_family_id();
      first := split_part(coalesce((select m.full_name from public.members m where m.id = public.current_member_id()), ''), ' ', 1);
      if fam is null then
        why := 'The sender is no longer in a household.';
      elsif s.thread = 'household' then
        insert into public.family_messages (family_id, member_id, body)
          values (fam, public.current_member_id(), s.body) returning id into msg;
      elsif s.thread = 'family' then
        insert into public.family_tree_messages (body) values (s.body) returning id into msg;
      elsif s.thread like 'dm:%' then
        other := substr(s.thread, 4)::uuid;
        if not public.are_connected(s.person_id, other) then
          why := 'You''re no longer connected.';
        else
          insert into public.direct_messages (person_low, person_high, body)
            values (least(s.person_id, other), greatest(s.person_id, other), s.body) returning id into msg;
        end if;
      else
        grp := substr(s.thread, 7)::uuid;
        if not public.group_message_allowed(grp, null) then
          why := 'You can no longer post in that group.';
        else
          insert into public.chat_group_messages (group_id, body) values (grp, s.body) returning id into msg;
          select g.name into gname from public.chat_groups g where g.id = grp;
        end if;
      end if;
    end if;

    update public.scheduled_messages set sent_at = p_now, failed = why where id = s.id;
    if msg is null then
      continue;
    end if;

    if s.thread = 'household' then
      return query
        select 'sched-' || s.id::text, t.endpoint, t.p256dh, t.auth, coalesce(nullif(first, ''), 'Kin'), left(s.body, 180), '/chat/household'
        from public.push_targets('chat', array(select m.id from public.members m where m.family_id = fam and m.status = 'active'), msg) t;
    else
      return query
        select 'sched-' || s.id::text, t.endpoint, t.p256dh, t.auth,
               case
                 when s.thread = 'family' then coalesce(nullif(first, ''), 'Kin') || ' · Family'
                 when s.thread like 'group:%' then coalesce(nullif(first, ''), 'Kin') || ' · ' || coalesce(gname, 'Group')
                 else coalesce(nullif(first, ''), 'Kin')
               end,
               left(s.body, 180),
               case
                 when s.thread = 'family' then '/chat/family'
                 when s.thread like 'group:%' then '/chat/groups/' || substr(s.thread, 7)
                 else '/chat/dm/' || s.person_id::text
               end
        from public.chat_push_targets(
          case when s.thread like 'dm:%' then 'dm:' || substr(s.thread, 4) else s.thread end
        ) t;
    end if;
  end loop;
end;
$$;

-- As due_reminders: callable with the anon key, and useless without the secret.
revoke all on function public.due_scheduled_messages(text, timestamptz) from public;
grant execute on function public.due_scheduled_messages(text, timestamptz) to anon, authenticated;
