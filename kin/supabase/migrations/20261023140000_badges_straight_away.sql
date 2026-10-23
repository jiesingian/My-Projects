-- Badges the moment they are earned (Jonathan, 23 October: "straight away
-- upon completion"). Until now every badge waited for the household's
-- midnight (game_close_household_day, 20261020190000). Now, when a goal
-- completion counts -- a grown-up's claim at once, a child's once approved --
-- the badges its rule already allows are given there and then:
--
--   * total_completions, level, steps_streak: read as they stand.
--   * streak: today counts once every daily of today is met (a backup goal
--     also keeps it, as at midnight), on top of yesterday's closed streak.
--   * family_streak: once every player of the household has finished today,
--     each of them gets it, on top of yesterday's closed family streak.
--
-- family_week stays with the week's close: a week is met only when it ends.
-- Streaks, freezes, bonuses and the day's own close are unchanged; the
-- nightly job still gives anything this missed, and never twice (the
-- primary key on game_member_badges).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- One player's day so far: how many of today's dailies, how many met, and
-- whether a backup goal was met -- the same reading as the day's close.
create or replace function public.game_day_so_far(p_member uuid, p_family uuid, p_day date, p_tz text)
returns table (dailies integer, met integer, backup_met integer)
language sql
stable
security definer
set search_path = ''
as $$
  select (count(g.id) filter (where not g.backup))::integer,
         (count(c.id) filter (where not g.backup))::integer,
         (count(c.id) filter (where g.backup))::integer
    from public.planner_goals g
    left join public.planner_goal_completions c
      on c.goal_id = g.id and c.period_start = p_day and c.status <> 'refused' and c.part in ('whole', 'rest')
   where g.owner_member_id = p_member
     and g.family_id = p_family
     and g.category is not null
     and g.active
     and g.period = 'day'
     and (g.created_at at time zone p_tz)::date <= p_day
     and (g.days is null or extract(isodow from p_day)::smallint = any (g.days));
$$;

revoke execute on function public.game_day_so_far(uuid, uuid, date, text) from public, anon, authenticated;

create or replace function public.game_badges_now(p_member uuid, p_family uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_day record;
  v_streak record;
  v_best integer := 0;
  v_fam record;
  v_players uuid[] := '{}';
  v_all_done boolean := true;
  v_fam_best integer := 0;
  m record;
begin
  select public.safe_time_zone(f.time_zone) into v_tz from public.families f where f.id = p_family;
  if v_tz is null then
    return;
  end if;
  v_today := (now() at time zone v_tz)::date;

  -- This player's streak as it would stand if today closed now.
  select * into v_day from public.game_day_so_far(p_member, p_family, v_today, v_tz);
  select s.streak, s.best_streak, s.last_day into v_streak from public.game_streaks s where s.member_id = p_member;
  v_best := coalesce(v_streak.best_streak, 0);
  if (v_day.dailies > 0 and v_day.met >= v_day.dailies) or v_day.backup_met > 0 then
    v_best := greatest(v_best, case when v_streak.last_day = v_today - 1 then v_streak.streak else 0 end + 1);
  end if;

  insert into public.game_member_badges (member_id, badge_id, family_id, earned_on)
  select p_member, b.id, p_family, v_today
    from public.game_badges b
   where case b.rule
       when 'streak' then v_best >= b.threshold
       when 'level' then public.game_level(public.game_xp(p_member)) >= b.threshold
       when 'steps_streak' then public.game_steps_run(p_member, v_today) >= b.threshold
       when 'total_completions' then (
         select count(*)
           from public.planner_goal_completions c
           join public.planner_goals g on g.id = c.goal_id
          where c.member_id = p_member
            and c.status = 'counted'
            and c.part in ('whole', 'rest')
            and g.category is not null
            and (b.category is null or g.category = b.category)
       ) >= b.threshold
       else false
     end
  on conflict do nothing;

  -- The whole family, once the last player has finished today.
  for m in
    select mm.id from public.members mm
     where mm.family_id = p_family and mm.status not in ('pending', 'removed')
  loop
    select * into v_day from public.game_day_so_far(m.id, p_family, v_today, v_tz);
    if v_day.dailies > 0 then
      v_players := v_players || m.id;
      if v_day.met < v_day.dailies then
        v_all_done := false;
      end if;
    end if;
  end loop;

  if cardinality(v_players) >= 2 and v_all_done then
    select fs.streak, fs.best_streak, fs.last_day into v_fam from public.game_family_streaks fs where fs.family_id = p_family;
    v_fam_best := greatest(coalesce(v_fam.best_streak, 0), case when v_fam.last_day = v_today - 1 then v_fam.streak else 0 end + 1);
    insert into public.game_member_badges (member_id, badge_id, family_id, earned_on)
    select x, b.id, p_family, v_today
      from unnest(v_players) x
      cross join public.game_badges b
     where b.rule = 'family_streak' and v_fam_best >= b.threshold
    on conflict do nothing;
  end if;
end;
$$;

revoke execute on function public.game_badges_now(uuid, uuid) from public, anon, authenticated;

-- When a completion counts: on a grown-up's claim, and when a child's is
-- approved.
create or replace function public.planner_goal_completions_badges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'counted' and new.member_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'counted') then
    perform public.game_badges_now(new.member_id, new.family_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.planner_goal_completions_badges() from public, anon, authenticated;

drop trigger if exists planner_goal_completions_badges on public.planner_goal_completions;
create trigger planner_goal_completions_badges
  after insert or update of status on public.planner_goal_completions
  for each row execute function public.planner_goal_completions_badges();
