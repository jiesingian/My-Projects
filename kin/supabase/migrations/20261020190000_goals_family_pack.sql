-- Goals game: what a family's own plan needs (Janine, 20 October)
-- ===============================================================
--
-- Janine's family plan -- a goal for each of four people, weekly goals, a
-- baby a parent plays for, a stroller walk that counts in three places, a
-- backup goal for busy days -- needs a few things the game of
-- 20261020120000 / 20261020150000 did not have. Each is general, not hers:
-- her plan itself is added from the app by a parent (the starter pack), never
-- by a migration, a seed or a test.
--
--   1. Categories outdoor, reading and unplug.
--   2. A daily goal may be for some days of the week only (days: ISO day
--      numbers, 1 = Monday). On other days it is not asked for: it does not
--      count against the day, the streak or the all-dailies bonus.
--   3. A backup goal ("10 minutes of movement"): not one of the day's
--      dailies, but on a day the dailies are not all done, meeting it keeps
--      the streak going (+1) -- with no all-dailies bonus and no
--      whole-family share.
--   4. Credit to whoever ticked it. A goal set to credit_to = 'logger' -- a
--      baby's, say -- gives its owner the progress, streak and badges, and
--      gives the XP and coins to the grown-up who ticked it
--      (planner_goal_completions.credited_to). Never both: nothing is paid
--      twice. Every other goal pays its owner, as before.
--   5. Linked goals: logging one goal logs its linked goals too, once each,
--      in one go (game_log) -- a stroller walk ticks the family's weekly walk,
--      the baby's outdoor time, and adds the walk's steps to the parent's.
--      Each part follows the rules it always did: a link never lets anyone
--      log what they could not log by hand; a linked goal they may not log is
--      skipped, not forced.
--   6. A family week: when every household weekly game goal is met, the week
--      is recorded (game_family_weeks); it gives the Family Team badge and
--      unlocks a reward marked unlock = 'family_week' (a special breakfast
--      out), which a grown-up marks used. Such a reward is never bought with
--      coins.
--   7. A reward may carry what it costs the family in pesos (budget_amount)
--      -- a note shown beside it; nothing is taken out of Wealth.
--   8. A game goal is removed, not deleted (removed_at): what it earned
--      stays earned. Deleting it would delete its claims, and the coins and
--      XP summed from them.
--   9. Badges: Step Champion (a steps goal met all the way 7 days in a row),
--      Family Team, Little Explorer (an outdoor goal met 10 times), Bookworm
--      (a reading goal met 20 times).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- 1-3, 8. Goals gain categories, days, a backup flag, a credit rule, an emoji
-- (a child's sticker), and removal --------------------------------------------

alter table public.planner_goals add column if not exists days smallint[];
alter table public.planner_goals add column if not exists backup boolean not null default false;
alter table public.planner_goals add column if not exists credit_to text not null default 'owner';
alter table public.planner_goals add column if not exists emoji text;
alter table public.planner_goals add column if not exists removed_at timestamptz;

alter table public.planner_goals drop constraint if exists planner_goals_category_check;
alter table public.planner_goals
  add constraint planner_goals_category_check check (
    category is null
    or (
      category in ('water', 'move', 'food', 'sleep', 'hygiene', 'family', 'outdoor', 'reading', 'unplug')
      and (
        (kind in ('custom', 'gym') and period in ('day', 'week'))
        or (kind = 'steps' and ((period = 'day' and owner_member_id is not null) or (period = 'week' and owner_member_id is null)))
      )
    )
  );

alter table public.planner_goals drop constraint if exists planner_goals_days_check;
alter table public.planner_goals
  add constraint planner_goals_days_check check (
    days is null
    or (period = 'day' and cardinality(days) between 1 and 7 and days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
  );

alter table public.planner_goals drop constraint if exists planner_goals_backup_check;
alter table public.planner_goals
  add constraint planner_goals_backup_check check (
    not backup or (category is not null and period = 'day' and owner_member_id is not null and kind in ('custom', 'gym'))
  );

alter table public.planner_goals drop constraint if exists planner_goals_credit_to_check;
alter table public.planner_goals
  add constraint planner_goals_credit_to_check check (
    credit_to in ('owner', 'logger') and (credit_to = 'owner' or (category is not null and owner_member_id is not null))
  );

alter table public.planner_goals drop constraint if exists planner_goals_emoji_len;
alter table public.planner_goals
  add constraint planner_goals_emoji_len check (emoji is null or char_length(emoji) <= 16);

-- A removed goal is off for good: it cannot be turned back on.
alter table public.planner_goals drop constraint if exists planner_goals_removed_is_off;
alter table public.planner_goals
  add constraint planner_goals_removed_is_off check (removed_at is null or not active);

-- 4. Credit to whoever ticked it ---------------------------------------------------

alter table public.planner_goal_completions add column if not exists credited_to uuid references public.members(id) on delete set null;
create index if not exists planner_goal_completions_credited_to_idx on public.planner_goal_completions (credited_to);

-- Every claim made before today was its owner's.
update public.planner_goal_completions set credited_to = member_id where credited_to is null;

-- The same function as 20261020150000, now also saying whose the XP and
-- coins are: the owner's, or -- on a credit_to = 'logger' goal ticked by
-- someone else -- the one who ticked it. Never the client's to say.
create or replace function public.planner_goal_completions_fix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
  v_me uuid := public.current_member_id();
begin
  if tg_op = 'INSERT' then
    select pg.points, pg.xp, pg.kind, pg.category, pg.credit_to into g from public.planner_goals pg where pg.id = new.goal_id;
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
    new.credited_to := case when g.credit_to = 'logger' and v_me is not null and v_me <> new.member_id then v_me else new.member_id end;
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
     or new.credited_to is distinct from old.credited_to
     or new.created_at is distinct from old.created_at then
    raise exception 'A claim keeps what it was for.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goal_completions_fix() from public, anon, authenticated;

-- XP is summed by whose it is.
create or replace function public.game_xp(p_member uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((select sum(c.xp) from public.planner_goal_completions c where coalesce(c.credited_to, c.member_id) = p_member and c.status = 'counted'), 0)
    + coalesce((select sum(a.xp) from public.game_awards a where a.member_id = p_member), 0)
  )::integer;
$$;

revoke execute on function public.game_xp(uuid) from public, anon, authenticated;

-- 5. Linked goals ---------------------------------------------------------------------

create table if not exists public.planner_goal_links (
  goal_id uuid not null references public.planner_goals(id) on delete cascade,
  linked_goal_id uuid not null references public.planner_goals(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (goal_id, linked_goal_id),
  constraint planner_goal_links_not_itself check (goal_id <> linked_goal_id)
);

create index if not exists planner_goal_links_linked_goal_id_idx on public.planner_goal_links (linked_goal_id);
create index if not exists planner_goal_links_family_id_idx on public.planner_goal_links (family_id);
create index if not exists planner_goal_links_created_by_idx on public.planner_goal_links (created_by);

alter table public.planner_goal_links enable row level security;

drop policy if exists planner_goal_links_select on public.planner_goal_links;
create policy planner_goal_links_select on public.planner_goal_links
  for select to authenticated using (family_id = (select public.current_family_id()));

-- Linking is a grown-up's, between two game goals of their own household.
drop policy if exists planner_goal_links_insert on public.planner_goal_links;
create policy planner_goal_links_insert on public.planner_goal_links
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and exists (select 1 from public.planner_goals g where g.id = goal_id and g.family_id = (select public.current_family_id()) and g.category is not null)
    and exists (select 1 from public.planner_goals g where g.id = linked_goal_id and g.family_id = (select public.current_family_id()) and g.category is not null)
  );

drop policy if exists planner_goal_links_delete on public.planner_goal_links;
create policy planner_goal_links_delete on public.planner_goal_links
  for delete to authenticated
  using (family_id = (select public.current_family_id()) and (select public.current_member_role()) in ('parent', 'adult'));

-- The household's today, for the caller.
create or replace function public.game_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone public.safe_time_zone(f.time_zone))::date
    from public.families f where f.id = public.current_family_id();
$$;

revoke execute on function public.game_today() from public, anon;
grant execute on function public.game_today() to authenticated;

-- May the caller log this goal by hand? The same rule as the entries guard of
-- 20261020120000: their own, the household's, or -- for a grown-up -- a child
-- with no login in the house. An active game goal they can see.
create or replace function public.game_may_log(p_goal uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.planner_goals g
     where g.id = p_goal
       and g.family_id = public.current_family_id()
       and g.category is not null
       and g.active
       and g.kind in ('custom', 'gym')
       and public.planner_goal_visible(g.id)
       and (g.owner_member_id is null or g.owner_member_id = public.current_member_id() or public.plays_for(g.owner_member_id))
  );
$$;

revoke execute on function public.game_may_log(uuid) from public, anon;
grant execute on function public.game_may_log(uuid) to authenticated;

-- The first day of the period a goal is in today (the day; the week's first
-- day by the household's Week starts on).
create or replace function public.game_period_start(p_goal uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when g.period = 'week' then public.game_week_start(g.family_id, public.game_today()) else public.game_today() end
    from public.planner_goals g
   where g.id = p_goal and g.family_id = public.current_family_id();
$$;

revoke execute on function public.game_period_start(uuid) from public, anon;
grant execute on function public.game_period_start(uuid) to authenticated;

-- The caller's own steps goals, settled from today's readings: the halves
-- reached and not yet claimed (game_settle_steps, from what the readings say,
-- never from what the client sends).
create or replace function public.game_settle_my_steps()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal record;
begin
  for v_goal in
    select g.id from public.planner_goals g
     where g.family_id = public.current_family_id()
       and g.owner_member_id = public.current_member_id()
       and g.kind = 'steps' and g.category is not null and g.period = 'day' and g.active
  loop
    perform public.game_settle_steps(v_goal.id, public.game_today());
  end loop;
end;
$$;

revoke execute on function public.game_settle_my_steps() from public, anon;
grant execute on function public.game_settle_my_steps() to authenticated;

-- One log, counted everywhere it belongs. Runs as the caller (security
-- invoker), so every insert below meets the same policies and triggers a tap
-- by hand would: who may log, today only, a paused goal refused, what a claim
-- is worth. p_steps, if given, is added to the caller's own steps today.
create or replace function public.game_log(p_goal uuid, p_steps integer default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := public.game_today();
  v_me uuid := public.current_member_id();
  g record;
  v_total numeric;
  v_start date;
  v_reading record;
begin
  if not public.game_may_log(p_goal) then
    raise exception 'This goal is not yours to log.' using errcode = 'P0001';
  end if;

  for g in
    select pg.id, pg.family_id, pg.owner_member_id, pg.target, pg.period
      from public.planner_goals pg
     where pg.id = p_goal
        or (pg.id in (select l.linked_goal_id from public.planner_goal_links l where l.goal_id = p_goal)
            and public.game_may_log(pg.id))
  loop
    insert into public.planner_goal_entries (family_id, goal_id, member_id, entry_date, amount)
    values (g.family_id, g.id, v_me, v_today, 1);

    -- Met: claimed for its owner (a household goal has nobody to pay).
    if g.owner_member_id is not null then
      v_start := public.game_period_start(g.id);
      select coalesce(sum(e.amount), 0) into v_total
        from public.planner_goal_entries e
       where e.goal_id = g.id and e.entry_date between v_start and v_today;
      if v_total >= g.target and not exists (
        select 1 from public.planner_goal_completions c where c.goal_id = g.id and c.period_start = v_start and c.part = 'whole'
      ) then
        insert into public.planner_goal_completions (family_id, goal_id, member_id, period_start)
        values (g.family_id, g.id, g.owner_member_id, v_start);
      end if;
    end if;
  end loop;

  if coalesce(p_steps, 0) > 0 then
    if p_steps > 100000 then
      raise exception 'That many steps doesn''t look right.' using errcode = 'P0001';
    end if;
    select v.id, v.value_text into v_reading
      from public.health_vitals v
     where v.member_id = v_me and v.vital_type = 'steps' and v.source = 'manual' and v.created_by = v_me and v.reading_date = v_today
     order by v.created_at desc
     limit 1;
    if found then
      update public.health_vitals
         set value_text = (least(200000, coalesce(nullif(regexp_replace(v_reading.value_text, '[^0-9]', '', 'g'), '')::integer, 0) + p_steps))::text
       where id = v_reading.id;
    else
      insert into public.health_vitals (family_id, member_id, vital_type, reading_date, value_text, unit, source, visibility, created_by)
      values (public.current_family_id(), v_me, 'steps', v_today, p_steps::text, 'steps', 'manual', 'family', v_me);
    end if;
    perform public.game_settle_my_steps();
  end if;
end;
$$;

revoke execute on function public.game_log(uuid, integer) from public, anon;
grant execute on function public.game_log(uuid, integer) to authenticated;

-- 6. The family week ---------------------------------------------------------------------

create table if not exists public.game_family_weeks (
  family_id uuid not null references public.families(id) on delete cascade,
  week_start date not null,
  goals integer not null default 0,
  all_done boolean not null default false,
  treat_used_at timestamptz,
  treat_used_by uuid references public.members(id) on delete set null,
  closed_at timestamptz not null default now(),
  primary key (family_id, week_start)
);

create index if not exists game_family_weeks_treat_used_by_idx on public.game_family_weeks (treat_used_by);

alter table public.game_family_weeks enable row level security;
revoke insert, update, delete, truncate on public.game_family_weeks from anon, authenticated;

drop policy if exists game_family_weeks_select on public.game_family_weeks;
create policy game_family_weeks_select on public.game_family_weeks
  for select to authenticated using (family_id = (select public.current_family_id()));

-- A grown-up marks the week's unlocked treat as used, once.
create or replace function public.game_use_family_treat(p_week date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_member_role(), '') not in ('parent', 'adult') then
    raise exception 'A grown-up marks the family treat as used.' using errcode = 'P0001';
  end if;
  update public.game_family_weeks
     set treat_used_at = now(), treat_used_by = public.current_member_id()
   where family_id = public.current_family_id() and week_start = p_week and all_done and treat_used_at is null;
  if not found then
    raise exception 'There is no unused family treat for that week.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.game_use_family_treat(date) from public, anon;
grant execute on function public.game_use_family_treat(date) to authenticated;

-- 7. Rewards: a peso note, and the family-week unlock ---------------------------------------

alter table public.rewards add column if not exists budget_amount numeric;
alter table public.rewards add column if not exists unlock text;

alter table public.rewards drop constraint if exists rewards_budget_amount_sane;
alter table public.rewards
  add constraint rewards_budget_amount_sane check (budget_amount is null or (budget_amount >= 0 and budget_amount <= 10000000));

alter table public.rewards drop constraint if exists rewards_unlock_check;
alter table public.rewards
  add constraint rewards_unlock_check check (unlock is null or unlock = 'family_week');

-- An unlocked reward is the family's treat, not something to buy with coins.
create or replace function public.reward_redemptions_not_unlocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.rewards r where r.id = new.reward_id and r.unlock is not null) then
    raise exception 'This reward is unlocked by the family''s week, not bought with coins.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.reward_redemptions_not_unlocks() from public, anon, authenticated;

drop trigger if exists reward_redemptions_not_unlocks on public.reward_redemptions;
create trigger reward_redemptions_not_unlocks
  before insert on public.reward_redemptions
  for each row execute function public.reward_redemptions_not_unlocks();

-- 9. Badges -----------------------------------------------------------------------------------

alter table public.game_badges drop constraint if exists game_badges_rule_check;
alter table public.game_badges
  add constraint game_badges_rule_check check (rule in ('streak', 'total_completions', 'level', 'family_streak', 'steps_streak', 'family_week'));

insert into public.game_badges (id, title, icon, description, rule, category, threshold, sort) values
  ('step_champion',   'Step Champion',   '👟', 'Steps target hit 7 days in a row.',             'steps_streak', null, 7, 60),
  ('family_team',     'Family Team',     '🏆', 'Every family goal of the week completed.',     'family_week', null, 1, 61),
  ('little_explorer', 'Little Explorer', '🌳', 'An outdoor goal met 10 times.',                 'total_completions', 'outdoor', 10, 62),
  ('bookworm',        'Bookworm',        '📚', 'A reading goal met 20 times.',                  'total_completions', 'reading', 20, 63)
on conflict (id) do update set
  title = excluded.title, icon = excluded.icon, description = excluded.description,
  rule = excluded.rule, category = excluded.category, threshold = excluded.threshold, sort = excluded.sort;

-- Days in a row, ending p_day, on which a member's daily steps goal was met
-- all the way.
create or replace function public.game_steps_run(p_member uuid, p_day date)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_run integer := 0;
  v_day date := p_day;
begin
  while v_run < 400 and exists (
    select 1 from public.planner_goal_completions c
      join public.planner_goals g on g.id = c.goal_id
     where c.member_id = p_member and g.kind = 'steps' and g.category is not null
       and c.period_start = v_day and c.part = 'rest' and c.status <> 'refused'
  ) loop
    v_run := v_run + 1;
    v_day := v_day - 1;
  end loop;
  return v_run;
end;
$$;

revoke execute on function public.game_steps_run(uuid, date) from public, anon, authenticated;

-- 2, 3, 6, 9. Closing a day: 20261020150000's, with days of the week, backup
-- goals, the family week and the new badges ------------------------------------------------

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
  v_weekly integer;
  v_weekly_met integer;
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

  -- 1. Each player's day. The day's dailies are the active daily game goals
  -- asked for that day of the week, backups aside; a steps goal is done only
  -- all the way ('rest').
  for p in
    select m.id,
           count(g.id) filter (where not g.backup) as dailies,
           count(c.id) filter (where not g.backup) as met,
           count(c.id) filter (where g.backup) as backup_met
      from public.members m
      join public.planner_goals g
        on g.owner_member_id = m.id
       and g.family_id = p_family
       and g.category is not null
       and g.active
       and g.period = 'day'
       and (g.created_at at time zone v_tz)::date <= p_day
       and (g.days is null or extract(isodow from p_day)::smallint = any (g.days))
      left join public.planner_goal_completions c
        on c.goal_id = g.id and c.period_start = p_day and c.status <> 'refused' and c.part in ('whole', 'rest')
     where m.family_id = p_family
       and m.status not in ('pending', 'removed')
     group by m.id
    having count(g.id) filter (where not g.backup) > 0
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
    elsif p.backup_met > 0 then
      -- A busy day: the backup keeps the streak going, with no bonus.
      update public.game_streaks
         set streak = streak + 1, best_streak = greatest(best_streak, streak + 1), last_day = p_day, updated_at = now()
       where member_id = p.id;
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

  -- 2. The whole family: every player's dailies all done (a backup day is
  -- not a finished one).
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

  -- 2b. The week's family steps (20261020150000).
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

  -- 2c. The family week, on its last day: was every household weekly game
  -- goal met?
  if public.game_week_start(p_family, p_day + 1) = p_day + 1 then
    select count(*),
           count(*) filter (where
             case when g.kind = 'steps'
               then public.game_family_steps_total(p_family, v_week, p_day) >= g.target
               else coalesce((select sum(e.amount) from public.planner_goal_entries e
                               where e.goal_id = g.id and e.entry_date between v_week and p_day), 0) >= g.target
             end)
      into v_weekly, v_weekly_met
      from public.planner_goals g
     where g.family_id = p_family and g.owner_member_id is null and g.period = 'week'
       and g.category is not null and g.active
       and (g.created_at at time zone v_tz)::date <= p_day;
    if v_weekly > 0 then
      insert into public.game_family_weeks (family_id, week_start, goals, all_done)
      values (p_family, v_week, v_weekly, v_weekly_met >= v_weekly)
      on conflict do nothing;
    end if;
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
       when 'steps_streak' then public.game_steps_run(s.member_id, p_day) >= b.threshold
       when 'family_week' then (
         select count(*) from public.game_family_weeks w where w.family_id = p_family and w.all_done
       ) >= b.threshold
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
