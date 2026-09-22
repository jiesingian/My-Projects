-- Habit tracking: what a task is worth, and who says it was done
-- ===============================================================
--
-- Two things, because they are one feature. A task earns points when it is
-- answered for, and a child's answer waits for a parent before it counts.
-- An adult's does not wait for anybody -- same tracking, same streak, same
-- points, no approval step.
--
-- Points live on the task rather than being one-per-tick: emptying the
-- dishwasher and washing the car are not the same job, and a system that
-- pretends they are stops being worth playing within a week.
alter table public.routines add column if not exists points integer not null default 1;

alter table public.routines drop constraint if exists routines_points_sane;
alter table public.routines add constraint routines_points_sane
  check (points >= 0 and points <= 100);

-- `not_required` is the default and the honest name for it: an adult's tick
-- is not "pre-approved", nobody was ever going to be asked. Every row that
-- existed before this migration gets it, which is correct -- they were all
-- logged when there was no such thing as approval.
alter table public.routine_log add column if not exists approval text not null default 'not_required';
alter table public.routine_log add column if not exists approved_by uuid references public.members(id) on delete set null;
alter table public.routine_log add column if not exists approved_at timestamptz;

alter table public.routine_log drop constraint if exists routine_log_approval_check;
alter table public.routine_log add constraint routine_log_approval_check
  check (approval in ('not_required', 'pending', 'approved', 'rejected'));

-- The parent's queue is "everything still waiting", asked per household on
-- every visit to Today, so it is worth an index rather than a scan.
create index if not exists routine_log_pending_approval_idx
  on public.routine_log (family_id) where approval = 'pending';
