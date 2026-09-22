-- Can anybody put you on the map who shouldn't? Asked of the database.
-- =====================================================================
--
-- Location is the one table here where the interface is least able to
-- protect anybody. Kin ships a browser Supabase client and the anon key is
-- public, so a signed-in member can write to PostgREST as themselves. If
-- "only you can share your location" lives in a server action, it is a
-- sentence, not a rule. These are the rules.
--
-- Run it against dev (peborutoxsqqwgxwgxjo), never production. It ends in
-- `rollback` and writes nothing that survives. Expects the migrations to
-- have been applied; every row of the final table should say 'ok'.
--
-- A denial counts only when SQLSTATE is 42501. Case 7 expects 23514
-- instead -- that one is a CHECK constraint, not a policy, and conflating
-- the two is how a probe passes while proving nothing.

begin;

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','probe-parent@example.invalid'),
  ('55555555-5555-5555-5555-555555555555','probe-child@example.invalid');
insert into families (id,name,invite_code) values ('11111111-1111-1111-1111-111111111111','Probe household','PROBE1');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Probe Parent','parent','44444444-4444-4444-4444-444444444444','active'),
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','Probe Child','child_self','55555555-5555-5555-5555-555555555555','active'),
  -- No auth_user_id: a managed profile is a record a grown-up keeps, not a
  -- person with a phone. It is the one row somebody else may enrol.
  ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','Probe Managed','child_managed',null,'managed');

create temp table pr (n int, label text, expected text, actual text);
create temp sequence ps;
create function pg_temp.probe(l text, who uuid, stmt text, exp text) returns void as $fn$
begin
  begin
    execute 'set local role authenticated';
    execute format('set local request.jwt.claims = %L', json_build_object('sub', who, 'role','authenticated')::text);
    execute stmt;
    execute 'reset role';
    insert into pr values (nextval('ps'), l, exp, 'allowed');
  exception when others then
    execute 'reset role';
    insert into pr values (nextval('ps'), l, exp, case when SQLSTATE='42501' then 'blocked by RLS' else 'error '||SQLSTATE end);
  end;
  perform set_config('request.jwt.claims','',true);
end; $fn$ language plpgsql;

select pg_temp.probe('child turns on own sharing','55555555-5555-5555-5555-555555555555',
  $q$insert into member_locations (member_id,family_id,sharing) values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111',true)$q$,'allowed');
select pg_temp.probe('child reports own position','55555555-5555-5555-5555-555555555555',
  $q$update member_locations set lat=14.5,lng=121.0,accuracy_m=12,updated_at=now() where member_id='33333333-3333-3333-3333-333333333333'$q$,'allowed');
-- Nobody signs anybody else up.
select pg_temp.probe('child turns sharing on for the parent','55555555-5555-5555-5555-555555555555',
  $q$insert into member_locations (member_id,family_id,sharing) values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',true)$q$,'blocked by RLS');
-- And a position always comes from its own device, parent or not.
select pg_temp.probe('parent moves the childs pin','44444444-4444-4444-4444-444444444444',
  $q$update member_locations set lat=0,lng=0 where member_id='33333333-3333-3333-3333-333333333333'$q$,'blocked by RLS');
select pg_temp.probe('parent enrols the managed profile','44444444-4444-4444-4444-444444444444',
  $q$insert into member_locations (member_id,family_id,sharing) values ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111',true)$q$,'allowed');
select pg_temp.probe('parent puts a position on the managed profile','44444444-4444-4444-4444-444444444444',
  $q$update member_locations set lat=1,lng=1 where member_id='66666666-6666-6666-6666-666666666666'$q$,'blocked by RLS');
-- Off means the coordinates are gone, not hidden.
select pg_temp.probe('child keeps coords while switching sharing off','55555555-5555-5555-5555-555555555555',
  $q$update member_locations set sharing=false where member_id='33333333-3333-3333-3333-333333333333'$q$,'error 23514');
select pg_temp.probe('child switches off and clears','55555555-5555-5555-5555-555555555555',
  $q$update member_locations set sharing=false,lat=null,lng=null,accuracy_m=null where member_id='33333333-3333-3333-3333-333333333333'$q$,'allowed');
-- The board is the point: the household can read it.
select pg_temp.probe('parent sees the board','44444444-4444-4444-4444-444444444444',
  $q$do $$ declare n int; begin select count(*) into n from member_locations; if n < 2 then raise exception 'only % rows visible', n using errcode='42501'; end if; end $$$q$,'allowed');

select n,label,expected,actual,case when expected=actual then 'ok' else 'FAIL' end as verdict from pr order by n;

rollback;
