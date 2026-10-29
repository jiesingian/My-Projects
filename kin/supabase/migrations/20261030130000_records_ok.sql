-- One OK before a person keeps health or money records in Kin (Jonathan, 29
-- October: legal readiness, "Box + ask at first entry", the second half).
--
-- Health records and money records are sensitive personal information under
-- the Data Privacy Act (section 13), and NPC Circular 2023-04 wants consent
-- that is specific to them rather than bundled into the terms. Family →
-- Health and Wealth each show one line saying what Kin keeps and that it can
-- be deleted at any time, with OK, until this person has said it there.
--
-- members.health_ok_at / money_ok_at: when they said OK. Set only through
-- set_records_ok, on the caller's own rows. Nothing is refused without it:
-- the line informs and records; it does not lock anyone out of their own
-- household's records.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.members add column if not exists health_ok_at timestamptz;
alter table public.members add column if not exists money_ok_at timestamptz;

create or replace function public.set_records_ok(p_area text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_area = 'health' then
    update public.members set health_ok_at = coalesce(health_ok_at, now()) where auth_user_id = auth.uid();
  elsif p_area = 'money' then
    update public.members set money_ok_at = coalesce(money_ok_at, now()) where auth_user_id = auth.uid();
  else
    raise exception 'unknown area';
  end if;
end;
$$;

revoke all on function public.set_records_ok(text) from public, anon;
grant execute on function public.set_records_ok(text) to authenticated;
