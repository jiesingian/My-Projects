-- Running low (28 September): the last proactive reminder on the list.
--
-- The pantry only ever said "this is in the house". Now any item can be
-- marked running low with a tap. A low item shows on Today, can go onto the
-- shopping list in one tap, and clears itself when it is bought (ticked off
-- the list). Once a day, from 09:00, the grown-ups get one push naming what is
-- low and not already on the list -- their "Shopping list" switch.
--
-- The push runs on the reminder job that already exists
-- (20260926140000_reminders.sql): the same five-minute tick, the same shared
-- secret, the same once-only ledger (reminder_sends), a function of its own
-- rather than a rewrite of due_reminders(). Row-level security on
-- pantry_items is unchanged: the household reads and writes its own rows.

alter table public.pantry_items add column if not exists running_low boolean not null default false;
alter table public.pantry_items add column if not exists low_since timestamptz;

create or replace function public.due_pantry_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  expected text := kin_vault_secret('kin_cron_secret');
  local_now timestamp := p_now at time zone 'Asia/Manila';
  today date := (p_now at time zone 'Asia/Manila')::date;
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;
  if local_now::time < time '09:00' then
    return;
  end if;

  return query
  with low as (
    select p.family_id, string_agg(p.name, ', ' order by p.name) as names, count(*) as n
    from pantry_items p
    where p.running_low
      and not exists (
        select 1 from buy_items b
        where b.family_id = p.family_id and not b.checked and not b.cleared
          and lower(btrim(b.name)) = lower(btrim(p.name))
      )
    group by p.family_id
  ),
  candidates as (
    select 'pantry:' || l.family_id || ':' || today as key,
           l.family_id,
           array(select m.id from members m where m.family_id = l.family_id and m.status = 'active' and m.role in ('parent', 'adult')) as recipients,
           case when l.n = 1 then 'Running low: ' || l.names else 'Running low on ' || l.n || ' things' end as title,
           left(l.names, 140) || '. Tap to add them to the list.' as body,
           '/household?seg=buy' as url
    from low l
  ),
  fresh as (
    insert into reminder_sends (key)
    select c.key from candidates c where cardinality(c.recipients) > 0
    on conflict do nothing
    returning reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh f on f.key = c.key
  join push_subscriptions s on s.family_id = c.family_id and s.member_id = any (c.recipients)
  join members m on m.id = s.member_id
  where m.status = 'active' and coalesce((m.notification_prefs ->> 'shopping')::boolean, true);
end;
$$;

revoke all on function public.due_pantry_reminders(text, timestamptz) from public;
grant execute on function public.due_pantry_reminders(text, timestamptz) to anon, authenticated;
