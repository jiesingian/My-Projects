-- Per-person budgets and net-worth snapshots (20260930140000_wealth_charts.sql).
-- ========================================================================
--
-- Same footing and outcome words as rls_remittances.sql. Budgets: the
-- household reads them, only a grown-up writes them. Snapshots: each row is
-- its viewer's alone. Run against dev (peborutoxsqqwgxwgxjo) only; it ends
-- in `rollback`. To check the migration before it merges, paste it in just
-- after `begin;`.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'charts-parent@example.invalid'),
  ('a0000000-0000-0000-0000-000000000002', 'charts-adult@example.invalid'),
  ('a0000000-0000-0000-0000-000000000003', 'charts-child@example.invalid'),
  ('b0000000-0000-0000-0000-000000000001', 'charts-other@example.invalid');

select set_config('kin.privileged', 'on', true);
insert into families (id, name, invite_code, access_status) values
  ('a1000000-0000-0000-0000-000000000000', 'Charts probe A', 'CHTPRA', 'comped'),
  ('b1000000-0000-0000-0000-000000000000', 'Charts probe B', 'CHTPRB', 'comped');
select set_config('kin.privileged', 'off', true);

insert into members (id, family_id, full_name, role, auth_user_id, status) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Probe Parent', 'parent',     'a0000000-0000-0000-0000-000000000001', 'active'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Probe Adult',  'adult',      'a0000000-0000-0000-0000-000000000002', 'active'),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'Probe Child',  'child_self', 'a0000000-0000-0000-0000-000000000003', 'active'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'Other Parent', 'parent',     'b0000000-0000-0000-0000-000000000001', 'active');

insert into member_budgets (family_id, member_id, period_year, period_month, amount, set_by) values
  ('a1000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000002', 2026, 9, 25000, 'a2000000-0000-0000-0000-000000000001');
insert into net_worth_snapshots (viewer_member_id, family_id, scope, month, net_worth) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'all', '2026-09-01', 1500000);

create temp table probe_results (n int, label text, expected text, actual text);
create temp sequence probe_seq;
grant all on probe_results to authenticated;
grant usage on sequence probe_seq to authenticated;

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

-- Budgets -------------------------------------------------------------------
select pg_temp.probe('the adult sees their budget', 'a0000000-0000-0000-0000-000000000002',
  $q$select 1 from member_budgets$q$, 'allowed');
select pg_temp.probe('the child sees the household''s budgets too', 'a0000000-0000-0000-0000-000000000003',
  $q$select 1 from member_budgets$q$, 'allowed');
select pg_temp.probe('another household sees none', 'b0000000-0000-0000-0000-000000000001',
  $q$select 1 from member_budgets where family_id = 'a1000000-0000-0000-0000-000000000000'$q$, 'no rows');
select pg_temp.probe('a grown-up sets the child''s budget', 'a0000000-0000-0000-0000-000000000002',
  $q$insert into member_budgets (family_id, member_id, period_year, period_month, amount, set_by) values ('a1000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000003', 2026, 9, 1500, 'a2000000-0000-0000-0000-000000000002')$q$, 'allowed');
select pg_temp.probe('a grown-up changes another grown-up''s budget', 'a0000000-0000-0000-0000-000000000002',
  $q$update member_budgets set amount = 30000, set_by = 'a2000000-0000-0000-0000-000000000002' where member_id = 'a2000000-0000-0000-0000-000000000002'$q$, 'allowed');
select pg_temp.probe('...but not in someone else''s name', 'a0000000-0000-0000-0000-000000000002',
  $q$update member_budgets set amount = 1, set_by = 'a2000000-0000-0000-0000-000000000001' where member_id = 'a2000000-0000-0000-0000-000000000003'$q$, 'blocked by RLS');
select pg_temp.probe('the child sets their own budget', 'a0000000-0000-0000-0000-000000000003',
  $q$insert into member_budgets (family_id, member_id, period_year, period_month, amount, set_by) values ('a1000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000003', 2026, 10, 99999, 'a2000000-0000-0000-0000-000000000003')$q$, 'blocked by RLS');
select pg_temp.probe('the child raises their budget', 'a0000000-0000-0000-0000-000000000003',
  $q$update member_budgets set amount = 99999, set_by = 'a2000000-0000-0000-0000-000000000003'$q$, 'no rows');
select pg_temp.probe('the child deletes a budget', 'a0000000-0000-0000-0000-000000000003',
  $q$delete from member_budgets$q$, 'no rows');
select pg_temp.probe('a grown-up budgets someone in another household', 'a0000000-0000-0000-0000-000000000001',
  $q$insert into member_budgets (family_id, member_id, period_year, period_month, amount, set_by) values ('a1000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000001', 2026, 9, 1, 'a2000000-0000-0000-0000-000000000001')$q$, 'blocked by RLS');
select pg_temp.probe('another household writes into ours', 'b0000000-0000-0000-0000-000000000001',
  $q$insert into member_budgets (family_id, member_id, period_year, period_month, amount, set_by) values ('a1000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000001', 2026, 9, 1, 'b2000000-0000-0000-0000-000000000001')$q$, 'blocked by RLS');

-- Snapshots -----------------------------------------------------------------
select pg_temp.probe('the viewer reads their own line', 'a0000000-0000-0000-0000-000000000001',
  $q$select 1 from net_worth_snapshots$q$, 'allowed');
select pg_temp.probe('another grown-up in the house cannot', 'a0000000-0000-0000-0000-000000000002',
  $q$select 1 from net_worth_snapshots$q$, 'no rows');
select pg_temp.probe('the adult keeps their own month up to date', 'a0000000-0000-0000-0000-000000000002',
  $q$insert into net_worth_snapshots (viewer_member_id, family_id, scope, month, net_worth) values ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'all', '2026-09-01', 800000) on conflict (viewer_member_id, scope, month) do update set net_worth = excluded.net_worth$q$, 'allowed');
select pg_temp.probe('...and again, the same month', 'a0000000-0000-0000-0000-000000000002',
  $q$insert into net_worth_snapshots (viewer_member_id, family_id, scope, month, net_worth) values ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'all', '2026-09-01', 810000) on conflict (viewer_member_id, scope, month) do update set net_worth = excluded.net_worth$q$, 'allowed');
select pg_temp.probe('writing a row as somebody else', 'a0000000-0000-0000-0000-000000000002',
  $q$insert into net_worth_snapshots (viewer_member_id, family_id, scope, month, net_worth) values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'family', '2026-09-01', 1)$q$, 'blocked by RLS');
select pg_temp.probe('overwriting someone else''s month', 'a0000000-0000-0000-0000-000000000002',
  $q$update net_worth_snapshots set net_worth = 1 where viewer_member_id = 'a2000000-0000-0000-0000-000000000001'$q$, 'no rows');
select pg_temp.probe('a month that is not the first', 'a0000000-0000-0000-0000-000000000001',
  $q$insert into net_worth_snapshots (viewer_member_id, family_id, scope, month, net_worth) values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'family', '2026-09-15', 1)$q$, 'error 23514');

select n, label, expected, actual, case when expected = actual then 'ok' else 'FAIL' end as verdict
from probe_results order by n;

rollback;
