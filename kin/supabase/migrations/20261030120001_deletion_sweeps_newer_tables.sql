-- A deleted account leaves nothing in the tables added since 22 October
-- (legal readiness, 29 October).
--
-- finalize_account_deletion (20261022160000) keeps the member row as
-- 'Former member' with no login, so nothing that cascades from members ever
-- fires, and it deletes a fixed list of tables by hand. Two tables made
-- after that list were never added to it, so a deleted person's rows stayed:
--
--   waiting_snoozes  what they put off on "Waiting on you"
--   feature_votes    their vote, with a free-text note (20261029233000)
--
-- (alarm_picks sweeps itself, 20261029100000; dose_alarm_tokens was dropped
-- on 28 October.)
--
-- The same trigger spending_budgets uses (20261026100000): when a member row
-- loses its login and stops being active, which is the moment the job makes
-- them a Former member, these go. A new table keyed to one member joins this
-- list, or carries its own trigger, in the migration that makes it.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create or replace function public.account_deletion_sweep_newer_tables()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.waiting_snoozes where member_id = new.id;
  delete from public.feature_votes where member_id = new.id;
  return new;
end;
$$;

revoke execute on function public.account_deletion_sweep_newer_tables() from public, anon, authenticated;

drop trigger if exists account_deletion_sweep_newer_tables on public.members;
create trigger account_deletion_sweep_newer_tables
  after update of auth_user_id on public.members
  for each row
  when (old.auth_user_id is not null and new.auth_user_id is null and new.status <> 'active')
  execute function public.account_deletion_sweep_newer_tables();
