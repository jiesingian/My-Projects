-- Bill reminders ahead of time (Janine, 7 October roadmap): a push and a
-- line on Today a set number of days before each bill is due, 3 unless the
-- bill says otherwise.
--
-- due_reminders() (20260929012000) already pushes the day before and on the
-- day; this adds the earlier one, so a bill with the default 3 is heard of
-- three days out, the day before, and on the day. A bill set to 1 day gets
-- nothing new -- the day before is already covered.
--
-- It runs on the same five-minute tick: /api/cron/reminders calls
-- due_bill_ahead_reminders() next to the others, with the same secret, the
-- same once-only ledger (reminder_sends) and the same "bills" switch in
-- Settings, Notifications. The grown-ups get it, as with every bill push.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.bills
  add column if not exists remind_days_before smallint not null default 3
  constraint bills_remind_days_before_check check (remind_days_before between 1 and 30);

create or replace function public.due_bill_ahead_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  expected text := public.kin_vault_secret('kin_cron_secret');
  local_now timestamp := p_now at time zone 'Asia/Manila';
  today date := (p_now at time zone 'Asia/Manila')::date;
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;
  -- From 09:00, like the day-before and on-the-day bill pushes.
  if local_now::time < time '09:00' then
    return;
  end if;

  return query
  with candidates as (
    select 'bill:' || b.id || ':' || b.due_date || ':ahead' as key,
           b.family_id,
           array(select m.id from public.members m where m.family_id = b.family_id and m.status = 'active' and m.role in ('parent', 'adult')) as recipients,
           b.name || ' is due in ' || b.remind_days_before || ' days' as title,
           'Due ' || to_char(b.due_date, 'FMDay FMDD Mon') || '. Tap to pay or mark it paid.' as body,
           '/wealth?seg=cashflow' as url
    from public.bills b
    where b.status <> 'paid' and b.paid_at is null
      and b.remind_days_before >= 2
      and b.due_date = today + b.remind_days_before
  ),
  fresh as (
    insert into public.reminder_sends (key)
    select c.key from candidates c where cardinality(c.recipients) > 0
    on conflict do nothing
    returning public.reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh f on f.key = c.key
  join public.push_subscriptions s on s.family_id = c.family_id and s.member_id = any (c.recipients)
  join public.members m on m.id = s.member_id
  where m.status = 'active' and coalesce((m.notification_prefs ->> 'bills')::boolean, true);
end;
$$;

-- Like every due_*() function: the cron route calls it with the anon key and
-- the secret is the guard, so anon keeps execute; without the secret it
-- returns nothing.
revoke all on function public.due_bill_ahead_reminders(text, timestamptz) from public;
grant execute on function public.due_bill_ahead_reminders(text, timestamptz) to anon, authenticated;
