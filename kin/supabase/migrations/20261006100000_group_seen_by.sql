-- "Seen by Mama, Lola" in groups (Jonathan, 30 September -- "competitive with
-- Telegram", item 5).
--
-- The household chat has had seen-by since 20260923 (family_message_reads);
-- one to one has "Seen" (dm_seen_at, 20260929161000). A group asks the same
-- question of chat_reads ('group:<id>'), which is readable only by its own
-- person -- so, as with dm_seen_at, a definer function answers it, and only
-- for a group the caller is in: each other member's first name and when they
-- last opened the group. Nothing else about them, and nothing for a group
-- the caller is not a member of.
--
-- The family room stays without seen-by (20260929161000 said why: it reaches
-- too many households for "seen by" to mean anything).
--
-- Typing needs nothing here: presence on the private channels was allowed by
-- 20260926130000 (kin_chat_receive / kin_chat_send, extension 'presence').
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create or replace function public.group_seen_by(p_group uuid)
returns table (person_id uuid, first_name text, last_read_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select gm.person_id,
         split_part(coalesce(m.full_name, ''), ' ', 1),
         r.last_read_at
  from public.chat_group_members gm
  join public.chat_reads r on r.person_id = gm.person_id and r.thread = 'group:' || p_group::text
  left join lateral (
    select mm.full_name from public.members mm
    where mm.person_id = gm.person_id and mm.status = 'active'
    order by mm.created_at limit 1
  ) m on true
  where gm.group_id = p_group
    and gm.person_id <> public.current_person_id()
    and public.is_group_member(p_group);
$$;

revoke execute on function public.group_seen_by(uuid) from public, anon;
grant execute on function public.group_seen_by(uuid) to authenticated;
