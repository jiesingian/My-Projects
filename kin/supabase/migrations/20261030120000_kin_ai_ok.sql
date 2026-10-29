-- Kin AI asks each person once before anything of theirs goes to Anthropic
-- (Jonathan, 29 October: legal readiness, "Ask once per person").
--
-- Ask Kin, the flyer and screenshot scan, reading a bank statement and the
-- chat catch-up all send household records to Claude, a third-party AI. App
-- Review 5.1.2(i) asks for the person's explicit permission first, and the
-- Data Privacy Act asks consent for the health and money records among them.
--
-- members.kin_ai_ok_at: when this person said yes; null means not asked yet,
-- or taken back. Set only through set_kin_ai_ok, for the caller's own rows,
-- and read through kin_ai_ok(), which lib/kin-ai-allowance.ts asks before it
-- counts a use, so no screen can skip it.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.members add column if not exists kin_ai_ok_at timestamptz;

create or replace function public.kin_ai_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_or(m.kin_ai_ok_at is not null), false)
  from public.members m
  where m.auth_user_id = auth.uid() and m.status = 'active';
$$;

create or replace function public.set_kin_ai_ok(p_ok boolean)
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
  update public.members
     set kin_ai_ok_at = case when p_ok then now() else null end
   where auth_user_id = auth.uid();
end;
$$;

revoke all on function public.kin_ai_ok() from public, anon;
revoke all on function public.set_kin_ai_ok(boolean) from public, anon;
grant execute on function public.kin_ai_ok() to authenticated;
grant execute on function public.set_kin_ai_ok(boolean) to authenticated;
