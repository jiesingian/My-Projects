-- Goals and Rewards, as a game (Janine, 20 October)
-- ================================================
--
-- Planner → Goals already has renewable daily and weekly goals that earn
-- points, a claim a grown-up says yes to for a child, and the Rewards shop
-- those points are spent in. This makes a game of the same things rather
-- than a second app beside them:
--
--   * A goal can carry a category (water, move, food, sleep, hygiene,
--     family) and an XP worth. A goal with a category is a game goal: it
--     shows on Planner → Goals → Game, and only a grown-up sets one up,
--     changes it or takes it away -- enforced here, not on the page, since a
--     child holds the anon key and their own session.
--   * Coins are the points that already exist: one balance, one shop.
--   * XP only ever grows, and like points it is summed from history, never
--     stored as a running total (docs/KNOWN_RISKS.md): the XP a claim was
--     worth (copied from the goal when the claim is made, like its points)
--     plus the bonuses in game_awards. A level is computed from XP.
--   * Habits only. A weight or money goal can never be a game goal, so no
--     weight, calorie or body-size number is ever on a game screen.
--   * Everyone plays, parents too. A child with no login of their own
--     (child_managed) is played for by a grown-up of the same household: the
--     grown-up taps "+" and claims for them. Nobody else logs for anyone.
--
-- The end of a household's day (close_game_day, pg_cron, hourly so every
-- household's own midnight is caught, free on Supabase):
--
--   1. Each player -- a member with at least one active daily game goal --
--      who met every daily goal that day (a claim that was not refused)
--      gets streak + 1 and the all-dailies bonus (20 XP, 10 coins). One who
--      did not keeps their streak by using a freeze, if they have one and a
--      streak to keep; otherwise the streak goes back to 0.
--   2. If there are two players or more and every one of them finished,
--      the family streak goes up and each of them gets the whole-family
--      bonus (30 XP, 15 coins). Otherwise the family streak goes back to 0.
--   3. Badges whose rule is now met are given (built-in catalog below).
--   4. At the end of a Sunday every player's freeze is refilled to 1.
--
-- Each household's day is closed once (game_days), so the job running
-- twice, or late, pays nothing twice. Days missed while the job was down
-- are closed when it next runs, up to a week back.
--
-- Everything that hands out XP, coins or badges is written only by the
-- security-definer functions here: members can read their household's rows
-- and write none.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- 1. Goals gain a category, an XP worth, and a pause --------------------------

alter table public.planner_goals add column if not exists category text;
alter table public.planner_goals add column if not exists xp integer not null default 0;
-- A paused goal keeps what it earned but stops counting towards the day.
alter table public.planner_goals add column if not exists active boolean not null default true;

alter table public.planner_goals drop constraint if exists planner_goals_category_check;
alter table public.planner_goals
  add constraint planner_goals_category_check check (
    category is null
    or (
      category in ('water', 'move', 'food', 'sleep', 'hygiene', 'family')
      -- Habits only: never weight, money or anything read from Health.
      and kind in ('custom', 'gym')
      and period in ('day', 'week')
    )
  );

alter table public.planner_goals drop constraint if exists planner_goals_xp_check;
alter table public.planner_goals
  add constraint planner_goals_xp_check check (
    xp between 0 and 1000
    -- XP is a person's: a household goal has nobody to give it to.
    and (xp = 0 or (category is not null and owner_member_id is not null))
  );

-- Only a grown-up sets up, changes or removes a game goal. A goal deleted
-- because its household or member went (a cascade, a trigger inside a
-- trigger) is not someone removing it, and the database's own maintenance
-- (no one signed in: the service role, a migration) is not a member.
create or replace function public.planner_goals_game_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and new.category is null and new.xp = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.category is null and old.category is null and new.xp = old.xp then
    return new;
  end if;
  if tg_op = 'DELETE' and old.category is null then
    return old;
  end if;
  if coalesce(public.current_member_role(), '') not in ('parent', 'adult') then
    raise exception 'Game goals are a grown-up''s to set up and change.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.planner_goals_game_guard() from public, anon, authenticated;

drop trigger if exists planner_goals_game_guard on public.planner_goals;
create trigger planner_goals_game_guard
  before insert or update or delete on public.planner_goals
  for each row execute function public.planner_goals_game_guard();

-- 2. A "+" on a game goal -------------------------------------------------------
--
-- Progress is the goal's entries, as for any goal. On a game goal: today
-- only (a closed day is closed), the entry is the caller's own, and it is
-- for the caller's own goal, a household goal, or -- for a grown-up -- the
-- goal of a child with no login in the same household. The insert and
-- delete policies already keep it to goals the caller can see.

create or replace function public.planner_goal_entries_game_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
  v_today date;
  v_day date;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  select pg.family_id, pg.owner_member_id, pg.category, pg.active, pg.target
    into g
    from public.planner_goals pg
   where pg.id = coalesce(new.goal_id, old.goal_id);
  if not found or g.category is null then
    return coalesce(new, old);
  end if;

  select (now() at time zone public.safe_time_zone(f.time_zone))::date into v_today
    from public.families f where f.id = g.family_id;
  v_day := case when tg_op = 'INSERT' then new.entry_date else old.entry_date end;
  if v_day is distinct from v_today then
    raise exception 'A game goal is logged for today only.' using errcode = 'P0001';
  end if;

  if not (
    g.owner_member_id is null
    or g.owner_member_id = public.current_member_id()
    or (
      coalesce(public.current_member_role(), '') in ('parent', 'adult')
      and exists (
        select 1 from public.members m
         where m.id = g.owner_member_id
           and m.family_id = g.family_id
           and m.family_id = public.current_family_id()
           and m.role = 'child_managed'
      )
    )
  ) then
    raise exception 'Only the person whose goal it is logs it (a grown-up may for a child without a login).' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if not g.active then
      raise exception 'This goal is paused.' using errcode = 'P0001';
    end if;
    if new.amount > g.target then
      raise exception 'That is more than the whole goal.' using errcode = 'P0001';
    end if;
    new.member_id := public.current_member_id();
    return new;
  end if;
  return old;
end;
$$;

revoke execute on function public.planner_goal_entries_game_guard() from public, anon, authenticated;

drop trigger if exists planner_goal_entries_game_guard on public.planner_goal_entries;
create trigger planner_goal_entries_game_guard
  before insert or delete on public.planner_goal_entries
  for each row execute function public.planner_goal_entries_game_guard();

-- 3. A claim carries XP too -----------------------------------------------------

alter table public.planner_goal_completions add column if not exists xp integer not null default 0;

alter table public.planner_goal_completions drop constraint if exists planner_goal_completions_xp_check;
alter table public.planner_goal_completions
  add constraint planner_goal_completions_xp_check check (xp between 0 and 1000);

-- The same function as 20261013171000, now copying the goal's XP as well as
-- its points: what a claim is worth is the goal's, never the client's.
create or replace function public.planner_goal_completions_fix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_points integer;
  v_xp integer;
begin
  if tg_op = 'INSERT' then
    select g.points, g.xp into v_points, v_xp from public.planner_goals g where g.id = new.goal_id;
    new.points := coalesce(v_points, 0);
    new.xp := coalesce(v_xp, 0);
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
     or new.points is distinct from old.points
     or new.xp is distinct from old.xp
     or new.created_at is distinct from old.created_at then
    raise exception 'A claim keeps what it was for.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goal_completions_fix() from public, anon, authenticated;

-- Is p_member a child with no login in the caller's household, and the
-- caller a grown-up there? The one case where a claim, or taking one back,
-- is for someone else.
create or replace function public.plays_for(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_member_role(), '') in ('parent', 'adult')
     and exists (
       select 1 from public.members m
        where m.id = p_member
          and m.family_id = public.current_family_id()
          and m.role = 'child_managed'
     );
$$;

revoke execute on function public.plays_for(uuid) from public, anon;
grant execute on function public.plays_for(uuid) to authenticated;

-- Claiming: as before, the owner's own -- or a grown-up's, for a child with
-- no login. The claim is always the goal owner's, on an active goal.
drop policy if exists planner_goal_completions_insert on public.planner_goal_completions;
create policy planner_goal_completions_insert on public.planner_goal_completions
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and (member_id = (select public.current_member_id()) or public.plays_for(member_id))
    and period_start between current_date - 62 and current_date + 1
    and exists (
      select 1 from public.planner_goals g
      where g.id = goal_id
        and g.family_id = (select public.current_family_id())
        and g.owner_member_id = member_id
        and g.period <> 'total'
        and g.active
    )
  );

drop policy if exists planner_goal_completions_delete on public.planner_goal_completions;
create policy planner_goal_completions_delete on public.planner_goal_completions
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (member_id = (select public.current_member_id()) or public.plays_for(member_id))
    and status <> 'refused'
  );

-- 4. What the game keeps ----------------------------------------------------------

-- Bonuses, one row each: the history XP and coins are summed from.
create table if not exists public.game_awards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  day date not null,
  kind text not null,
  xp integer not null default 0,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  constraint game_awards_kind_check check (kind in ('all_dailies', 'whole_family')),
  constraint game_awards_sane check (xp between 0 and 1000 and points between 0 and 1000),
  constraint game_awards_once unique (member_id, kind, day)
);

create index if not exists game_awards_family_id_idx on public.game_awards (family_id);

-- Each player's run of days with every daily done.
create table if not exists public.game_streaks (
  member_id uuid primary key references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  streak integer not null default 0,
  best_streak integer not null default 0,
  freezes integer not null default 1,
  freeze_used_on date,
  last_day date,
  updated_at timestamptz not null default now(),
  constraint game_streaks_sane check (streak >= 0 and best_streak >= streak and freezes between 0 and 1)
);

create index if not exists game_streaks_family_id_idx on public.game_streaks (family_id);

-- The household's run of days on which every player finished.
create table if not exists public.game_family_streaks (
  family_id uuid primary key references public.families(id) on delete cascade,
  streak integer not null default 0,
  best_streak integer not null default 0,
  last_day date,
  updated_at timestamptz not null default now(),
  constraint game_family_streaks_sane check (streak >= 0 and best_streak >= streak)
);

-- The days already closed: what makes the job safe to run twice.
create table if not exists public.game_days (
  family_id uuid not null references public.families(id) on delete cascade,
  day date not null,
  players integer not null default 0,
  everyone_done boolean not null default false,
  closed_at timestamptz not null default now(),
  primary key (family_id, day)
);

-- The built-in badges (seeded below; nobody adds to them from the app).
create table if not exists public.game_badges (
  id text primary key,
  title text not null,
  icon text not null,
  description text not null,
  rule text not null,
  category text,
  threshold integer not null,
  sort integer not null default 0,
  constraint game_badges_rule_check check (rule in ('streak', 'total_completions', 'level', 'family_streak')),
  constraint game_badges_threshold_check check (threshold > 0)
);

create table if not exists public.game_member_badges (
  member_id uuid not null references public.members(id) on delete cascade,
  badge_id text not null references public.game_badges(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  earned_on date not null,
  created_at timestamptz not null default now(),
  primary key (member_id, badge_id)
);

create index if not exists game_member_badges_family_id_idx on public.game_member_badges (family_id);
create index if not exists game_member_badges_badge_id_idx on public.game_member_badges (badge_id);

insert into public.game_badges (id, title, icon, description, rule, category, threshold, sort) values
  ('streak_3',    'Warming up',      '🔥', 'Every daily done, 3 days in a row.',    'streak', null, 3, 10),
  ('streak_7',    'One whole week',  '🌟', 'Every daily done, 7 days in a row.',    'streak', null, 7, 11),
  ('streak_14',   'Two weeks strong','💪', 'Every daily done, 14 days in a row.',   'streak', null, 14, 12),
  ('streak_30',   'A month of it',   '🏅', 'Every daily done, 30 days in a row.',   'streak', null, 30, 13),
  ('streak_60',   'Unstoppable',     '🚀', 'Every daily done, 60 days in a row.',   'streak', null, 60, 14),
  ('streak_100',  'One hundred',     '👑', 'Every daily done, 100 days in a row.',  'streak', null, 100, 15),
  ('level_2',     'Level 2',         '⭐', 'Reached level 2.',                      'level', null, 2, 20),
  ('level_5',     'Level 5',         '🌈', 'Reached level 5.',                      'level', null, 5, 21),
  ('level_10',    'Level 10',        '🏆', 'Reached level 10.',                     'level', null, 10, 22),
  ('done_10',     'Ten done',        '✅', '10 goals met.',                         'total_completions', null, 10, 30),
  ('done_50',     'Fifty done',      '🎯', '50 goals met.',                         'total_completions', null, 50, 31),
  ('done_100',    'A hundred done',  '💯', '100 goals met.',                        'total_completions', null, 100, 32),
  ('water_20',    'Well watered',    '💧', 'A water goal met 20 times.',            'total_completions', 'water', 20, 40),
  ('move_20',     'Always moving',   '🏃', 'A move goal met 20 times.',             'total_completions', 'move', 20, 41),
  ('sleep_20',    'Good sleeper',    '😴', 'A sleep goal met 20 times.',            'total_completions', 'sleep', 20, 42),
  ('hygiene_20',  'Sparkling',       '🪥', 'A hygiene goal met 20 times.',          'total_completions', 'hygiene', 20, 43),
  ('family_3',    'Team of us',      '🤝', 'The whole family finished, 3 days in a row.', 'family_streak', null, 3, 50),
  ('family_7',    'Family week',     '🏡', 'The whole family finished, 7 days in a row.', 'family_streak', null, 7, 51),
  ('family_30',   'Family month',    '🎉', 'The whole family finished, 30 days in a row.', 'family_streak', null, 30, 52)
on conflict (id) do update set
  title = excluded.title, icon = excluded.icon, description = excluded.description,
  rule = excluded.rule, category = excluded.category, threshold = excluded.threshold, sort = excluded.sort;

-- Read: your own household's rows (the badges catalog is everyone's).
-- Write: nobody. Only the definer functions below write here.
alter table public.game_awards enable row level security;
alter table public.game_streaks enable row level security;
alter table public.game_family_streaks enable row level security;
alter table public.game_days enable row level security;
alter table public.game_badges enable row level security;
alter table public.game_member_badges enable row level security;

revoke insert, update, delete, truncate on public.game_awards, public.game_streaks, public.game_family_streaks,
  public.game_days, public.game_badges, public.game_member_badges from anon, authenticated;

drop policy if exists game_awards_select on public.game_awards;
create policy game_awards_select on public.game_awards
  for select to authenticated using (family_id = (select public.current_family_id()));

drop policy if exists game_streaks_select on public.game_streaks;
create policy game_streaks_select on public.game_streaks
  for select to authenticated using (family_id = (select public.current_family_id()));

drop policy if exists game_family_streaks_select on public.game_family_streaks;
create policy game_family_streaks_select on public.game_family_streaks
  for select to authenticated using (family_id = (select public.current_family_id()));

drop policy if exists game_days_select on public.game_days;
create policy game_days_select on public.game_days
  for select to authenticated using (family_id = (select public.current_family_id()));

drop policy if exists game_badges_select on public.game_badges;
create policy game_badges_select on public.game_badges
  for select to authenticated using (true);

drop policy if exists game_member_badges_select on public.game_member_badges;
create policy game_member_badges_select on public.game_member_badges
  for select to authenticated using (family_id = (select public.current_family_id()));

-- 5. Levels and XP --------------------------------------------------------------
--
-- The same rule as lib/game levelFromXp: level 2 at 100 XP, and each level
-- after needs 50 more than the one before (3 at 250, 4 at 450, ...).

create or replace function public.game_level(p_xp integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_level integer := 1;
  v_needed integer := 100;
  v_total integer := 0;
begin
  while coalesce(p_xp, 0) >= v_total + v_needed loop
    v_total := v_total + v_needed;
    v_level := v_level + 1;
    v_needed := v_needed + 50;
  end loop;
  return v_level;
end;
$$;

revoke execute on function public.game_level(integer) from public, anon, authenticated;

create or replace function public.game_xp(p_member uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((select sum(c.xp) from public.planner_goal_completions c where c.member_id = p_member and c.status = 'counted'), 0)
    + coalesce((select sum(a.xp) from public.game_awards a where a.member_id = p_member), 0)
  )::integer;
$$;

revoke execute on function public.game_xp(uuid) from public, anon, authenticated;

-- 6. Closing a household's day ------------------------------------------------------

create or replace function public.game_close_household_day(p_family uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  p record;
  v_players uuid[] := '{}';
  v_done integer := 0;
  v_everyone boolean := false;
begin
  insert into public.game_days (family_id, day) values (p_family, p_day) on conflict do nothing;
  if not found then
    return; -- already closed
  end if;

  select public.safe_time_zone(f.time_zone) into v_tz from public.families f where f.id = p_family;

  -- 1. Each player's day.
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
        on c.goal_id = g.id and c.period_start = p_day and c.status <> 'refused'
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

  update public.game_days set players = cardinality(v_players), everyone_done = v_everyone
   where family_id = p_family and day = p_day;

  -- 3. Badges now earned.
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

-- Every household that plays, every day up to its own yesterday not yet
-- closed -- a week back at most.
create or replace function public.close_game_day()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
  v_from date;
  d date;
begin
  for f in
    select fam.id, (now() at time zone public.safe_time_zone(fam.time_zone))::date as today
      from public.families fam
     where exists (select 1 from public.planner_goals g where g.family_id = fam.id and g.category is not null)
  loop
    select max(gd.day) + 1 into v_from from public.game_days gd where gd.family_id = f.id;
    v_from := greatest(coalesce(v_from, f.today - 1), f.today - 7);
    d := v_from;
    while d < f.today loop
      perform public.game_close_household_day(f.id, d);
      d := d + 1;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.close_game_day() from public, anon, authenticated;

-- Hourly, so each household's own midnight is caught whatever its time zone
-- (Manila's is 16:00 UTC). Free: pg_cron runs inside the database.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable here: %', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    execute $c$ select cron.schedule('kin-goals-game', '7 * * * *', 'select public.close_game_day()') $c$;
  end if;
end
$$;
