-- Medicines: an update cannot take a medicine over (review of 28 September).
--
-- health_medicines_update checked only that the row stayed in the household
-- and on one of its members. Anyone who could see a 'family' medicine could
-- therefore rewrite created_by to themselves and set visibility 'private',
-- hiding it -- and its dose ticks -- from the parents, or set 'parents',
-- which a non-parent could never insert.
--
-- Two rules now, matching the insert policy:
--   * who created a medicine never changes (a trigger keeps the old value),
--   * only its creator may change who can see it, and only a parent may set
--     'parents' (the policy's WITH CHECK).
-- The trigger only assigns and never raises, so it answers nothing about
-- rows the caller cannot see; SECURITY INVOKER, like the reply trigger fix
-- of 23 September.

create or replace function public.keep_medicine_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.created_by := old.created_by;
  if new.visibility is distinct from old.visibility
     and old.created_by is distinct from (select current_member_id()) then
    new.visibility := old.visibility;
  end if;
  return new;
end;
$$;

drop trigger if exists health_medicines_keep_owner on public.health_medicines;
create trigger health_medicines_keep_owner
  before update on public.health_medicines
  for each row execute function public.keep_medicine_owner();

drop policy if exists health_medicines_update on public.health_medicines;
create policy health_medicines_update on public.health_medicines for update to authenticated
  using (health_can_see(family_id, member_id, visibility, created_by))
  with check (
    family_id = (select current_family_id())
    and exists (select 1 from members m where m.id = member_id and m.family_id = (select current_family_id()))
    and (visibility <> 'parents' or (select current_member_role()) = 'parent')
  );

-- ── reminders: a delivery that failed is tried again ───────────────────────
--
-- due_reminders() marks a reminder sent before Kin's route delivers it, so a
-- push service that answered 429 or 5xx, or a route that timed out, lost that
-- dose or bill for good. The route now hands back the key of a reminder that
-- reached nobody, and this forgets it, so the next five-minute tick sends it
-- again. Same shared secret as the rest of the reminder functions.

create or replace function public.cron_retry_reminder(p_secret text, p_key text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  expected text := kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;
  delete from reminder_sends where key = p_key;
end;
$$;
revoke all on function public.cron_retry_reminder(text, text) from public;
grant execute on function public.cron_retry_reminder(text, text) to anon, authenticated;
