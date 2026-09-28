-- A Sunday "week ahead" push (agreed 28 September, item 8). About 7pm Manila
-- every Sunday, the grown-ups of a household get one push naming what the
-- coming Monday-to-Sunday holds:
--
--   The week ahead
--   Lia's recital Wed, Meralco due Thu, Lola Rosa's birthday Sun
--
-- WHAT IT COUNTS
--
-- The things a person plans a week around, not the things that repeat every
-- day: one-off plans (activities not completed or cancelled),
-- unpaid bills falling due, dated events, and yearly birthdays and
-- anniversaries that come round that week. Chores and other routines are
-- left out -- they are the same every week, and naming them would bury the
-- rest. At most five are named, in date order, then "+N more". A week with
-- nothing in it sends nothing.
--
-- HOW IT RUNS
--
-- On the reminder job that already exists (20260926140000_reminders.sql), as
-- a function of its own like due_pantry_reminders and due_trial_reminders:
-- the same five-minute tick, the same shared secret, the same once-only
-- ledger (reminder_sends, keyed by household and Sunday). It is open from
-- 19:00 to 21:59 so a missed tick is caught by the next one, and the ledger
-- keeps it to one push per household per Sunday.
--
-- Its own switch, "week_ahead" in members.notification_prefs, on unless a
-- member turns it off -- the same default every other switch has.
--
-- EXECUTE stays granted to anon, as with every due_* function: the cron
-- route calls it with the anon key and no session, and the function answers
-- nothing to a caller without the shared secret.

create or replace function public.due_week_ahead_reminders(p_secret text, p_now timestamptz default now())
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
  week_start date := today + 1;
  week_end date := today + 7;
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;
  -- Sundays (isodow 7), from 19:00 to before 22:00.
  if extract(isodow from today) <> 7 or local_now::time < time '19:00' or local_now::time >= time '22:00' then
    return;
  end if;

  return query
  with things as (
    -- One-off plans.
    select a.family_id, (a.start_at at time zone 'Asia/Manila')::date as on_day, a.title as label
    from activities a
    where (a.start_at at time zone 'Asia/Manila')::date between week_start and week_end
      and a.status not in ('completed', 'cancelled', 'done', 'skipped')
    union all
    -- Bills to pay.
    select b.family_id, b.due_date, b.name || ' due'
    from bills b
    where b.status <> 'paid' and b.paid_at is null
      and b.due_date between week_start and week_end
    union all
    -- Dated events that happen once.
    select e.family_id, e.event_date, e.title
    from events e
    where not e.recurs_yearly
      and e.event_date between week_start and week_end
    union all
    -- Birthdays and anniversaries, on this year's date. A 29 February one is
    -- kept on the 28th in a year without one.
    select e.family_id, d.day,
           case when e.kind = 'birthday' and e.title !~* 'birthday|bday|kaarawan' then e.title || '''s birthday'
                when e.kind = 'anniversary' and e.title !~* 'anniversary' then e.title || '''s anniversary'
                else e.title end
    from events e
    cross join lateral generate_series(week_start, week_end, interval '1 day') as g(ts)
    cross join lateral (select g.ts::date as day) d
    where e.recurs_yearly
      and (
        to_char(e.event_date, 'MM-DD') = to_char(d.day, 'MM-DD')
        or (to_char(e.event_date, 'MM-DD') = '02-29' and to_char(d.day, 'MM-DD') = '02-28'
            and to_char(d.day + 1, 'MM-DD') = '03-01')
      )
  ),
  ranked as (
    select t.family_id, t.label || ' ' || to_char(t.on_day, 'Dy') as line,
           row_number() over (partition by t.family_id order by t.on_day, t.label) as n,
           count(*) over (partition by t.family_id) as total
    from things t
  ),
  weeks as (
    select r.family_id,
           string_agg(r.line, ', ' order by r.n) filter (where r.n <= 5)
             || case when max(r.total) > 5 then ', +' || (max(r.total) - 5) || ' more' else '' end as lines
    from ranked r
    group by r.family_id
  ),
  candidates as (
    select 'week:' || w.family_id || ':' || today as key,
           w.family_id,
           array(select m.id from members m where m.family_id = w.family_id and m.status = 'active' and m.role in ('parent', 'adult')) as recipients,
           'The week ahead' as title,
           left(w.lines, 180) as body,
           '/planner' as url
    from weeks w
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
  where m.status = 'active' and coalesce((m.notification_prefs ->> 'week_ahead')::boolean, true);
end;
$$;

revoke all on function public.due_week_ahead_reminders(text, timestamptz) from public;
grant execute on function public.due_week_ahead_reminders(text, timestamptz) to anon, authenticated;
