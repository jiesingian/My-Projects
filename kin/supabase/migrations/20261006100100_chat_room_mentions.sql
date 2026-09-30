-- @mentions that notify, in every conversation (Jonathan, 30 September --
-- "competitive with Telegram", item 6).
--
-- The household chat has stored mentions since 20260923 (family_messages.
-- mentions, member ids) but told nobody. The family room, one to one and
-- groups had none. Now:
--
-- 1. mentions uuid[] (person ids) on the three room tables, so the thread
--    can light up a message that names you. At most 20. Who may be named is
--    the server action's business; naming someone who cannot read the room
--    gives them nothing, because a notification only ever goes to the room's
--    own people (below).
--
-- 2. chat_push_targets_mentioning(thread, people) -- chat_push_targets
--    (20260929162000: the room's own people, chat notifications on, the room
--    not muted), with a flag on each device saying whether its person was
--    named. The action sends "Mama mentioned you" to the flagged devices and
--    the ordinary message to the rest, so nobody gets both. A muted room, or
--    chat notifications turned off, stays silent for mentions too: that is
--    what muting means here.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.family_tree_messages add column if not exists mentions uuid[] not null default '{}';
alter table public.direct_messages add column if not exists mentions uuid[] not null default '{}';
alter table public.chat_group_messages add column if not exists mentions uuid[] not null default '{}';

alter table public.family_tree_messages drop constraint if exists family_tree_messages_mentions_count;
alter table public.family_tree_messages add constraint family_tree_messages_mentions_count check (cardinality(mentions) <= 20);
alter table public.direct_messages drop constraint if exists direct_messages_mentions_count;
alter table public.direct_messages add constraint direct_messages_mentions_count check (cardinality(mentions) <= 20);
alter table public.chat_group_messages drop constraint if exists chat_group_messages_mentions_count;
alter table public.chat_group_messages add constraint chat_group_messages_mentions_count check (cardinality(mentions) <= 20);

create or replace function public.chat_push_targets_mentioning(p_thread text, p_people uuid[])
returns table (endpoint text, p256dh text, auth text, mentioned boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (t.endpoint) t.endpoint, t.p256dh, t.auth,
         coalesce(m.person_id = any (coalesce(p_people, '{}'::uuid[])), false)
  from public.chat_push_targets(p_thread) t
  left join public.push_subscriptions s on s.endpoint = t.endpoint
  left join public.members m on m.id = s.member_id
  order by t.endpoint;
$$;

revoke execute on function public.chat_push_targets_mentioning(text, uuid[]) from public, anon;
grant execute on function public.chat_push_targets_mentioning(text, uuid[]) to authenticated;
