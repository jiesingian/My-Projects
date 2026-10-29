-- A remittance logged on a weak signal can be retried safely (29 October).
--
-- The app's remittance forms caught "Load failed" (a weak signal, the answer
-- lost on its way back) but could only say "check before trying again": a
-- second try logged the money a second time. Every other money save now
-- carries an id made on the phone at its first try (kin/src/lib/ledger-ids);
-- this gives log_remittance the same, as p_client_id. Given, it is the
-- remittance's own id, so a retry finds the first and returns it.
--
-- A new last parameter with a default: the old sixteen-argument function is
-- dropped first, since both side by side would make every call ambiguous.
-- A call without the id (the build still deployed while this runs) works as
-- before. Everything else is unchanged from 20260930130000_remittance_log.sql.

drop function if exists public.log_remittance(uuid, text, uuid, numeric, text, date, numeric, date, text, numeric, text, text, uuid, text, boolean, jsonb);

create or replace function public.log_remittance(
  p_sender_member_id uuid,
  p_sender_name text,
  p_receiver_member_id uuid,
  p_amount numeric,
  p_currency text,
  p_sent_on date,
  p_ecb_rate numeric,
  p_ecb_rate_date date,
  p_rate_source text,
  p_php_received numeric,
  p_channel text,
  p_channel_name text,
  p_account_id uuid,
  p_note text,
  p_is_private boolean,
  p_allocations jsonb,
  p_client_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_family uuid := public.current_family_id();
  v_me uuid := public.current_member_id();
  v_id uuid := coalesce(p_client_id, gen_random_uuid());
  v_tx uuid;
  v_sender text;
  v_alloc_total numeric := 0;
  a jsonb;
begin
  if v_family is null or v_me is null then
    raise exception 'not signed in to a household' using errcode = '42501';
  end if;

  -- Logged already by an earlier try of this same remittance (a retry after
  -- an answer lost to a weak signal): that one stands, and nothing is
  -- logged twice. Two tries at once meet at the primary key instead
  -- (23505), which the app reads the same way.
  if p_client_id is not null and exists (select 1 from public.remittances where id = p_client_id and family_id = v_family) then
    return p_client_id;
  end if;

  if p_allocations is not null and jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'allocations must be a list' using errcode = '22023';
  end if;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into v_alloc_total
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) x;
  if v_alloc_total > p_php_received then
    raise exception 'remittance_over_allocated: what it went to adds up to more than arrived' using errcode = 'P0001';
  end if;

  -- The remittance first, so a refusal on it (a child, a stranger's
  -- account) stops everything before any money moves.
  insert into public.remittances (
    id, family_id, sender_member_id, sender_name, receiver_member_id, amount, currency, sent_on,
    ecb_rate, ecb_rate_date, rate_source, php_received, channel, channel_name, account_id,
    note, is_private, recorded_by
  ) values (
    v_id, v_family, p_sender_member_id, nullif(btrim(p_sender_name), ''), p_receiver_member_id, p_amount, upper(p_currency), p_sent_on,
    p_ecb_rate, p_ecb_rate_date, p_rate_source, p_php_received, p_channel, nullif(btrim(p_channel_name), ''), p_account_id,
    nullif(btrim(p_note), ''), coalesce(p_is_private, false), v_me
  );

  if p_account_id is not null then
    select coalesce(nullif(btrim(p_sender_name), ''), m.full_name, 'abroad')
      into v_sender
      from (select 1) one
      left join public.members m on m.id = p_sender_member_id;
    insert into public.wealth_transactions (
      family_id, account_id, direction, amount, particulars, category, occurred_at, status,
      source_table, source_id, recorded_by
    ) values (
      v_family, p_account_id, 'in', p_php_received,
      left('Remittance from ' || split_part(v_sender, ' ', 1), 150), 'Remittance',
      (p_sent_on::timestamp + time '12:00') at time zone 'Asia/Manila', 'confirmed',
      'remittances', v_id, v_me
    )
    returning id into v_tx;
    update public.remittances set transaction_id = v_tx where id = v_id;
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    insert into public.remittance_allocations (remittance_id, family_id, purpose, amount, category)
    values (v_id, v_family, btrim(a ->> 'purpose'), (a ->> 'amount')::numeric, nullif(btrim(a ->> 'category'), ''));
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.log_remittance(uuid, text, uuid, numeric, text, date, numeric, date, text, numeric, text, text, uuid, text, boolean, jsonb, uuid) from public, anon;
grant execute on function public.log_remittance(uuid, text, uuid, numeric, text, date, numeric, date, text, numeric, text, text, uuid, text, boolean, jsonb, uuid) to authenticated;
