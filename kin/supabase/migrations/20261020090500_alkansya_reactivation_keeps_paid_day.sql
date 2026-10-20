-- Alkansya: switching the weekly baon off and on again on a payday no longer
-- pays it twice (stabilisation pass, 20 October).
--
-- 20261019100000's alkansya_plans_start set paid_through to yesterday
-- whenever a plan was switched back on. On a payday the baon had already been
-- paid (paid_through = today), so off-then-on reset it to yesterday and the
-- next alkansya_pay_allowances() paid today again into every jar. Reactivation
-- now keeps the later of the two. Replaced from that body; the trigger and
-- its grants are as they were.

create or replace function public.alkansya_plans_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.paid_through := public.alkansya_household_today(new.family_id) - 1;
  elsif new.active and not old.active then
    -- Switched back on: from yesterday, but never before a day already paid,
    -- so off and on again on a payday does not pay that day twice.
    new.paid_through := greatest(old.paid_through, public.alkansya_household_today(new.family_id) - 1);
  elsif coalesce(current_setting('kin.alkansya_paying', true), 'off') <> 'on' then
    new.paid_through := old.paid_through;
  end if;
  return new;
end;
$$;
