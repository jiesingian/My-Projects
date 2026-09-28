-- Medicines: an update cannot take a medicine over. Needs the tables from
-- 20260926110000 and 20260928090000. Run against dev. Ends in rollback.

begin;
insert into auth.users (id,email) values ('a1111111-1111-1111-1111-111111111111','x@x.invalid'),('a2222222-2222-2222-2222-222222222222','y@x.invalid');
insert into families (id,name,invite_code) values ('aaaaaaaa-0000-0000-0000-000000000001','A','MEDAAA');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
 ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Parent','parent','a1111111-1111-1111-1111-111111111111','active'),
 ('a0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001','Teen','child_self','a2222222-2222-2222-2222-222222222222','active');
insert into health_medicines (id,family_id,member_id,name,created_by) values ('11000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000b','Amoxicillin','a0000000-0000-0000-0000-00000000000a');
create temp table pr (n serial, label text, expected text, actual text); grant all on pr to authenticated; grant all on sequence pr_n_seq to authenticated;
select set_config('request.jwt.claims', json_build_object('sub','a2222222-2222-2222-2222-222222222222','role','authenticated')::text, true);
set local role authenticated;
update health_medicines set created_by='a0000000-0000-0000-0000-00000000000b', visibility='private' where id='11000000-0000-0000-0000-000000000001';
reset role;
insert into pr (label,expected,actual) select 'Teen tries to take it over: owner and visibility kept', 'a0000000-0000-0000-0000-00000000000a family', created_by::text||' '||visibility from health_medicines;
do $$ begin
  set local role authenticated;
  update health_medicines set visibility='parents' where id='11000000-0000-0000-0000-000000000001';
  reset role;
exception when insufficient_privilege then reset role; end $$;
insert into pr (label,expected,actual) select 'Teen sets parents-only: refused or kept', 'family', visibility from health_medicines;
select set_config('request.jwt.claims', json_build_object('sub','a1111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
set local role authenticated;
update health_medicines set visibility='parents' where id='11000000-0000-0000-0000-000000000001';
reset role;
insert into pr (label,expected,actual) select 'Parent who created it may make it parents-only', 'parents', visibility from health_medicines;
select n,label,expected,actual,case when actual=expected then 'PASS' else 'FAIL' end verdict from pr order by n;
rollback;
