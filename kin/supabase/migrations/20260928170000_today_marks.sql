-- Today as one list, and everything on it can be ticked (Jonathan, 28 September:
-- "what's the difference with needs you today and today's task? shouldn't they
-- be the same and prioritized at the top? ... should be allowed to be marked as
-- done or skip like in today's task").
--
-- Chores already record done and skipped in routine_log. The rest of Today --
-- a one-off plan, a check-up, a bill, a birthday, the shopping -- had nowhere
-- to say "handled" for the day. This is that place: one row per item per day,
-- for the household. A plan's own status and a check-up's are still set where
-- they exist (actions/today.ts); this row is what Today reads to show the item
-- as done or skipped, with Undo, for the rest of the day.
--
-- item_key is Today's own id for the item ("activity-<uuid>", "bill-<uuid>",
-- "event-<uuid>", "health-<uuid>", "buy"), so any kind Today shows can be marked
-- without a table per kind. Rows are small and one-day; nothing else reads them.

create table if not exists public.today_marks (
  family_id uuid not null references public.families(id) on delete cascade,
  item_key text not null check (length(item_key) between 1 and 80),
  day date not null,
  state text not null check (state in ('done', 'skipped')),
  marked_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (family_id, item_key, day)
);

alter table public.today_marks enable row level security;

-- The household's own rows, for its active members. The subquery is wrapped
-- in (select ...) so auth.uid() is evaluated once per statement, not per row.
drop policy if exists "today_marks: household reads" on public.today_marks;
create policy "today_marks: household reads" on public.today_marks
  for select to authenticated
  using (family_id in (select m.family_id from public.members m where m.auth_user_id = (select auth.uid()) and m.status = 'active'));

drop policy if exists "today_marks: household writes" on public.today_marks;
create policy "today_marks: household writes" on public.today_marks
  for insert to authenticated
  with check (family_id in (select m.family_id from public.members m where m.auth_user_id = (select auth.uid()) and m.status = 'active'));

drop policy if exists "today_marks: household changes" on public.today_marks;
create policy "today_marks: household changes" on public.today_marks
  for update to authenticated
  using (family_id in (select m.family_id from public.members m where m.auth_user_id = (select auth.uid()) and m.status = 'active'))
  with check (family_id in (select m.family_id from public.members m where m.auth_user_id = (select auth.uid()) and m.status = 'active'));

drop policy if exists "today_marks: household clears" on public.today_marks;
create policy "today_marks: household clears" on public.today_marks
  for delete to authenticated
  using (family_id in (select m.family_id from public.members m where m.auth_user_id = (select auth.uid()) and m.status = 'active'));
