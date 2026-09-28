-- A promised reward is kept: locked, due in a day, chased until received.
-- ======================================================================
--
-- Asked of the database (20260929003000_goal_reward_assurance.sql). Same
-- footing and outcome words as rls_goal_reward_giver.sql:
--   'allowed' touched a row · 'no rows' a policy hid it · 'blocked by RLS'
--   SQLSTATE 42501 · 'error P0001' / 'error P0002' a trigger or function.
--
-- Run against dev (peborutoxsqqwgxwgxjo) only. It ends in `rollback`; the
-- reminder cases create a throwaway cron secret inside the transaction.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'promise-parent@example.invalid'),
  ('a0000000-0000-0000-0000-000000000002', 'promise-adult@example.invalid'),
  ('a0000000-0000-0000-0000-000000000003', 'promise-child@example.invalid'),
  ('b0000000-0000-0000-0000-000000000001', 'promise-other@example.invalid');

select set_config('kin.privileged', 'on', true);
insert into families (id, name, invite_code, access_status) values
  ('a1000000-0000-0000-0000-000000000000', 'Promise probe A', 'PROMPA', 'comped'),
  ('b1000000-0000-0000-0000-000000000000', 'Promise probe B', 'PROMPB', 'comped');
select set_config('kin.privileged', 'off', true);

insert into members (id, family_id, full_name, role, auth_user_id, status) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Probe Parent', 'parent',     'a0000000-0000-0000-0000-000000000001', 'active'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Probe Adult',  'adult',      'a0000000-0000-0000-0000-000000000002', 'active'),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'Probe Child',  'child_self', 'a0000000-0000-0000-0000-000000000003', 'active'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'Other Parent', 'parent',     'b0000000-0000-0000-0000-000000000001', 'active');

insert into planner_goals (id, family_id, title, kind, owner_member_id, target, period, created_by) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Read 12 books', 'custom', 'a2000000-0000-0000-0000-000000000003', 12, 'total', 'a2000000-0000-0000-0000-000000000003'),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Tidy room', 'custom', 'a2000000-0000-0000-0000-000000000003', 30, 'total', 'a2000000-0000-0000-0000-000000000001'),
  ('a3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000000', 'Water', 'water', null, 24, 'day', 'a2000000-0000-0000-0000-000000000001');

-- The child asks the parent for ₱500; the parent offers a trip on the other.
insert into planner_goal_rewards (goal_id, family_id, title, proposed_by, giver_member_id) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', '₱500', 'a2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001');
insert into planner_goal_rewards (goal_id, family_id, title, status, proposed_by, giver_member_id, decided_by) values
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Bookshop trip', 'approved', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001');

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

-- 1. Locked ------------------------------------------------------------------
select pg_temp.probe('the giver rewrites the reward directly', 'a0000000-0000-0000-0000-000000000001',
  $q$update planner_goal_rewards set title = '₱100' where goal_id = 'a3000000-0000-0000-0000-000000000001'$q$, 'no rows');
select pg_temp.probe('another adult promises for the giver', 'a0000000-0000-0000-0000-000000000002',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'promise')$q$, 'blocked by RLS');
select pg_temp.probe('the child claims before any promise', 'a0000000-0000-0000-0000-000000000003',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'claim')$q$, 'blocked by RLS');
select pg_temp.probe('the giver promises', 'a0000000-0000-0000-0000-000000000001',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'promise')$q$, 'allowed');
select pg_temp.probe('the giver takes the promise back', 'a0000000-0000-0000-0000-000000000001',
  $q$delete from planner_goal_rewards where goal_id = 'a3000000-0000-0000-0000-000000000001'$q$, 'no rows');
select pg_temp.probe('the giver deletes the goal under it', 'a0000000-0000-0000-0000-000000000001',
  $q$delete from planner_goals where id = 'a3000000-0000-0000-0000-000000000001'$q$, 'error P0001');

-- 2. A day, and 3. chased until received ----------------------------------------
select pg_temp.probe('the giver claims it for themselves', 'a0000000-0000-0000-0000-000000000001',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'claim')$q$, 'blocked by RLS');
select pg_temp.probe('the child claims it', 'a0000000-0000-0000-0000-000000000003',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'claim')$q$, 'allowed');
select pg_temp.probe('a day is due', 'a0000000-0000-0000-0000-000000000003',
  $q$select 1 from planner_goal_rewards where goal_id = 'a3000000-0000-0000-0000-000000000001' and status = 'claimed' and due_at between now() + interval '23 hours' and now() + interval '25 hours'$q$, 'allowed');
select pg_temp.probe('the child marks it given themselves', 'a0000000-0000-0000-0000-000000000003',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'give')$q$, 'blocked by RLS');
select pg_temp.probe('the giver marks it given', 'a0000000-0000-0000-0000-000000000001',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'give')$q$, 'allowed');
select pg_temp.probe('the giver confirms it themselves', 'a0000000-0000-0000-0000-000000000001',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'confirm')$q$, 'blocked by RLS');
select pg_temp.probe('the child says not yet', 'a0000000-0000-0000-0000-000000000003',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'dispute')$q$, 'allowed');
select pg_temp.probe('not yet makes it overdue now', 'a0000000-0000-0000-0000-000000000003',
  $q$select 1 from planner_goal_rewards where goal_id = 'a3000000-0000-0000-0000-000000000001' and status = 'claimed' and due_at <= now()$q$, 'allowed');

-- The chase: a throwaway secret, a push subscription for the giver, 10:00 Manila.
select vault.create_secret(repeat('s', 40), 'kin_cron_secret');
insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'https://push.example.invalid/1', 'k', 'a');
do $$
declare
  -- 10:00 Manila tomorrow: after the reward fell due (just now), in the day.
  morning timestamptz := (date_trunc('day', now() at time zone 'Asia/Manila') + interval '1 day 10 hours') at time zone 'Asia/Manila';
  n_first int; n_again int; n_next int; n_night int;
begin
  select count(*) into n_first from public.due_goal_reward_reminders(repeat('s', 40), morning) d where d.key like 'goalreward:due:%';
  select count(*) into n_again from public.due_goal_reward_reminders(repeat('s', 40), morning) d where d.key like 'goalreward:due:%';
  select count(*) into n_next from public.due_goal_reward_reminders(repeat('s', 40), morning + interval '5 minutes') d where d.key like 'goalreward:due:%';
  select count(*) into n_night from public.due_goal_reward_reminders(repeat('s', 40), morning + interval '12 hours') d where d.key like 'goalreward:due:%';
  insert into probe_results values (nextval('probe_seq'), 'overdue: the giver is pushed', '1', n_first::text);
  insert into probe_results values (nextval('probe_seq'), 'the same five minutes sends once', '0', n_again::text);
  insert into probe_results values (nextval('probe_seq'), 'five minutes later, again', '1', n_next::text);
  insert into probe_results values (nextval('probe_seq'), 'never at night (22:00)', '0', n_night::text);
end $$;

select pg_temp.probe('the giver gives it again', 'a0000000-0000-0000-0000-000000000001',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'give')$q$, 'allowed');
select pg_temp.probe('the child confirms', 'a0000000-0000-0000-0000-000000000003',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000001', 'confirm')$q$, 'allowed');
do $$
declare
  n int;
begin
  select count(*) into n from public.due_goal_reward_reminders(repeat('s', 40), (date_trunc('day', now() at time zone 'Asia/Manila') + interval '1 day 10 hours 30 minutes') at time zone 'Asia/Manila') d where d.key like 'goalreward:due:%';
  insert into probe_results values (nextval('probe_seq'), 'received: the chase stops', '0', n::text);
end $$;

-- A child promising is held to the same rule.
insert into planner_goal_rewards (goal_id, family_id, title, proposed_by, giver_member_id) values
  ('a3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000000', 'A foot massage', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003');
select pg_temp.probe('the child promises a massage', 'a0000000-0000-0000-0000-000000000003',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000004', 'promise')$q$, 'allowed');
select pg_temp.probe('anyone else in the house claims it', 'a0000000-0000-0000-0000-000000000002',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000004', 'claim')$q$, 'allowed');

-- Changing a goal: the other side of the promise answers --------------------------
select pg_temp.probe('the giver raises the bar directly', 'a0000000-0000-0000-0000-000000000001',
  $q$update planner_goals set target = 60 where id = 'a3000000-0000-0000-0000-000000000002'$q$, 'error P0001');
select pg_temp.probe('the giver asks to raise it', 'a0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goal_changes (id, family_id, goal_id, proposed_by, target) values ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 60)$q$, 'allowed');
select pg_temp.probe('the giver agrees to their own change', 'a0000000-0000-0000-0000-000000000001',
  $q$select public.decide_goal_change('a4000000-0000-0000-0000-000000000001', true)$q$, 'blocked by RLS');
select pg_temp.probe('another adult agrees for the child', 'a0000000-0000-0000-0000-000000000002',
  $q$select public.decide_goal_change('a4000000-0000-0000-0000-000000000001', true)$q$, 'blocked by RLS');
select pg_temp.probe('the child keeps it as it was', 'a0000000-0000-0000-0000-000000000003',
  $q$select public.decide_goal_change('a4000000-0000-0000-0000-000000000001', false)$q$, 'allowed');

-- Another household ------------------------------------------------------------
select pg_temp.probe('other household acts on a reward of A', 'b0000000-0000-0000-0000-000000000001',
  $q$select public.goal_reward_act('a3000000-0000-0000-0000-000000000002', 'claim')$q$, 'error P0002');
select pg_temp.probe('the chase without the secret', 'b0000000-0000-0000-0000-000000000001',
  $q$select * from public.due_goal_reward_reminders('wrong', now())$q$, 'no rows');

select n, label, expected, actual, case when expected = actual then 'ok' else 'FAIL' end as verdict
from probe_results order by n;

rollback;
