-- Goal rewards: only the one who gives it may say yes, and a goal with a
-- reward in play changes only with the giver's yes. Asked of the database.
-- ========================================================================
--
-- Same footing and the same outcome words as rls_planner_goals.sql: every
-- case runs as a signed-in member (role authenticated, a jwt 'sub').
--   'allowed'         touched at least one row
--   'no rows'         a USING clause hid the row (how RLS refuses an update)
--   'blocked by RLS'  SQLSTATE 42501
--   'error P0001'     a trigger or function said no; 'error P0002' not found
--
-- Run against dev (peborutoxsqqwgxwgxjo) only. It ends in `rollback`.
-- The move cases at the end need 20260928223000_goal_move_reconcile.sql. To
-- check 20260928220500_goal_reward_giver.sql before it merges, paste it in
-- just after `begin;`.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'giver-parent@example.invalid'),
  ('a0000000-0000-0000-0000-000000000002', 'giver-adult@example.invalid'),
  ('a0000000-0000-0000-0000-000000000003', 'giver-child@example.invalid'),
  ('b0000000-0000-0000-0000-000000000001', 'giver-other@example.invalid');

select set_config('kin.privileged', 'on', true);
insert into families (id, name, invite_code, access_status) values
  ('a1000000-0000-0000-0000-000000000000', 'Giver probe A', 'GIVPRA', 'comped'),
  ('b1000000-0000-0000-0000-000000000000', 'Giver probe B', 'GIVPRB', 'comped');
select set_config('kin.privileged', 'off', true);

insert into members (id, family_id, full_name, role, auth_user_id, status) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Probe Parent', 'parent',     'a0000000-0000-0000-0000-000000000001', 'active'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Probe Adult',  'adult',      'a0000000-0000-0000-0000-000000000002', 'active'),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'Probe Child',  'child_self', 'a0000000-0000-0000-0000-000000000003', 'active'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'Other Parent', 'parent',     'b0000000-0000-0000-0000-000000000001', 'active');

-- Goals: the child's (g1), one the parent sets for the child (g2), the
-- parent's own (g3), and a household goal with no reward (g4).
insert into planner_goals (id, family_id, title, kind, owner_member_id, target, period, created_by) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Read 12 books', 'custom', 'a2000000-0000-0000-0000-000000000003', 12, 'total', 'a2000000-0000-0000-0000-000000000003'),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Tidy room daily', 'custom', 'a2000000-0000-0000-0000-000000000003', 30, 'total', 'a2000000-0000-0000-0000-000000000001'),
  ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'Gym', 'gym', 'a2000000-0000-0000-0000-000000000001', 3, 'week', 'a2000000-0000-0000-0000-000000000001'),
  ('a3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000000', 'Water', 'water', null, 24, 'day', 'a2000000-0000-0000-0000-000000000001');

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

-- Asking --------------------------------------------------------------------
select pg_temp.probe('child names themselves giver of their own reward', 'a0000000-0000-0000-0000-000000000003',
  $q$insert into planner_goal_rewards (goal_id, family_id, title, proposed_by, giver_member_id) values ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'x', 'a2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000003')$q$, 'blocked by RLS');
select pg_temp.probe('child writes the parents promise for them', 'a0000000-0000-0000-0000-000000000003',
  $q$insert into planner_goal_rewards (goal_id, family_id, title, status, proposed_by, giver_member_id, decided_by) values ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'x', 'approved', 'a2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001')$q$, 'blocked by RLS');
select pg_temp.probe('child asks the parent for ₱500', 'a0000000-0000-0000-0000-000000000003',
  $q$insert into planner_goal_rewards (goal_id, family_id, title, proposed_by, giver_member_id) values ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', '₱500', 'a2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001')$q$, 'allowed');

-- Only the giver answers --------------------------------------------------
select pg_temp.probe('child approves their own request', 'a0000000-0000-0000-0000-000000000003',
  $q$update planner_goal_rewards set status = 'approved', decided_by = 'a2000000-0000-0000-0000-000000000003' where goal_id = 'a3000000-0000-0000-0000-000000000001'$q$, 'no rows');
select pg_temp.probe('another adult (not the giver) approves', 'a0000000-0000-0000-0000-000000000002',
  $q$update planner_goal_rewards set status = 'approved', decided_by = 'a2000000-0000-0000-0000-000000000002' where goal_id = 'a3000000-0000-0000-0000-000000000001'$q$, 'no rows');
select pg_temp.probe('the giver says yes, at ₱300', 'a0000000-0000-0000-0000-000000000001',
  $q$update planner_goal_rewards set status = 'approved', title = '₱300', decided_by = 'a2000000-0000-0000-0000-000000000001', decided_at = now() where goal_id = 'a3000000-0000-0000-0000-000000000001'$q$, 'allowed');
select pg_temp.probe('the giver hands the promise to someone else', 'a0000000-0000-0000-0000-000000000001',
  $q$update planner_goal_rewards set giver_member_id = 'a2000000-0000-0000-0000-000000000002' where goal_id = 'a3000000-0000-0000-0000-000000000001'$q$, 'error P0001');

-- Changing the goal -------------------------------------------------------
select pg_temp.probe('child lowers the target directly', 'a0000000-0000-0000-0000-000000000003',
  $q$update planner_goals set target = 10 where id = 'a3000000-0000-0000-0000-000000000001'$q$, 'error P0001');
select pg_temp.probe('child renames it directly', 'a0000000-0000-0000-0000-000000000003',
  $q$update planner_goals set title = 'Read ten books' where id = 'a3000000-0000-0000-0000-000000000001'$q$, 'allowed');
select pg_temp.probe('child asks to lower the target to 10', 'a0000000-0000-0000-0000-000000000003',
  $q$insert into planner_goal_changes (id, family_id, goal_id, proposed_by, target) values ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 10)$q$, 'allowed');
select pg_temp.probe('another adult answers the change', 'a0000000-0000-0000-0000-000000000002',
  $q$select public.decide_goal_change('a4000000-0000-0000-0000-000000000001', true)$q$, 'blocked by RLS');
select pg_temp.probe('child answers their own change', 'a0000000-0000-0000-0000-000000000003',
  $q$select public.decide_goal_change('a4000000-0000-0000-0000-000000000001', true)$q$, 'blocked by RLS');
select pg_temp.probe('the giver approves the change', 'a0000000-0000-0000-0000-000000000001',
  $q$select public.decide_goal_change('a4000000-0000-0000-0000-000000000001', true)$q$, 'allowed');
select pg_temp.probe('the target is now 10', 'a0000000-0000-0000-0000-000000000003',
  $q$select 1 from planner_goals where id = 'a3000000-0000-0000-0000-000000000001' and target = 10$q$, 'allowed');
select pg_temp.probe('answering it twice', 'a0000000-0000-0000-0000-000000000001',
  $q$select public.decide_goal_change('a4000000-0000-0000-0000-000000000001', false)$q$, 'error P0001');
select pg_temp.probe('the giver edits the target directly', 'a0000000-0000-0000-0000-000000000001',
  $q$update planner_goals set target = 11 where id = 'a3000000-0000-0000-0000-000000000001'$q$, 'allowed');
select pg_temp.probe('the giver marks it given', 'a0000000-0000-0000-0000-000000000001',
  $q$update planner_goal_rewards set status = 'given', given_at = now(), decided_by = 'a2000000-0000-0000-0000-000000000001' where goal_id = 'a3000000-0000-0000-0000-000000000001'$q$, 'allowed');
select pg_temp.probe('once given, the child edits the target freely', 'a0000000-0000-0000-0000-000000000003',
  $q$update planner_goals set target = 13 where id = 'a3000000-0000-0000-0000-000000000001'$q$, 'allowed');

-- Offering, and a child as the giver ---------------------------------------
select pg_temp.probe('parent offers a reward on the childs goal', 'a0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goal_rewards (goal_id, family_id, title, status, proposed_by, giver_member_id, decided_by) values ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Bookshop trip', 'approved', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001')$q$, 'allowed');
select pg_temp.probe('parent asks the child for a massage', 'a0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goal_rewards (goal_id, family_id, title, proposed_by, giver_member_id) values ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'A massage', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003')$q$, 'allowed');
select pg_temp.probe('parent approves the massage they asked for', 'a0000000-0000-0000-0000-000000000001',
  $q$update planner_goal_rewards set status = 'approved', decided_by = 'a2000000-0000-0000-0000-000000000001' where goal_id = 'a3000000-0000-0000-0000-000000000003'$q$, 'no rows');
select pg_temp.probe('the child promises it', 'a0000000-0000-0000-0000-000000000003',
  $q$update planner_goal_rewards set status = 'approved', decided_by = 'a2000000-0000-0000-0000-000000000003', decided_at = now() where goal_id = 'a3000000-0000-0000-0000-000000000003'$q$, 'allowed');
select pg_temp.probe('parent raises their own target while the child promised', 'a0000000-0000-0000-0000-000000000001',
  $q$update planner_goals set target = 2 where id = 'a3000000-0000-0000-0000-000000000003'$q$, 'error P0001');
select pg_temp.probe('a goal with no reward edits directly', 'a0000000-0000-0000-0000-000000000003',
  $q$update planner_goals set target = 20 where id = 'a3000000-0000-0000-0000-000000000004'$q$, 'allowed');
select pg_temp.probe('the owner still cannot change', 'a0000000-0000-0000-0000-000000000001',
  $q$update planner_goals set owner_member_id = 'a2000000-0000-0000-0000-000000000002' where id = 'a3000000-0000-0000-0000-000000000003'$q$, 'error P0001');

-- Another household ------------------------------------------------------------
select pg_temp.probe('other household reads the changes', 'b0000000-0000-0000-0000-000000000001',
  $q$select * from planner_goal_changes$q$, 'no rows');
select pg_temp.probe('other household asks a change on A', 'b0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goal_changes (family_id, goal_id, proposed_by, target) values ('b1000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000001', 1)$q$, 'blocked by RLS');
select pg_temp.probe('other household answers a change of A', 'b0000000-0000-0000-0000-000000000001',
  $q$select public.decide_goal_change('a4000000-0000-0000-0000-000000000001', true)$q$, 'error P0002');
select pg_temp.probe('other household names itself giver on A', 'b0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goal_rewards (goal_id, family_id, title, proposed_by, giver_member_id) values ('a3000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000000', 'x', 'b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001')$q$, 'blocked by RLS');
select pg_temp.probe('other household answers a reward of A', 'b0000000-0000-0000-0000-000000000001',
  $q$update planner_goal_rewards set status = 'refused', decided_by = 'b2000000-0000-0000-0000-000000000001' where goal_id = 'a3000000-0000-0000-0000-000000000003'$q$, 'no rows');

select pg_temp.probe('CONTROL: household A reads its own changes', 'a0000000-0000-0000-0000-000000000003',
  $q$select * from planner_goal_changes where family_id = 'a1000000-0000-0000-0000-000000000000'$q$, 'allowed');

-- Moving household (20260928214500, restored by 20260928223000): a goal and
-- its reward follow the owner to their new household only while
-- members_bring_personal_space() names the person moving. Run as the
-- database owner, the way that function runs.
select set_config('kin.privileged', 'on', true);
insert into members (id, family_id, full_name, role, status, person_id)
select 'b2000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000000', 'Probe Parent (moved)', 'parent', 'invited', person_id
from members where id = 'a2000000-0000-0000-0000-000000000001';
select set_config('kin.privileged', 'off', true);

do $$
begin
  begin
    update planner_goal_rewards set family_id = 'b1000000-0000-0000-0000-000000000000' where goal_id = 'a3000000-0000-0000-0000-000000000003';
    insert into probe_results values (nextval('probe_seq'), 'a reward changes household outside a move', 'error P0001', 'allowed');
  exception when others then
    insert into probe_results values (nextval('probe_seq'), 'a reward changes household outside a move', 'error P0001', 'error ' || SQLSTATE);
  end;
  begin
    update planner_goals set family_id = 'b1000000-0000-0000-0000-000000000000', owner_member_id = 'b2000000-0000-0000-0000-000000000009' where id = 'a3000000-0000-0000-0000-000000000003';
    insert into probe_results values (nextval('probe_seq'), 'a goal changes household outside a move', 'error P0001', 'allowed');
  exception when others then
    insert into probe_results values (nextval('probe_seq'), 'a goal changes household outside a move', 'error P0001', 'error ' || SQLSTATE);
  end;
  begin
    perform set_config('kin.moving_person', (select person_id::text from members where id = 'a2000000-0000-0000-0000-000000000001'), true);
    update planner_goals set family_id = 'b1000000-0000-0000-0000-000000000000', owner_member_id = 'b2000000-0000-0000-0000-000000000009' where id = 'a3000000-0000-0000-0000-000000000003';
    update planner_goal_rewards set family_id = 'b1000000-0000-0000-0000-000000000000' where goal_id = 'a3000000-0000-0000-0000-000000000003';
    perform set_config('kin.moving_person', '', true);
    insert into probe_results values (nextval('probe_seq'), 'a goal and its reward follow the owner during a move', 'allowed', 'allowed');
  exception when others then
    insert into probe_results values (nextval('probe_seq'), 'a goal and its reward follow the owner during a move', 'allowed', 'error ' || SQLSTATE);
  end;
end $$;

select n, label, expected, actual, case when expected = actual then 'ok' else 'FAIL' end as verdict
from probe_results order by n;

rollback;
