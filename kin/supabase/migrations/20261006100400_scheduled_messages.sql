-- Scheduled messages: "send at 7am" (Jonathan, 30 September -- "competitive
-- with Telegram", item 10), on the reminders pipeline (20260926140000).
--
-- 1. scheduled_messages -- words waiting to be sent: who wrote them (from the
--    caller, never the client), which conversation ('household', 'family',
--    'dm:<person>', 'group:<group>'), and when. Readable, addable and
--    cancellable by their writer only; never edited (cancel and write again).
--
-- 2. due_scheduled_messages(secret) -- called by /api/cron/reminders every
--    five minutes (pg_cron, kin-reminders), so "7:00" lands by 7:05. For each
--    message that is due it becomes its writer for that one insert (the
--    request's claims, local to this transaction), so the conversation's own
--    author triggers write the name and household exactly as if they had
--    pressed Send -- and it asks again, at send time, whether they still may:
--    still in the household, still connected, still in the group (and an admin
--    in a channel). A message that may no longer go is marked failed, not
--    sent. Then it returns the devices to notify, from the same push-target
--    functions as a message sent by hand, so mute and the chat switch hold.
--
-- The secret is the reminders' (kin_cron_secret in Vault); without it the
-- function returns nothing.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null default public.current_person_id() references public.people(id) on delete cascade,
  thread text not null,
  body text not null,
  send_at timestamptz not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failed text,
  constraint scheduled_messages_thread check (thread ~ '^(household|family|dm:[0-9a-f-]{36}|group:[0-9a-f-]{36})$'),
  constraint scheduled_messages_body_length check (char_length(btrim(body)) between 1 and 2000),
  constraint scheduled_messages_send_at check (send_at <= created_at + interval '1 year')
);

create index if not exists scheduled_messages_due_idx on public.scheduled_messages (send_at) where sent_at is null;
create index if not exists scheduled_messages_person_idx on public.scheduled_messages (person_id, send_at);

alter table public.scheduled_messages enable row level security;

drop policy if exists scheduled_messages_select on public.scheduled_messages;
create policy scheduled_messages_select on public.scheduled_messages
  for select to authenticated using (person_id = (select public.current_person_id()));

drop policy if exists scheduled_messages_insert on public.scheduled_messages;
create policy scheduled_messages_insert on public.scheduled_messages
  for insert to authenticated with check (
    person_id = (select public.current_person_id())
    and send_at > now()
    and sent_at is null
    and failed is null
  );

drop policy if exists scheduled_messages_delete on public.scheduled_messages;
create policy scheduled_messages_delete on public.scheduled_messages
  for delete to authenticated using (person_id = (select public.current_person_id()) and sent_at is null);

revoke update on public.scheduled_messages from anon, authenticated;

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
        from public.push_targets('chat') t;
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
