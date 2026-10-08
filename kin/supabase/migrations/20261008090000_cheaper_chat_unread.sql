-- The Chat badge, cheaper (8 October).
--
-- my_chat_unread() runs on every page (the app layout's Chat badge), so it was
-- dev's single most expensive query: ~126 ms a call over 13,855 calls, on
-- chat tables of a few dozen kilobytes. Profiled as the QA account it spent
-- its time on three things, none of them counting:
--
--   * planning, ~12 ms every call -- a LANGUAGE sql function that cannot be
--     inlined is planned afresh each time (Postgres 17); PL/pgSQL keeps its
--     plan for the rest of the connection;
--   * a full scan of every household's family-room messages, running the
--     row-level check (own household, or families_are_linked()) on each row
--     before the 14-day window threw almost all of them away;
--   * a full scan of every household's group messages, running
--     is_group_member() on each.
--
-- Same answer, same rules, less work:
--
--   * each part now says "created in the last 14 days" in a form an index can
--     use, so only recent rows are read at all -- the window was already the
--     limit of what it counts;
--   * group messages are read from the viewer's own memberships, which is
--     exactly is_group_member() (a row in chat_group_members for
--     current_person_id()), through chat_group_messages_group_idx;
--   * chat_reads is read for the viewer only, which is its policy anyway.
--
-- Still SECURITY INVOKER: every table's row-level security still decides what
-- is counted; the new conditions only narrow what is read before it does.
-- The family-chat and groups PGlite probes check the counts unchanged.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create or replace function public.my_chat_unread()
returns table (thread text, unread bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := public.current_person_id();
  floor_at timestamptz := now() - interval '14 days';
begin
  return query
  with r as (
    select c.thread, c.last_read_at from public.chat_reads c where c.person_id = me
  )
  select 'family'::text, count(*)
  from public.family_tree_messages f
  where f.created_at > floor_at
    and f.created_at > coalesce((select r.last_read_at from r where r.thread = 'family'), floor_at)
    and f.person_id is distinct from me
  union all
  select x.thread, count(*)
  from (
    select 'dm:' || (case when d.person_low = me then d.person_high else d.person_low end)::text as thread, d.created_at
    from public.direct_messages d
    where (d.person_low = me or d.person_high = me)
      and d.created_at > floor_at
      and d.sender_person_id is distinct from me
  ) x
  where x.created_at > coalesce((select r.last_read_at from r where r.thread = x.thread), floor_at)
  group by x.thread
  union all
  select 'group:' || g.group_id::text, count(*)
  from public.chat_group_members m
  join public.chat_group_messages g on g.group_id = m.group_id and g.created_at > floor_at
  where m.person_id = me
    and g.sender_person_id is distinct from me
    and g.created_at > coalesce((select r.last_read_at from r where r.thread = 'group:' || g.group_id::text), floor_at)
  group by g.group_id;
end;
$$;

revoke all on function public.my_chat_unread() from public, anon;
grant execute on function public.my_chat_unread() to authenticated;
