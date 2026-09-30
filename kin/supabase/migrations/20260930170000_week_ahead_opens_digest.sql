-- The Sunday "week ahead" push (20260928221500) opens the family's week
-- (/today/week) rather than the Planner (Jonathan, 30 September: build the
-- weekly digest on the week-ahead push). The page shows the week just gone
-- and the one coming, by the same who-sees-what rule this function already
-- uses for its lines.
--
-- The function is as 20260929012000_reminders_for_me.sql left it, with the
-- url as its only change.

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
  with grownups as (
    select m.id, m.family_id from members m where m.status = 'active' and m.role in ('parent', 'adult')
  ),
  things as (
    -- One-off plans, with who they are for.
    select a.family_id, (a.start_at at time zone 'Asia/Manila')::date as on_day, a.title as label,
           a.applies_to_whole_family as whole,
           array(select am.member_id from activity_members am where am.activity_id = a.id) as tagged
    from activities a
    where (a.start_at at time zone 'Asia/Manila')::date between week_start and week_end
      and a.status not in ('completed', 'cancelled', 'done', 'skipped')
    union all
    -- Bills to pay: the household's, so every grown-up's.
    select b.family_id, b.due_date, b.name || ' due', true, '{}'::uuid[]
    from bills b
    where b.status <> 'paid' and b.paid_at is null
      and b.due_date between week_start and week_end
    union all
    -- Dated events that happen once, with who they are for.
    select e.family_id, e.event_date, e.title,
           e.applies_to_whole_family,
           array(select em.member_id from event_members em where em.event_id = e.id)
    from events e
    where not e.recurs_yearly
      and e.event_date between week_start and week_end
    union all
    -- Birthdays and anniversaries, on this year's date: everyone's to
    -- remember. A 29 February one is kept on the 28th in a year without one.
    select e.family_id, d.day,
           case when e.kind = 'birthday' and e.title !~* 'birthday|bday|kaarawan' then e.title || '''s birthday'
                when e.kind = 'anniversary' and e.title !~* 'anniversary' then e.title || '''s anniversary'
                else e.title end,
           true, '{}'::uuid[]
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
  -- Each grown-up's own week: what is for the whole family, for nobody in
  -- particular, for them, or for one of the children -- never another
  -- grown-up's own plans (lib/for-me.ts, the same rule Today uses).
  mine as (
    select g.id as member_id, t.family_id, t.on_day, t.label
    from things t
    join grownups g on g.family_id = t.family_id
    where t.whole
       or cardinality(t.tagged) = 0
       or g.id = any (t.tagged)
       or exists (select 1 from members c where c.id = any (t.tagged) and c.role in ('child_managed', 'child_self'))
  ),
  ranked as (
    select t.member_id, t.family_id, t.label || ' ' || to_char(t.on_day, 'Dy') as line,
           row_number() over (partition by t.member_id order by t.on_day, t.label) as n,
           count(*) over (partition by t.member_id) as total
    from mine t
  ),
  weeks as (
    select r.member_id, r.family_id,
           string_agg(r.line, ', ' order by r.n) filter (where r.n <= 5)
             || case when max(r.total) > 5 then ', +' || (max(r.total) - 5) || ' more' else '' end as lines
    from ranked r
    group by r.member_id, r.family_id
  ),
  candidates as (
    select 'week:' || w.member_id || ':' || today as key,
           w.family_id,
           array[w.member_id] as recipients,
           'The week ahead' as title,
           left(w.lines, 180) as body,
           '/today/week' as url
    from weeks w
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
  join push_subscriptions s on s.family_id = c.family_id and s.member_id = any (c.recipients)
  join members m on m.id = s.member_id
  where m.status = 'active' and coalesce((m.notification_prefs ->> 'week_ahead')::boolean, true);
end;
$$;

revoke all on function public.due_week_ahead_reminders(text, timestamptz) from public;
grant execute on function public.due_week_ahead_reminders(text, timestamptz) to anon, authenticated;
