-- The remittance log: grown-ups only, "Just me" means just the recorder, and
-- nothing crosses households. Asked of the database.
-- ========================================================================
--
-- Same footing and outcome words as rls_goal_reward_giver.sql: every case
-- runs as a signed-in member (role authenticated, a jwt 'sub').
--   'allowed'         touched or returned at least one row
--   'no rows'         a USING clause hid the row
--   'blocked by RLS'  SQLSTATE 42501
--   'error P0001'     a trigger or function said no; 'error P0002' not found
--
-- Run against dev (peborutoxsqqwgxwgxjo) only. It ends in `rollback`. To
-- check 20260930100000_remittance_log.sql before it merges, paste it in just
-- after `begin;`.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'remit-parent@example.invalid'),
  ('a0000000-0000-0000-0000-000000000002', 'remit-adult@example.invalid'),
  ('a0000000-0000-0000-0000-000000000003', 'remit-child@example.invalid'),
  ('b0000000-0000-0000-0000-000000000001', 'remit-other@example.invalid');

select set_config('kin.privileged', 'on', true);
insert into families (id, name, invite_code, access_status) values
  ('a1000000-0000-0000-0000-000000000000', 'Remit probe A', 'RMTPRA', 'comped'),
  ('b1000000-0000-0000-0000-000000000000', 'Remit probe B', 'RMTPRB', 'comped');
select set_config('kin.privileged', 'off', true);

insert into members (id, family_id, full_name, role, auth_user_id, status) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Probe Parent', 'parent',     'a0000000-0000-0000-0000-000000000001', 'active'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Probe Adult',  'adult',      'a0000000-0000-0000-0000-000000000002', 'active'),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'Probe Child',  'child_self', 'a0000000-0000-0000-0000-000000000003', 'active'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'Other Parent', 'parent',     'b0000000-0000-0000-0000-000000000001', 'active');

-- Accounts: a joint one (a4..1), the parent's own private one (a4..2), the
-- adult's own (a4..3), and one in the other household (b4..1).
insert into accounts (id, family_id, name, opening_balance, is_joint, owner_member_id, is_private, account_type) values
  ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Joint BDO',     0, true,  null,                                   false, 'bank'),
  ('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Parent GCash',  0, false, 'a2000000-0000-0000-0000-000000000001', true,  'ewallet'),
  ('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'Adult savings', 0, false, 'a2000000-0000-0000-0000-000000000002', false, 'bank'),
  ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'Other bank',    0, true,  null,                                   false, 'bank');

-- Two remittances the parent recorded: one for the household (r1), one
-- "Just me" (r2), each with an allocation.
insert into remittances (id, family_id, sender_name, amount, currency, sent_on, php_received, channel, is_private, recorded_by) values
  ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Kuya Ben', 500, 'USD', '2026-09-25', 28000, 'bank',              false, 'a2000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Kuya Ben', 1000, 'SAR', '2026-09-26', 14800, 'remittance_centre', true,  'a2000000-0000-0000-0000-000000000001');
insert into remittance_allocations (id, remittance_id, family_id, purpose, amount) values
  ('a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Tuition', 15000),
  ('a6000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Lola''s medicine', 4000);

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

-- Who sees what -------------------------------------------------------------
select pg_temp.probe('parent sees the household remittance', 'a0000000-0000-0000-0000-000000000001',
  $q$select 1 from remittances where id = 'a5000000-0000-0000-0000-000000000001'$q$, 'allowed');
select pg_temp.probe('other grown-up sees the household remittance', 'a0000000-0000-0000-0000-000000000002',
  $q$select 1 from remittances where id = 'a5000000-0000-0000-0000-000000000001'$q$, 'allowed');
select pg_temp.probe('child sees no remittances at all', 'a0000000-0000-0000-0000-000000000003',
  $q$select 1 from remittances$q$, 'no rows');
select pg_temp.probe('child sees no allocations at all', 'a0000000-0000-0000-0000-000000000003',
  $q$select 1 from remittance_allocations$q$, 'no rows');
select pg_temp.probe('parent sees their own Just-me remittance', 'a0000000-0000-0000-0000-000000000001',
  $q$select 1 from remittances where id = 'a5000000-0000-0000-0000-000000000002'$q$, 'allowed');
select pg_temp.probe('other grown-up cannot see a Just-me remittance', 'a0000000-0000-0000-0000-000000000002',
  $q$select 1 from remittances where id = 'a5000000-0000-0000-0000-000000000002'$q$, 'no rows');
select pg_temp.probe('...nor what it went to', 'a0000000-0000-0000-0000-000000000002',
  $q$select 1 from remittance_allocations where id = 'a6000000-0000-0000-0000-000000000002'$q$, 'no rows');
select pg_temp.probe('other household sees nothing of ours', 'b0000000-0000-0000-0000-000000000001',
  $q$select 1 from remittances where family_id = 'a1000000-0000-0000-0000-000000000000'$q$, 'no rows');

-- Who changes what ----------------------------------------------------------
select pg_temp.probe('other grown-up corrects the household remittance', 'a0000000-0000-0000-0000-000000000002',
  $q$update remittances set php_received = 28100 where id = 'a5000000-0000-0000-0000-000000000001'$q$, 'allowed');
select pg_temp.probe('other grown-up edits a Just-me remittance', 'a0000000-0000-0000-0000-000000000002',
  $q$update remittances set php_received = 1 where id = 'a5000000-0000-0000-0000-000000000002'$q$, 'no rows');
select pg_temp.probe('other grown-up deletes a Just-me remittance', 'a0000000-0000-0000-0000-000000000002',
  $q$delete from remittances where id = 'a5000000-0000-0000-0000-000000000002'$q$, 'no rows');
select pg_temp.probe('...or through delete_remittance', 'a0000000-0000-0000-0000-000000000002',
  $q$select delete_remittance('a5000000-0000-0000-0000-000000000002')$q$, 'error P0002');
select pg_temp.probe('other grown-up adds to a Just-me remittance''s allocations', 'a0000000-0000-0000-0000-000000000002',
  $q$insert into remittance_allocations (remittance_id, family_id, purpose, amount) values ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'x', 1)$q$, 'blocked by RLS');
select pg_temp.probe('child edits a remittance', 'a0000000-0000-0000-0000-000000000003',
  $q$update remittances set php_received = 1 where id = 'a5000000-0000-0000-0000-000000000001'$q$, 'no rows');
select pg_temp.probe('other household edits ours', 'b0000000-0000-0000-0000-000000000001',
  $q$update remittances set php_received = 1 where id = 'a5000000-0000-0000-0000-000000000001'$q$, 'no rows');
select pg_temp.probe('recorder hands their row to someone else', 'a0000000-0000-0000-0000-000000000001',
  $q$update remittances set is_private = true, recorded_by = 'a2000000-0000-0000-0000-000000000002' where id = 'a5000000-0000-0000-0000-000000000002'$q$, 'blocked by RLS');

-- Recording one -------------------------------------------------------------
select pg_temp.probe('child records a remittance directly', 'a0000000-0000-0000-0000-000000000003',
  $q$insert into remittances (family_id, sender_name, amount, currency, sent_on, php_received, channel, recorded_by) values ('a1000000-0000-0000-0000-000000000000', 'x', 1, 'USD', '2026-09-01', 1, 'bank', 'a2000000-0000-0000-0000-000000000003')$q$, 'blocked by RLS');
select pg_temp.probe('child records one through log_remittance', 'a0000000-0000-0000-0000-000000000003',
  $q$select log_remittance(null, 'x', null, 1, 'USD', '2026-09-01', null, null, null, 1, 'bank', null, null, null, false, '[]')$q$, 'blocked by RLS');
select pg_temp.probe('other household records one into ours', 'b0000000-0000-0000-0000-000000000001',
  $q$insert into remittances (family_id, sender_name, amount, currency, sent_on, php_received, channel, recorded_by) values ('a1000000-0000-0000-0000-000000000000', 'x', 1, 'USD', '2026-09-01', 1, 'bank', 'b2000000-0000-0000-0000-000000000001')$q$, 'blocked by RLS');
select pg_temp.probe('grown-up records one in someone else''s name', 'a0000000-0000-0000-0000-000000000002',
  $q$insert into remittances (family_id, sender_name, amount, currency, sent_on, php_received, channel, recorded_by) values ('a1000000-0000-0000-0000-000000000000', 'x', 1, 'USD', '2026-09-01', 1, 'bank', 'a2000000-0000-0000-0000-000000000001')$q$, 'blocked by RLS');
select pg_temp.probe('parent logs one into the joint account, with allocations', 'a0000000-0000-0000-0000-000000000001',
  $q$select log_remittance('a2000000-0000-0000-0000-000000000002', null, 'a2000000-0000-0000-0000-000000000001', 700, 'AED', '2026-09-27', 15.51, '2026-09-26', 'usd_peg', 10500, 'gcash', null, 'a4000000-0000-0000-0000-000000000001', 'for October', false, '[{"purpose":"Rent","amount":6000},{"purpose":"Groceries","amount":3000,"category":"Groceries"}]')$q$, 'allowed');
select pg_temp.probe('...and the money-in landed on the joint account', 'a0000000-0000-0000-0000-000000000002',
  $q$select 1 from wealth_transactions t join remittances r on r.transaction_id = t.id where t.account_id = 'a4000000-0000-0000-0000-000000000001' and t.source_table = 'remittances' and t.source_id = r.id and t.amount = 10500 and t.direction = 'in'$q$, 'allowed');
select pg_temp.probe('...with both allocations', 'a0000000-0000-0000-0000-000000000002',
  $q$select 1 from remittance_allocations a join remittances r on r.id = a.remittance_id where r.amount = 700 having count(*) = 2$q$, 'allowed');
select pg_temp.probe('a Just-me remittance into a joint account', 'a0000000-0000-0000-0000-000000000001',
  $q$select log_remittance(null, 'Kuya Ben', null, 100, 'USD', '2026-09-20', null, null, null, 5600, 'bank', null, 'a4000000-0000-0000-0000-000000000001', null, true, '[]')$q$, 'blocked by RLS');
select pg_temp.probe('a Just-me remittance into your own account', 'a0000000-0000-0000-0000-000000000001',
  $q$select log_remittance(null, 'Kuya Ben', null, 100, 'USD', '2026-09-20', null, null, null, 5600, 'bank', null, 'a4000000-0000-0000-0000-000000000002', null, true, '[]')$q$, 'allowed');
select pg_temp.probe('grown-up logs into another member''s own account', 'a0000000-0000-0000-0000-000000000002',
  $q$select log_remittance(null, 'Kuya Ben', null, 100, 'USD', '2026-09-20', null, null, null, 5600, 'bank', null, 'a4000000-0000-0000-0000-000000000002', null, false, '[]')$q$, 'blocked by RLS');
select pg_temp.probe('logs into another household''s account', 'a0000000-0000-0000-0000-000000000001',
  $q$select log_remittance(null, 'Kuya Ben', null, 100, 'USD', '2026-09-20', null, null, null, 5600, 'bank', null, 'b4000000-0000-0000-0000-000000000001', null, false, '[]')$q$, 'blocked by RLS');
select pg_temp.probe('names another household''s member as sender', 'a0000000-0000-0000-0000-000000000001',
  $q$select log_remittance('b2000000-0000-0000-0000-000000000001', null, null, 100, 'USD', '2026-09-20', null, null, null, 5600, 'bank', null, null, null, false, '[]')$q$, 'blocked by RLS');
select pg_temp.probe('allocations add up to more than arrived', 'a0000000-0000-0000-0000-000000000001',
  $q$select log_remittance(null, 'Kuya Ben', null, 100, 'USD', '2026-09-20', null, null, null, 5600, 'bank', null, null, null, false, '[{"purpose":"Tuition","amount":6000}]')$q$, 'error P0001');
select pg_temp.probe('flipping a joint-account remittance to Just me', 'a0000000-0000-0000-0000-000000000001',
  $q$update remittances set is_private = true where amount = 700$q$, 'blocked by RLS');

-- Deleting one takes its money-in with it -----------------------------------
select pg_temp.probe('parent deletes the joint-account remittance', 'a0000000-0000-0000-0000-000000000001',
  $q$select delete_remittance((select id from remittances where amount = 700))$q$, 'allowed');
select pg_temp.probe('...and its money-in is gone too', 'a0000000-0000-0000-0000-000000000001',
  $q$select 1 from wealth_transactions where source_table = 'remittances' and account_id = 'a4000000-0000-0000-0000-000000000001'$q$, 'no rows');

select n, label, expected, actual, case when expected = actual then 'ok' else 'FAIL' end as verdict
from probe_results order by n;

rollback;
