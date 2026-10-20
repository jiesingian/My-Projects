-- Steps in the goals game (Janine, 20 October)
-- ============================================
--
-- A daily steps goal per person, and a weekly family steps total, in the
-- game of 20261020120000. Kin Plus only, as steps goals already are (the
-- require_kin_plus trigger on planner_goals is unchanged).
--
-- Where steps live: health_vitals, as they already do -- one reading per
-- person per day per source ('manual' typed in, 'apple_health' from the
-- Shortcut, any app added later with its own source). A day's steps are the
-- largest reading of each source, then the larger of the sources: never a
-- sum, so a walk is not counted twice. Nothing here stores a step total.
--
-- Which readings count for the game: anything a sync sent, and a typed one
-- only when its owner typed it -- or, for a child with no login, a grown-up
-- of the house. A sibling typing steps in for someone else earns nobody
-- anything (game_steps below).
--
-- Partial credit. A claim now has a part:
--   whole  every goal there was before -- the whole worth at once
--   half   a steps game goal at 50% of its target: half the XP and coins
--   rest   the same goal at 100%: the other half (15 XP is 7 + 8)
-- A steps game goal takes only half and rest; every other goal only whole.
-- For a streak and the all-dailies bonus a day's steps goal is done only at
-- 100% (a 'rest' claim).
--
-- Credit without anyone pressing anything. Closing a day, the job also
-- settles every daily steps goal from that day's readings -- the half and
-- the rest it reached and nobody claimed yet. So steps a sync sends later
-- earn the same as typed ones, with nothing to change here or in the app.
-- A claim the job makes for a child with their own login still waits for a
-- grown-up's yes, like their own.
--
-- The family total: a household steps goal, weekly, whose progress is every
-- member's days added up. When the week reaches its target, everyone with a
-- game goal gets 50 XP and 25 coins, once that week (game_awards
-- 'family_steps', dated the week's first day).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- 1. Steps may be a game goal ----------------------------------------------------

alter table public.planner_goals drop constraint if exists planner_goals_category_check;
alter table public.planner_goals
  add constraint planner_goals_category_check check (
    category is null
    or (
      category in ('water', 'move', 'food', 'sleep', 'hygiene', 'family')
      and (
        -- Habits counted by taps.
        (kind in ('custom', 'gym') and period in ('day', 'week'))
        -- A person's daily steps, or the household's weekly total.
        or (kind = 'steps' and ((period = 'day' and owner_member_id is not null) or (period = 'week' and owner_member_id is null)))
      )
    )
  );

-- 2. A claim has a part ------------------------------------------------------------

alter table public.planner_goal_completions add column if not exists part text not null default 'whole';

alter table public.planner_goal_completions drop constraint if exists planner_goal_completions_part_check;
alter table public.planner_goal_completions
  add constraint planner_goal_completions_part_check check (part in ('whole', 'half', 'rest'));

-- One claim per goal, period and part (was: per goal and period).
alter table public.planner_goal_completions drop constraint if exists planner_goal_completions_once;
alter table public.planner_goal_completions
  add constraint planner_goal_completions_once unique (goal_id, period_start, part);

-- The same function as 20261020120000, now with the part: what a claim is
-- worth is still the goal's, never the client's.
create or replace function public.planner_goal_completions_fix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
begin
  if tg_op = 'INSERT' then
    select pg.points, pg.xp, pg.kind, pg.category into g from public.planner_goals pg where pg.id = new.goal_id;
    if (g.kind = 'steps' and g.category is not null) <> (new.part in ('half', 'rest')) then
      raise exception 'A steps game goal is claimed in halves; every other goal whole.' using errcode = 'P0001';
    end if;
    new.points := case new.part
      when 'half' then coalesce(g.points, 0) / 2
      when 'rest' then coalesce(g.points, 0) - coalesce(g.points, 0) / 2
      else coalesce(g.points, 0) end;
    new.xp := case new.part
      when 'half' then coalesce(g.xp, 0) / 2
      when 'rest' then coalesce(g.xp, 0) - coalesce(g.xp, 0) / 2
      else coalesce(g.xp, 0) end;
    new.status := case when coalesce(public.current_member_role(), '') in ('parent', 'adult') then 'counted' else 'pending' end;
    new.decided_by := null;
    new.decided_at := null;
    new.created_at := now();
    return new;
  end if;
  if new.goal_id is distinct from old.goal_id
     or new.member_id is distinct from old.member_id
     or new.family_id is distinct from old.family_id
     or new.period_start is distinct from old.period_start
     or new.part is distinct from old.part
     or new.points is distinct from old.points
     or new.xp is distinct from old.xp
     or new.created_at is distinct from old.created_at then
    raise exception 'A claim keeps what it was for.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goal_completions_fix() from public, anon, authenticated;

-- 3. A day's steps, as the game counts them ------------------------------------------

create or replace function public.game_steps(p_member uuid, p_day date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with readings as (
    select v.source,
           max(nullif(regexp_replace(v.value_text, '[^0-9.]', '', 'g'), '')::numeric) as value
      from public.health_vitals v
      join public.members m on m.id = v.member_id
     where v.member_id = p_member
       and v.vital_type = 'steps'
       and v.reading_date = p_day
       and (
         v.source <> 'manual'
         or v.created_by = p_member
         or (
           m.role = 'child_managed'
           and exists (
             select 1 from public.members g
              where g.id = v.created_by and g.family_id = m.family_id and g.role in ('parent', 'adult')
           )
         )
       )
     group by v.source
  )
  select coalesce(max(value), 0)::integer from readings;
$$;

revoke execute on function public.game_steps(uuid, date) from public, anon, authenticated;

-- What the game screens show: each day's steps of the members of the
-- caller's household who have a steps game goal the caller can see, and the
-- household's total -- nothing else of anyone's readings.
create or replace function public.game_steps_days(p_from date, p_to date)
returns table (member_id uuid, day date, steps integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, d::date, public.game_steps(m.id, d::date)
    from public.members m
    cross join generate_series(p_from, least(p_to, p_from + 62), interval '1 day') d
   where m.family_id = public.current_family_id()
     and exists (
       select 1 from public.planner_goals g
        where g.owner_member_id = m.id and g.kind = 'steps' and g.category is not null and g.active
          and public.planner_goal_visible(g.id)
     );
$$;

revoke execute on function public.game_steps_days(date, date) from public, anon;
grant execute on function public.game_steps_days(date, date) to authenticated;

create or replace function public.game_family_steps_total(p_family uuid, p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(public.game_steps(m.id, d::date)), 0)::integer
    from public.members m
    cross join generate_series(p_from, least(p_to, p_from + 6), interval '1 day') d
   where m.family_id = p_family
     and m.status not in ('pending', 'removed');
$$;

revoke execute on function public.game_family_steps_total(uuid, date, date) from public, anon, authenticated;

create or replace function public.game_family_steps(p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.game_family_steps_total(public.current_family_id(), p_from, p_to);
$$;

revoke execute on function public.game_family_steps(date, date) from public, anon;
grant execute on function public.game_family_steps(date, date) to authenticated;

-- The first day of the household's week that p_day is in (its Week starts
-- on setting: Monday, or Sunday as the app has it otherwise).
create or replace function public.game_week_start(p_family uuid, p_day date)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce((select to_jsonb(f) ->> 'week_start' from public.families f where f.id = p_family), '') = 'monday'
    then p_day - (extract(isodow from p_day)::int - 1)
    else p_day - (extract(dow from p_day)::int)
  end;
$$;

revoke execute on function public.game_week_start(uuid, date) from public, anon, authenticated;

-- 4. Settling steps from the readings ----------------------------------------------------

-- The halves a day's steps reached, for one daily steps goal, that nobody has
-- claimed yet. A grown-up's own, or a no-login child's, counts at once; a
-- child with a login waits for a yes, as their own claim would.
create or replace function public.game_settle_steps(p_goal uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
  v_steps integer;
  v_role text;
  v_part text;
begin
  select pg.id, pg.family_id, pg.owner_member_id, pg.target into g
    from public.planner_goals pg
   where pg.id = p_goal and pg.kind = 'steps' and pg.category is not null and pg.period = 'day' and pg.active;
  if not found then
    return;
  end if;
  v_steps := public.game_steps(g.owner_member_id, p_day);
  select m.role into v_role from public.members m where m.id = g.owner_member_id;
  foreach v_part in array array['half', 'rest'] loop
    continue when v_steps < case v_part when 'half' then g.target / 2.0 else g.target end;
    insert into public.planner_goal_completions (family_id, goal_id, member_id, period_start, part)
    values (g.family_id, g.id, g.owner_member_id, p_day, v_part)
    on conflict do nothing;
    if found and v_role in ('parent', 'adult', 'child_managed') then
      update public.planner_goal_completions set status = 'counted'
       where goal_id = g.id and period_start = p_day and part = v_part and status = 'pending';
    end if;
  end loop;
end;
$$;

revoke execute on function public.game_settle_steps(uuid, date) from public, anon, authenticated;

-- 5. Closing a day: the same as 20261020120000, plus steps --------------------------------

alter table public.game_awards drop constraint if exists game_awards_kind_check;
alter table public.game_awards
  add constraint game_awards_kind_check check (kind in ('all_dailies', 'whole_family', 'family_steps'));

create or replace function public.game_close_household_day(p_family uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  p record;
  v_goal record;
  v_players uuid[] := '{}';
  v_done integer := 0;
  v_everyone boolean := false;
  v_week date;
begin
  insert into public.game_days (family_id, day) values (p_family, p_day) on conflict do nothing;
  if not found then
    return; -- already closed
  end if;

  select public.safe_time_zone(f.time_zone) into v_tz from public.families f where f.id = p_family;

  -- 0. Steps reached and not yet claimed -- typed or synced alike.
  for v_goal in
    select g.id from public.planner_goals g
     where g.family_id = p_family and g.kind = 'steps' and g.category is not null and g.period = 'day' and g.active
       and (g.created_at at time zone v_tz)::date <= p_day
  loop
    perform public.game_settle_steps(v_goal.id, p_day);
  end loop;

  -- 1. Each player's day. A steps goal is done only all the way ('rest').
  for p in
    select m.id, count(g.id) as dailies, count(c.id) as met
      from public.members m
      join public.planner_goals g
        on g.owner_member_id = m.id
       and g.family_id = p_family
       and g.category is not null
       and g.active
       and g.period = 'day'
       and (g.created_at at time zone v_tz)::date <= p_day
      left join public.planner_goal_completions c
        on c.goal_id = g.id and c.period_start = p_day and c.status <> 'refused' and c.part in ('whole', 'rest')
     where m.family_id = p_family
       and m.status not in ('pending', 'removed')
     group by m.id
  loop
    v_players := v_players || p.id;
    insert into public.game_streaks (member_id, family_id) values (p.id, p_family) on conflict do nothing;
    if p.met >= p.dailies then
      v_done := v_done + 1;
      update public.game_streaks
         set streak = streak + 1, best_streak = greatest(best_streak, streak + 1), last_day = p_day, updated_at = now()
       where member_id = p.id;
      insert into public.game_awards (family_id, member_id, day, kind, xp, points)
      values (p_family, p.id, p_day, 'all_dailies', 20, 10)
      on conflict do nothing;
    else
      -- A freeze keeps a streak; with no streak there is nothing to keep.
      update public.game_streaks
         set freeze_used_on = case when freezes > 0 and streak > 0 then p_day else freeze_used_on end,
             streak = case when freezes > 0 and streak > 0 then streak else 0 end,
             freezes = case when freezes > 0 and streak > 0 then freezes - 1 else freezes end,
             last_day = p_day, updated_at = now()
       where member_id = p.id;
    end if;
  end loop;

  -- 2. The whole family.
  if cardinality(v_players) >= 2 then
    v_everyone := v_done = cardinality(v_players);
    insert into public.game_family_streaks (family_id) values (p_family) on conflict do nothing;
    if v_everyone then
      update public.game_family_streaks
         set streak = streak + 1, best_streak = greatest(best_streak, streak + 1), last_day = p_day, updated_at = now()
       where family_id = p_family;
      insert into public.game_awards (family_id, member_id, day, kind, xp, points)
      select p_family, x, p_day, 'whole_family', 30, 15 from unnest(v_players) x
      on conflict do nothing;
    else
      update public.game_family_streaks set streak = 0, last_day = p_day, updated_at = now() where family_id = p_family;
    end if;
  end if;

  -- 2b. The week's family steps: once the week so far reaches a household
  -- steps goal's target, everyone with a game goal gets the bonus, once.
  v_week := public.game_week_start(p_family, p_day);
  if exists (
    select 1 from public.planner_goals g
     where g.family_id = p_family and g.kind = 'steps' and g.category is not null and g.period = 'week'
       and g.owner_member_id is null and g.active
       and public.game_family_steps_total(p_family, v_week, p_day) >= g.target
  ) then
    insert into public.game_awards (family_id, member_id, day, kind, xp, points)
    select p_family, m.id, v_week, 'family_steps', 50, 25
      from public.members m
     where m.family_id = p_family
       and m.status not in ('pending', 'removed')
       and exists (select 1 from public.planner_goals g where g.owner_member_id = m.id and g.category is not null and g.active)
    on conflict do nothing;
  end if;

  update public.game_days set players = cardinality(v_players), everyone_done = v_everyone
   where family_id = p_family and day = p_day;

  -- 3. Badges now earned. A steps goal counts as met once, at 100%.
  insert into public.game_member_badges (member_id, badge_id, family_id, earned_on)
  select s.member_id, b.id, p_family, p_day
    from public.game_streaks s
    join public.members m on m.id = s.member_id and m.status not in ('pending', 'removed')
    cross join public.game_badges b
    left join public.game_family_streaks fs on fs.family_id = p_family
   where s.family_id = p_family
     and case b.rule
       when 'streak' then s.best_streak >= b.threshold
       when 'family_streak' then coalesce(fs.best_streak, 0) >= b.threshold and s.member_id = any (v_players)
       when 'level' then public.game_level(public.game_xp(s.member_id)) >= b.threshold
       when 'total_completions' then (
         select count(*)
           from public.planner_goal_completions c
           join public.planner_goals g on g.id = c.goal_id
          where c.member_id = s.member_id
            and c.status = 'counted'
            and c.part in ('whole', 'rest')
            and g.category is not null
            and (b.category is null or g.category = b.category)
       ) >= b.threshold
       else false
     end
  on conflict do nothing;

  -- 4. A new week: everyone's freeze back.
  if extract(isodow from p_day) = 7 then
    update public.game_streaks set freezes = 1, updated_at = now() where family_id = p_family;
  end if;
end;
$$;

revoke execute on function public.game_close_household_day(uuid, date) from public, anon, authenticated;
