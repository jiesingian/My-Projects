-- Goals: "Whole household" or "Just me" (Jonathan, 13 October)
-- ===========================================================
--
-- Until now every goal was the household's to see, because planner_goals and
-- everything hanging off it (entries, the reward, change requests) checked
-- family_id alone. A weight goal is not everyone's business, so a personal
-- goal now carries a visibility, chosen the way a personal Wealth account's
-- privacy is: by the person it belongs to.
--
--   household  everyone in the house (every goal made before today)
--   private    the owner, and whoever gives the goal's reward -- they keep
--              a binding promise about it, so they have to see it reached
--
-- Who may choose "private": the goal's owner, and only a grown-up. A
-- child's goals stay in the grown-ups' sight, the same rule as a child's
-- Wealth account. Someone setting a goal for another person cannot hide it;
-- the owner can afterwards. A household goal (no owner) is always
-- everyone's. Only the owner can switch it either way, and the switch does
-- not change what the goal measures, so it needs no one's yes.
--
-- What "private" hides, enforced here rather than in the app: the goal, its
-- entries, its reward and its change requests. Today, the weekly digest,
-- Kin AI and the data export all read through these policies, so none of
-- them can show it either.
--
-- Sharing a goal shares its numbers. A steps or weight goal reads the
-- owner's readings in health_vitals, and those can be private there (Apple
-- Health set to "Just me", say), in which case another member's own query
-- returns nothing and the ring would sit at zero. planner_goal_readings()
-- hands back, for goals the caller may see, the readings that goal is made
-- of -- steps already counted once per day (the larger of Apple Health and
-- a hand entry, never both), weight the owner's recent readings -- and
-- nothing for any other goal. The readings stay as private in Health as
-- their owner set them.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.planner_goals add column if not exists visibility text not null default 'household';

alter table public.planner_goals drop constraint if exists planner_goals_visibility_check;
alter table public.planner_goals
  add constraint planner_goals_visibility_check check (visibility in ('household', 'private'));

-- 1. Who may see a goal ------------------------------------------------------
--
-- A definer helper so the goal policies and the policies of the tables that
-- hang off a goal can ask the same question without reading each other
-- through their own policies (which would recurse).

create or replace function public.planner_goal_visible(p_goal uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.planner_goals g
    where g.id = p_goal
      and g.family_id = public.current_family_id()
      and (
        g.visibility = 'household'
        or g.owner_member_id = public.current_member_id()
        or exists (
          select 1 from public.planner_goal_rewards r
          where r.goal_id = g.id and r.giver_member_id = public.current_member_id()
        )
      )
  );
$$;

revoke execute on function public.planner_goal_visible(uuid) from public, anon;
grant execute on function public.planner_goal_visible(uuid) to authenticated;

-- 2. Who may choose ----------------------------------------------------------

create or replace function public.planner_goals_visibility_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.visibility is not distinct from old.visibility then
    return new;
  end if;
  if tg_op = 'INSERT' and new.visibility = 'household' then
    return new;
  end if;
  -- From here: a goal made private, or its visibility switched.
  if new.owner_member_id is null and new.visibility = 'private' then
    raise exception 'A household goal is everyone''s to see.' using errcode = 'P0001';
  end if;
  if new.owner_member_id is distinct from public.current_member_id() then
    raise exception 'Only the person whose goal it is can choose who sees it.' using errcode = 'P0001';
  end if;
  if new.visibility = 'private' and coalesce(public.current_member_role(), '') not in ('parent', 'adult') then
    raise exception 'A child''s goals stay visible to the grown-ups of the house.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goals_visibility_guard() from public, anon, authenticated;

drop trigger if exists planner_goals_visibility_guard on public.planner_goals;
create trigger planner_goals_visibility_guard
  before insert or update on public.planner_goals
  for each row execute function public.planner_goals_visibility_guard();

-- 3. The policies --------------------------------------------------------------
--
-- Each keeps what it checked before and adds the visibility question. The
-- household and owner cases are answered inline, so the helper only runs
-- for someone else's private goal -- and so a goal being inserted can be
-- handed back to its owner (insert ... returning): the helper's own query
-- cannot see a row its statement has not finished writing.

drop policy if exists planner_goals_select on public.planner_goals;
create policy planner_goals_select on public.planner_goals
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and (visibility = 'household' or owner_member_id = (select public.current_member_id()) or public.planner_goal_visible(id))
  );

drop policy if exists planner_goals_update on public.planner_goals;
create policy planner_goals_update on public.planner_goals
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (visibility = 'household' or owner_member_id = (select public.current_member_id()) or public.planner_goal_visible(id))
  )
  with check (
    family_id = (select public.current_family_id())
    and (savings_goal_id is null or exists (
      select 1 from public.goals g
      where g.id = savings_goal_id and g.family_id = (select public.current_family_id())
    ))
  );

drop policy if exists planner_goals_delete on public.planner_goals;
create policy planner_goals_delete on public.planner_goals
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (visibility = 'household' or owner_member_id = (select public.current_member_id()) or public.planner_goal_visible(id))
  );

drop policy if exists planner_goal_entries_select on public.planner_goal_entries;
create policy planner_goal_entries_select on public.planner_goal_entries
  for select to authenticated
  using (family_id = (select public.current_family_id()) and public.planner_goal_visible(goal_id));

drop policy if exists planner_goal_entries_delete on public.planner_goal_entries;
create policy planner_goal_entries_delete on public.planner_goal_entries
  for delete to authenticated
  using (family_id = (select public.current_family_id()) and public.planner_goal_visible(goal_id));

drop policy if exists planner_goal_rewards_select on public.planner_goal_rewards;
create policy planner_goal_rewards_select on public.planner_goal_rewards
  for select to authenticated
  using (family_id = (select public.current_family_id()) and public.planner_goal_visible(goal_id));

drop policy if exists planner_goal_changes_select on public.planner_goal_changes;
create policy planner_goal_changes_select on public.planner_goal_changes
  for select to authenticated
  using (family_id = (select public.current_family_id()) and public.planner_goal_visible(goal_id));

-- The insert policies of entries, rewards and change requests each look the
-- goal up in planner_goals, under the caller's own policies -- so a goal the
-- caller cannot see cannot be logged against, given a reward or asked to
-- change. Nothing to add there.

-- 4. The readings a goal is made of --------------------------------------------

create or replace function public.planner_goal_readings(p_since date)
returns table (goal_id uuid, kind text, reading_date date, value numeric, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with goals as (
    select g.id, g.kind, g.owner_member_id
    from public.planner_goals g
    where g.family_id = public.current_family_id()
      and g.kind in ('steps', 'weight')
      and public.planner_goal_visible(g.id)
  ),
  -- Steps: one number per person per day -- the largest reading of each
  -- source, then the larger of the sources. Never a sum of the two.
  per_source as (
    select v.member_id, v.reading_date, v.source,
           max(nullif(regexp_replace(v.value_text, '[^0-9.]', '', 'g'), '')::numeric) as value
    from public.health_vitals v
    where v.family_id = public.current_family_id()
      and v.vital_type = 'steps'
      and v.reading_date >= p_since
    group by v.member_id, v.reading_date, v.source
  ),
  per_day as (
    select member_id, reading_date, max(value) as value
    from per_source
    group by member_id, reading_date
  ),
  steps as (
    -- A household goal counts everyone, as one total per day.
    select g.id as goal_id, 'steps'::text as kind, d.reading_date, sum(d.value) as value, null::timestamptz as created_at
    from goals g
    join per_day d on g.owner_member_id is null or d.member_id = g.owner_member_id
    where g.kind = 'steps'
    group by g.id, d.reading_date
  ),
  weight as (
    -- The owner's recent readings, newest first; the latest one counts.
    select g.id as goal_id, 'weight'::text as kind, w.reading_date, w.value, w.created_at
    from goals g
    cross join lateral (
      select v.reading_date, nullif(regexp_replace(v.value_text, '[^0-9.]', '', 'g'), '')::numeric as value, v.created_at
      from public.health_vitals v
      where v.family_id = public.current_family_id()
        and v.vital_type = 'weight'
        and v.member_id = g.owner_member_id
      order by v.reading_date desc, v.created_at desc
      limit 120
    ) w
    where g.kind = 'weight'
  )
  select * from steps
  union all
  select * from weight;
$$;

revoke execute on function public.planner_goal_readings(date) from public, anon;
grant execute on function public.planner_goal_readings(date) to authenticated;
