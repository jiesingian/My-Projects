-- Pin a message in the family room, one to one and groups (Jonathan,
-- 30 September -- "competitive with Telegram", item 4). The household chat has
-- had its pin since 20260923 (family_chat_pins).
--
-- A pin is two columns on the message itself -- when, and by whom (a first
-- name, set from the caller, never from the client) -- rather than a table of
-- its own: a pin can only ever point at a message that exists, disappears with
-- it, and is readable by exactly the people who can read the message, under
-- that table's own select policy. Several messages can be pinned; the thread
-- shows the most recently pinned one at the top, as Telegram does.
--
-- Pinning changes a row the pinner usually did not write, which the update
-- policies (20260930150100) rightly refuse. So it goes through one definer
-- function, pin_chat_message(kind, id, pinned), which asks who may:
--
--   family   -- anyone who can read the message (their household or a linked
--               one), the family room's own line;
--   dm       -- either of the two people;
--   group    -- any member; in an announcement channel, admins only.
--
-- A removed message cannot be pinned. The trigger from 20260930150100 still
-- runs on these updates and leaves body, edited_at and deleted_at alone.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.family_tree_messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by text;
alter table public.direct_messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by text;
alter table public.chat_group_messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by text;

create or replace function public.pin_chat_message(p_kind text, p_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_person_id();
  fam uuid := public.current_family_id();
  who text;
  allowed boolean := false;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_kind = 'family' then
    select true into allowed from public.family_tree_messages m
      where m.id = p_id and m.deleted_at is null
        and (m.family_id = fam or public.families_are_linked(m.family_id, fam));
  elsif p_kind = 'dm' then
    select true into allowed from public.direct_messages d
      where d.id = p_id and d.deleted_at is null and me in (d.person_low, d.person_high);
  elsif p_kind = 'group' then
    select true into allowed from public.chat_group_messages g
      join public.chat_groups c on c.id = g.group_id
      where g.id = p_id and g.deleted_at is null
        and public.is_group_member(g.group_id)
        and (not c.announce_only or public.is_group_admin(g.group_id));
  end if;
  if not coalesce(allowed, false) then
    raise exception 'That message can''t be pinned here.' using errcode = '42501';
  end if;

  who := split_part(coalesce((select m.full_name from public.members m where m.id = public.current_member_id()), ''), ' ', 1);

  if p_kind = 'family' then
    update public.family_tree_messages
      set pinned_at = case when p_pinned then now() end, pinned_by = case when p_pinned then nullif(who, '') end
      where id = p_id;
  elsif p_kind = 'dm' then
    update public.direct_messages
      set pinned_at = case when p_pinned then now() end, pinned_by = case when p_pinned then nullif(who, '') end
      where id = p_id;
  else
    update public.chat_group_messages
      set pinned_at = case when p_pinned then now() end, pinned_by = case when p_pinned then nullif(who, '') end
      where id = p_id;
  end if;
end;
$$;

revoke execute on function public.pin_chat_message(text, uuid, boolean) from public, anon;
grant execute on function public.pin_chat_message(text, uuid, boolean) to authenticated;
