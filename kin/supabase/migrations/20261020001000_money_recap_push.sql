-- The monthly money recap push (Kin Free feature, approved 19 October)
-- ===================================================================
--
-- On the 1st, from 08:00 to before 22:00 in the household's own zone, each
-- grown-up hears that last month's money recap is ready, and the push opens
-- it (/wealth/recap?month=YYYY-MM).
--
-- The push names the month and nothing else -- no amount, no category, no
-- account. This function runs as its owner and could read every account in
-- the household, including a grown-up's "Just me" one, so it says nothing
-- that only some grown-ups may see. The figures are worked out on the recap
-- page, in the reader's own session, where row-level security, per-account
-- visibility and their "leave my private accounts out" choice all apply
-- (lib/money-recap.ts).
--
-- Only households that have Wealth (family_has_plus: Wealth is Kin Plus at
-- the database) and recorded money last month hear it; an empty recap is
-- not news. Opt out per grown-up with notification_prefs.money_recap.
-- Once per grown-up per month: reminder_sends key recap:<member>:<YYYY-MM>.

create or replace function public.due_money_recap_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  expected text := kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  return query
  with zones as (
    select hc.family_id, hc.tz,
           (date_trunc('month', hc.today) - interval '1 month')::date as month_start,
           date_trunc('month', hc.today)::date as month_end
    from household_clock(p_now) hc
    where extract(day from hc.today) = 1
      and hc.local_now::time >= time '08:00' and hc.local_now::time < time '22:00'
  ),
  households as (
    select z.family_id, z.month_start
    from zones z
    where family_has_plus(z.family_id)
      and exists (
        select 1 from wealth_transactions t
        where t.family_id = z.family_id
          and t.status = 'confirmed'
          and (t.occurred_at at time zone z.tz)::date >= z.month_start
          and (t.occurred_at at time zone z.tz)::date < z.month_end
      )
  ),
  candidates as (
    select 'recap:' || m.id || ':' || to_char(h.month_start, 'YYYY-MM') as key,
           h.family_id,
           m.id as recipient,
           'Your ' || trim(to_char(h.month_start, 'FMMonth')) || ' money recap' as title,
           'Spending against budget, bills, savings and net worth, in one page.' as body,
           '/wealth/recap?month=' || to_char(h.month_start, 'YYYY-MM') as url
    from households h
    join members m on m.family_id = h.family_id
    where m.status = 'active' and m.role in ('parent', 'adult')
      and coalesce((m.notification_prefs ->> 'money_recap')::boolean, true)
  ),
  fresh as (
    insert into reminder_sends (key)
    select c.key from candidates c
    on conflict do nothing
    returning reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh f on f.key = c.key
  join push_subscriptions s on s.family_id = c.family_id and s.member_id = c.recipient;
end;
$$;

revoke execute on function public.due_money_recap_reminders(text, timestamptz) from public;
grant execute on function public.due_money_recap_reminders(text, timestamptz) to anon, authenticated;
