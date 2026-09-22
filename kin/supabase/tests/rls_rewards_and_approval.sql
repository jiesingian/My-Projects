-- Can a child let themselves off? Asked of the database, not of the app.
-- =====================================================================
--
-- Kin ships a browser Supabase client (src/lib/supabase/client.ts, used by
-- chat and uploads) and the anon key is public by design, so a signed-in
-- child can send PostgREST anything they like as themselves. Every role
-- check in a server action is therefore a user interface. Row-level
-- security is the only boundary, and this file is how we know it holds.
--
-- HOW TO RUN IT
-- Paste the whole file into the dev project's SQL editor, or pipe it to
-- psql. It ends in `rollback`, so it writes nothing that survives -- but
-- run it against dev (peborutoxsqqwgxwgxjo), never production.
--
-- WHAT TO LOOK FOR
-- Every row of the final table should say 'ok'. Two things make that
-- meaningful:
--
--   * A denial is only counted when SQLSTATE is 42501. An earlier version
--     of this probe counted any exception as "blocked" and quietly passed
--     a case that was really failing a CHECK constraint -- a probe that
--     cannot tell "forbidden" from "malformed" proves nothing.
--   * The last case is a CONTROL. It puts routine_log's policy back the
--     way it shipped in #130 and asks the same forbidden question again,
--     expecting it to be ALLOWED. If that row ever starts saying
--     'blocked by RLS', the control has stopped controlling for anything
--     and the case above it is no longer evidence.
--
-- It expects the migrations to have been applied already. To run it against
-- a migration that has not merged yet, paste that file in just above the
-- fixture below -- which is how this one was checked before it shipped.

begin;

-- A whole synthetic household, invented here and rolled back at the end.
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'probe-parent@example.invalid'),
  ('55555555-5555-5555-5555-555555555555', 'probe-child@example.invalid');

insert into families (id, name, invite_code)
values ('11111111-1111-1111-1111-111111111111', 'Probe household', 'PROBE1');

-- The roles are 'parent', 'adult', 'child_managed' and 'child_self'. There
-- is no role called 'child'; asking for one is how the approval check in
-- #130 came to mean "never".
insert into members (id, family_id, full_name, role, auth_user_id, status) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Probe Parent', 'parent',     '44444444-4444-4444-4444-444444444444', 'active'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Probe Child',  'child_self', '55555555-5555-5555-5555-555555555555', 'active');

insert into routines (id, family_id, title, freq, start_date, points)
values ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'Probe chore', 'daily', current_date, 5);

insert into routine_log (id, routine_id, family_id, occurrence_date, status, member_id, approval)
values ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', current_date, 'done', '33333333-3333-3333-3333-333333333333', 'pending');

insert into rewards (id, family_id, title, cost_points)
values ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'An hour of screen time', 10);

-- Each case runs as a real signed-in member: role 'authenticated', and a
-- jwt 'sub' the security-definer helpers resolve to that member. This is
-- the same footing a browser has.
create temp table probe_results (n int, label text, expected text, actual text);
create temp sequence probe_seq;

create function pg_temp.probe(p_label text, p_who uuid, p_stmt text, p_expect text) returns void as $fn$
begin
  begin
    execute 'set local role authenticated';
    execute format('set local request.jwt.claims = %L', json_build_object('sub', p_who, 'role', 'authenticated')::text);
    execute p_stmt;
    execute 'reset role';
    insert into probe_results values (nextval('probe_seq'), p_label, p_expect, 'allowed');
  exception when others then
    -- 42501 is "insufficient privilege", which is what a policy refusing a
    -- row looks like. Anything else is the probe being wrong, not the
    -- database being right, and says so rather than passing quietly.
    execute 'reset role';
    insert into probe_results values (nextval('probe_seq'), p_label, p_expect,
      case when SQLSTATE = '42501' then 'blocked by RLS' else 'error ' || SQLSTATE end);
  end;
  perform set_config('request.jwt.claims', '', true);
end;
$fn$ language plpgsql;

-- What a reward costs is a grown-up's to set --------------------------------
select pg_temp.probe('child invents a reward', '55555555-5555-5555-5555-555555555555',
  $q$insert into rewards (family_id, title, cost_points) values ('11111111-1111-1111-1111-111111111111', 'A pony', 1)$q$, 'blocked by RLS');
select pg_temp.probe('child re-prices a reward', '55555555-5555-5555-5555-555555555555',
  $q$update rewards set cost_points = 1 where id = '66666666-6666-6666-6666-666666666666'$q$, 'blocked by RLS');
select pg_temp.probe('child retires a reward', '55555555-5555-5555-5555-555555555555',
  $q$update rewards set active = false where id = '66666666-6666-6666-6666-666666666666'$q$, 'blocked by RLS');
select pg_temp.probe('parent adds a reward', '44444444-4444-4444-4444-444444444444',
  $q$insert into rewards (family_id, title, cost_points) values ('11111111-1111-1111-1111-111111111111', 'Choose Friday dinner', 20)$q$, 'allowed');

-- Asking is allowed. Asking cheaply, or in someone else's name, is not -------
select pg_temp.probe('child asks, properly', '55555555-5555-5555-5555-555555555555',
  $q$insert into reward_redemptions (id, family_id, reward_id, member_id, cost_points, status) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 10, 'pending')$q$, 'allowed');
select pg_temp.probe('child asks at a forged price', '55555555-5555-5555-5555-555555555555',
  $q$insert into reward_redemptions (family_id, reward_id, member_id, cost_points, status) values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 1, 'pending')$q$, 'blocked by RLS');
select pg_temp.probe('child grants at the moment of asking', '55555555-5555-5555-5555-555555555555',
  $q$insert into reward_redemptions (family_id, reward_id, member_id, cost_points, status) values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 10, 'granted')$q$, 'blocked by RLS');
select pg_temp.probe('child asks in someone elses name', '55555555-5555-5555-5555-555555555555',
  $q$insert into reward_redemptions (family_id, reward_id, member_id, cost_points, status) values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 10, 'pending')$q$, 'blocked by RLS');

-- Answering is a grown-up's, full stop --------------------------------------
select pg_temp.probe('child grants their own request', '55555555-5555-5555-5555-555555555555',
  $q$update reward_redemptions set status = 'granted' where id = '99999999-9999-9999-9999-999999999999'$q$, 'blocked by RLS');
select pg_temp.probe('parent grants it', '44444444-4444-4444-4444-444444444444',
  $q$update reward_redemptions set status = 'granted', decided_by = '22222222-2222-2222-2222-222222222222', decided_at = now() where id = '99999999-9999-9999-9999-999999999999'$q$, 'allowed');

-- And the same question, asked of the chore ---------------------------------
select pg_temp.probe('child approves their own chore', '55555555-5555-5555-5555-555555555555',
  $q$update routine_log set approval = 'approved' where id = '88888888-8888-8888-8888-888888888888'$q$, 'blocked by RLS');
-- Locking the answer must not lock the child out of their own tick.
select pg_temp.probe('child marks their chore skipped instead', '55555555-5555-5555-5555-555555555555',
  $q$update routine_log set status = 'skipped', approval = 'not_required' where id = '88888888-8888-8888-8888-888888888888'$q$, 'allowed');
select pg_temp.probe('child unticks by deleting the row', '55555555-5555-5555-5555-555555555555',
  $q$delete from routine_log where id = '88888888-8888-8888-8888-888888888888'$q$, 'allowed');

insert into routine_log (id, routine_id, family_id, occurrence_date, status, member_id, approval)
values ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', current_date, 'done', '33333333-3333-3333-3333-333333333333', 'pending');

select pg_temp.probe('parent approves the chore', '44444444-4444-4444-4444-444444444444',
  $q$update routine_log set approval = 'approved', approved_by = '22222222-2222-2222-2222-222222222222' where id = '88888888-8888-8888-8888-888888888888'$q$, 'allowed');

-- The control ---------------------------------------------------------------
-- Put the policy back the way it shipped and ask the forbidden question
-- again. It is expected to succeed. If it ever stops succeeding, the case
-- above it has stopped being evidence of anything.
update routine_log set approval = 'pending' where id = '88888888-8888-8888-8888-888888888888';
drop policy if exists routine_log_update on routine_log;
create policy routine_log_update on routine_log
  for update using (family_id = current_family_id());

select pg_temp.probe('CONTROL: the same, under the policy as it shipped in #130', '55555555-5555-5555-5555-555555555555',
  $q$update routine_log set approval = 'approved' where id = '88888888-8888-8888-8888-888888888888'$q$, 'allowed');

select n, label, expected, actual, case when expected = actual then 'ok' else 'FAIL' end as verdict
from probe_results order by n;

rollback;
