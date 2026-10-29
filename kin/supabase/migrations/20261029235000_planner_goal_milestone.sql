-- 🎯 milestones (Jonathan, 29 October): a goal that follows a balance, a
-- loan or a fund is celebrated at 25, 50, 75 and 100% -- once each. This is
-- the highest one already celebrated, so a balance dipping and climbing
-- back does not set it off again. Kin sets it with whoever moved the money
-- (planner_goals_update already lets anyone in the household).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.planner_goals
  add column if not exists milestone smallint not null default 0;

alter table public.planner_goals drop constraint if exists planner_goals_milestone_step;
alter table public.planner_goals add constraint planner_goals_milestone_step
  check (milestone in (0, 25, 50, 75, 100));
