-- Voice and video calls in Chat: who may hear a call being set up.
--
-- A call is phone to phone (WebRTC): the sound and picture go directly
-- between the two devices, encrypted by the browsers, and never pass through
-- Kin. What does pass through is the setting-up -- "Quinn is calling Robin",
-- "Robin answered", and the offer and answer each browser writes to describe
-- how to reach it. Those travel as Realtime broadcasts on one channel per
-- household, `call:<family id>`.
--
-- Until now every broadcast in the app used a public channel: anyone holding
-- the public anon key and a channel's name could join it. For the chat's
-- typing dots that is harmless. For calls it is not -- a stranger on the
-- channel could answer a call meant for somebody else, or feed a caller a
-- forged answer and sit in the middle. So call channels are private, and
-- these two policies are the whole of who may use one: a signed-in member,
-- on their own household's call channel, and nothing else. No channel name
-- is guessable into access; the policy compares it with the caller's own
-- household, which the database works out from their login.
--
-- realtime.messages is Supabase's own table for this (Realtime
-- Authorization). The guard lets the file run on a database without it
-- rather than fail the pipeline; there, private channels refuse to join and
-- calls say they could not connect.

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages is missing; call signalling policies not created';
    return;
  end if;

  execute 'drop policy if exists kin_call_signal_receive on realtime.messages';
  execute $p$
    create policy kin_call_signal_receive on realtime.messages
      for select to authenticated
      using (
        extension = 'broadcast'
        and (select realtime.topic()) = 'call:' || (select public.current_family_id())::text
      )
  $p$;

  execute 'drop policy if exists kin_call_signal_send on realtime.messages';
  execute $p$
    create policy kin_call_signal_send on realtime.messages
      for insert to authenticated
      with check (
        extension = 'broadcast'
        and (select realtime.topic()) = 'call:' || (select public.current_family_id())::text
      )
  $p$;
end
$$;
