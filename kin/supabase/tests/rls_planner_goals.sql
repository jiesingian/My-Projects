-- Planner goals: can another household see in, and does Kin Free stop at
-- health goals? Asked of the database, not of the app.
--
-- Who may answer a reward, and who may change a goal that has one, moved to
-- the giver on 28 September (20260928220500_goal_reward_giver.sql); those
-- cases are in rls_goal_reward_giver.sql.
-- =========================================================================
--
-- Same footing as rls_rewards_and_approval.sql: every case runs as a real
-- signed-in member (role authenticated, a jwt 'sub'), which is what a browser
-- holding the anon key can do.
--
-- HOW TO RUN IT
-- Against dev (peborutoxsqqwgxwgxjo) only, never production. It ends in
-- `rollback`, so nothing survives. To check the migration before it has
-- merged, paste 20260928180000_planner_goals.sql in just after `begin;`.
--
-- WHAT TO LOOK FOR
-- Every row of the final table says 'ok'. The outcomes are told apart:
--   'allowed'         the statement touched at least one row
--   'no rows'         it ran and touched nothing -- a USING clause hid the
--                     row, which is how RLS refuses an update or a read
--   'blocked by RLS'  SQLSTATE 42501, a WITH CHECK refusing the new row
--   'error P0001'     a trigger said no (fixed fields, Kin Plus)
-- Any other error is the probe being wrong, and shows as a FAIL.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'goals-parent@example.invalid'),
  ('a0000000-0000-0000-0000-000000000002', 'goals-adult@example.invalid'),
  ('a0000000-0000-0000-0000-000000000003', 'goals-child@example.invalid'),
  ('b0000000-0000-0000-0000-000000000001', 'goals-other@example.invalid');

-- Household A is on Plus (comped); household B is on Kin Free.
select set_config('kin.privileged', 'on', true);
insert into families (id, name, invite_code, access_status) values
  ('a1000000-0000-0000-0000-000000000000', 'Goals probe A', 'GPROBA', 'comped'),
  ('b1000000-0000-0000-0000-000000000000', 'Goals probe B', 'GPROBB', 'expired');
select set_config('kin.privileged', 'off', true);

insert into members (id, family_id, full_name, role, auth_user_id, status) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Probe Parent', 'parent',     'a0000000-0000-0000-0000-000000000001', 'active'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Probe Adult',  'adult',      'a0000000-0000-0000-0000-000000000002', 'active'),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'Probe Child',  'child_self', 'a0000000-0000-0000-0000-000000000003', 'active'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'Other Parent', 'parent',     'b0000000-0000-0000-0000-000000000001', 'active');

create temp table probe_results (n int, label text, expected text, actual text);
create temp sequence probe_seq;

create function pg_temp.probe(p_label text, p_who uuid, p_stmt text, p_expect text) returns void as $fn$
declare
  rc bigint;
begin
  begin
    execute 'set local role authenticated';
    execute format('set local request.jwt.claims = %L', json_build_object('sub', p_who, 'role', 'authenticated')::text);
    execute p_stmt;
    get diagnostics rc = row_count;
    execute 'reset role';
    insert into probe_results values (nextval('probe_seq'), p_label, p_expect, case when rc > 0 then 'allowed' else 'no rows' end);
  exception when others then
    execute 'reset role';
    insert into probe_results values (nextval('probe_seq'), p_label, p_expect,
      case when SQLSTATE = '42501' then 'blocked by RLS' else 'error ' || SQLSTATE end);
  end;
end;
$fn$ language plpgsql;

-- Setting goals -----------------------------------------------------------------
select pg_temp.probe('child sets a goal for themselves', 'a0000000-0000-0000-0000-000000000003',
  $q$insert into planner_goals (id, family_id, title, kind, owner_member_id, target, period, created_by) values ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Read 12 books', 'custom', 'a2000000-0000-0000-0000-000000000003', 12, 'total', 'a2000000-0000-0000-0000-000000000003')$q$, 'allowed');
select pg_temp.probe('parent sets a goal for themselves', 'a0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goals (id, family_id, title, kind, owner_member_id, target, period, created_by) values ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Gym', 'gym', 'a2000000-0000-0000-0000-000000000001', 3, 'week', 'a2000000-0000-0000-0000-000000000001')$q$, 'allowed');
select pg_temp.probe('parent sets a household goal', 'a0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goals (id, family_id, title, kind, owner_member_id, target, period, created_by) values ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'Water', 'water', null, 30, 'day', 'a2000000-0000-0000-0000-000000000001')$q$, 'allowed');

-- A goal keeps what it measures -----------------------------------------------
select pg_temp.probe('child hands the goal to the parent', 'a0000000-0000-0000-0000-000000000003',
  $q$update planner_goals set owner_member_id = 'a2000000-0000-0000-0000-000000000001' where id = 'a3000000-0000-0000-0000-000000000001'$q$, 'error P0001');
select pg_temp.probe('child renames it', 'a0000000-0000-0000-0000-000000000003',
  $q$update planner_goals set title = 'Read twelve books' where id = 'a3000000-0000-0000-0000-000000000001'$q$, 'allowed');
select pg_temp.probe('child logs a book', 'a0000000-0000-0000-0000-000000000003',
  $q$insert into planner_goal_entries (family_id, goal_id, member_id, entry_date, amount) values ('a1000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', current_date, 1)$q$, 'allowed');

-- Another household is refused -------------------------------------------------
select pg_temp.probe('other household reads the goals', 'b0000000-0000-0000-0000-000000000001',
  $q$select * from planner_goals where family_id = 'a1000000-0000-0000-0000-000000000000'$q$, 'no rows');
select pg_temp.probe('other household reads the rewards', 'b0000000-0000-0000-0000-000000000001',
  $q$select * from planner_goal_rewards$q$, 'no rows');
select pg_temp.probe('other household reads the entries', 'b0000000-0000-0000-0000-000000000001',
  $q$select * from planner_goal_entries$q$, 'no rows');
select pg_temp.probe('other household adds a goal to A', 'b0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goals (family_id, title, kind, target, created_by) values ('a1000000-0000-0000-0000-000000000000', 'x', 'custom', 1, 'b2000000-0000-0000-0000-000000000001')$q$, 'blocked by RLS');
select pg_temp.probe('other household sets a goal for a member of A', 'b0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goals (family_id, title, kind, owner_member_id, target, created_by) values ('b1000000-0000-0000-0000-000000000000', 'x', 'custom', 'a2000000-0000-0000-0000-000000000003', 1, 'b2000000-0000-0000-0000-000000000001')$q$, 'blocked by RLS');
select pg_temp.probe('other household logs against a goal of A', 'b0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goal_entries (family_id, goal_id, entry_date) values ('b1000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000001', current_date)$q$, 'blocked by RLS');
select pg_temp.probe('other household answers a reward of A', 'b0000000-0000-0000-0000-000000000001',
  $q$update planner_goal_rewards set status = 'refused', decided_by = 'b2000000-0000-0000-0000-000000000001' where goal_id = 'a3000000-0000-0000-0000-000000000001'$q$, 'no rows');
select pg_temp.probe('other household deletes a goal of A', 'b0000000-0000-0000-0000-000000000001',
  $q$delete from planner_goals where id = 'a3000000-0000-0000-0000-000000000001'$q$, 'no rows');

-- Kin Free: money and custom yes, health no -----------------------------------
select pg_temp.probe('free household sets a custom goal', 'b0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goals (family_id, title, kind, target, created_by) values ('b1000000-0000-0000-0000-000000000000', 'Walks', 'custom', 5, 'b2000000-0000-0000-0000-000000000001')$q$, 'allowed');
select pg_temp.probe('free household sets a steps goal', 'b0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goals (family_id, title, kind, owner_member_id, target, period, created_by) values ('b1000000-0000-0000-0000-000000000000', 'Steps', 'steps', 'b2000000-0000-0000-0000-000000000001', 8000, 'day', 'b2000000-0000-0000-0000-000000000001')$q$, 'error P0001');
select pg_temp.probe('plus household sets a steps goal', 'a0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goals (family_id, title, kind, owner_member_id, target, period, created_by) values ('a1000000-0000-0000-0000-000000000000', 'Steps', 'steps', 'a2000000-0000-0000-0000-000000000001', 8000, 'day', 'a2000000-0000-0000-0000-000000000001')$q$, 'allowed');

-- The control: the household itself can see all of it, so the 'no rows'
-- above are RLS and not an empty table.
select pg_temp.probe('CONTROL: household A reads its own goals', 'a0000000-0000-0000-0000-000000000003',
  $q$select * from planner_goals where family_id = 'a1000000-0000-0000-0000-000000000000'$q$, 'allowed');

select n, label, expected, actual, case when expected = actual then 'ok' else 'FAIL' end as verdict
from probe_results order by n;

rollback;
