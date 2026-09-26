-- The chat's live channels go private (26 September), so Realtime's "Allow
-- public access" can be switched off.
--
-- 20260926090000_call_signalling.sql made the call channel private, and noted
-- the catch: Supabase only enforces private channels once public access is
-- off, and the chat still used public ones -- "family-chat:<family id>" for
-- the household chat's live refresh and typing dots, "family-link:<link id>"
-- for a chat with a linked household. Anyone with the public key and a
-- household's id could join the first and watch who was typing when; the
-- messages themselves were always behind the tables' own row-level security.
--
-- These two policies are who may use those topics once they are private:
--   * family-chat:<id> -- a member of that household.
--   * family-link:<id> -- a member of either household on that link, while
--     the link is accepted.
-- Broadcast and presence both (the chat's typing dots are broadcast); the
-- rows that change arrive through postgres_changes, which Realtime filters by
-- the tables' own policies as before.

create or replace function public.chat_topic_is_mine(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic = 'family-chat:' || current_family_id()::text then true
    when p_topic like 'family-link:%' then exists (
      select 1 from family_links l
      where l.id::text = substr(p_topic, length('family-link:') + 1)
        and l.status = 'accepted'
        and current_family_id() in (l.requester_family_id, l.addressee_family_id)
    )
    else false
  end
$$;

revoke all on function public.chat_topic_is_mine(text) from public;
grant execute on function public.chat_topic_is_mine(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages is missing; chat channel policies not created';
    return;
  end if;

  execute 'drop policy if exists kin_chat_receive on realtime.messages';
  execute $p$
    create policy kin_chat_receive on realtime.messages
      for select to authenticated
      using (extension in ('broadcast', 'presence') and (select public.chat_topic_is_mine(realtime.topic())))
  $p$;

  execute 'drop policy if exists kin_chat_send on realtime.messages';
  execute $p$
    create policy kin_chat_send on realtime.messages
      for insert to authenticated
      with check (extension in ('broadcast', 'presence') and (select public.chat_topic_is_mine(realtime.topic())))
  $p$;
end
$$;
