-- A goal and the targets that get you there (Janine, 21 October).
--
-- A goal on Planner → Goals is the big one ("Lose weight: 65 kg by 5
-- December"); a target under Goals → Target is a daily or weekly thing done
-- for it ("Go on a diet", "2,000 steps a day", "Pickleball twice a week").
-- Until now the two were separate lists. A target can now say which goal it
-- helps, so tapping a goal opens its own targets.
--
-- The link is optional and only ever on the target. Deleting the goal leaves
-- its targets as they were, unlinked; nothing a target earned changes.
--
-- The rule, checked here rather than trusted from the form: a target helps a
-- goal of its own household, that is a goal and not another target, and that
-- belongs to the same person -- or is the whole household's goal. A
-- whole-family target helps only a whole-family goal.

alter table public.planner_goals
  add column if not exists helps_goal_id uuid references public.planner_goals(id) on delete set null;

create index if not exists planner_goals_helps_goal_id_idx on public.planner_goals (helps_goal_id);

-- Security definer so the check sees the goal whatever its visibility: a
-- private goal still belongs to its owner, and the rule is about whose it is,
-- not about who is looking.
create or replace function public.planner_goals_helps_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal record;
begin
  if new.helps_goal_id is null then
    return new;
  end if;
  if new.category is null then
    raise exception 'Only a target can help a goal.' using errcode = 'P0001';
  end if;
  select g.family_id, g.owner_member_id, g.category into v_goal
    from public.planner_goals g where g.id = new.helps_goal_id;
  if not found or v_goal.family_id <> new.family_id then
    raise exception 'That goal is not in this household.' using errcode = 'P0001';
  end if;
  if v_goal.category is not null then
    raise exception 'A target helps a goal, not another target.' using errcode = 'P0001';
  end if;
  if v_goal.owner_member_id is not null and v_goal.owner_member_id is distinct from new.owner_member_id then
    raise exception 'A target helps a goal of the same person, or the whole household''s.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goals_helps_check() from public, anon, authenticated;

drop trigger if exists planner_goals_helps_check on public.planner_goals;
create trigger planner_goals_helps_check
  before insert or update of helps_goal_id, category, owner_member_id, family_id on public.planner_goals
  for each row execute function public.planner_goals_helps_check();
