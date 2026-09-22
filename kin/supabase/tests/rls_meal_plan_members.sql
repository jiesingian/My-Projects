-- Meal tags stay in their own household
-- =====================================
--
-- An ordinary household table -- everyone in the house plans the meals
-- together -- so the only question worth asking of it is the boundary one.
-- Run against dev (peborutoxsqqwgxwgxjo). Ends in `rollback`.

begin;

insert into auth.users (id,email) values
  ('a1111111-1111-1111-1111-111111111111','probe-a@example.invalid'),
  ('b1111111-1111-1111-1111-111111111111','probe-b@example.invalid');
insert into families (id,name,invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A','CODEAA'),
  ('bbbbbbbb-0000-0000-0000-000000000002','House B','CODEBB');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','A P','parent','a1111111-1111-1111-1111-111111111111','active'),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','B P','parent','b1111111-1111-1111-1111-111111111111','active');
insert into meal_plans (id,family_id,plan_date,slot,dish)
  values ('11111111-2222-3333-4444-555555555555','aaaaaaaa-0000-0000-0000-000000000001',current_date,'dinner','Adobo');
insert into meal_plan_members (meal_plan_id,member_id,family_id)
  values ('11111111-2222-3333-4444-555555555555','a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001');

create temp table pr (n int, label text, expected text, actual text);
create temp sequence ps;
create function pg_temp.probe(l text, who uuid, stmt text, exp text) returns void as $fn$
begin
  begin
    execute 'set local role authenticated';
    execute format('set local request.jwt.claims = %L', json_build_object('sub',who,'role','authenticated')::text);
    execute stmt; execute 'reset role';
    insert into pr values (nextval('ps'), l, exp, 'allowed');
  exception when others then
    execute 'reset role';
    insert into pr values (nextval('ps'), l, exp, case when SQLSTATE='42501' then 'blocked by RLS' else 'refused: '||SQLERRM end);
  end;
  perform set_config('request.jwt.claims','',true);
end; $fn$ language plpgsql;

select pg_temp.probe('own household reads its tags','a1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; begin select count(*) into n from meal_plan_members; if n<>1 then raise exception 'saw %', n using errcode='22000'; end if; end $$$q$,'allowed');
select pg_temp.probe('another household sees none','b1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; begin select count(*) into n from meal_plan_members; if n<>0 then raise exception 'saw %', n using errcode='22000'; end if; end $$$q$,'allowed');
select pg_temp.probe('another household cannot tag our meal','b1111111-1111-1111-1111-111111111111',
  $q$insert into meal_plan_members (meal_plan_id,member_id,family_id) values ('11111111-2222-3333-4444-555555555555','b0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001')$q$,'blocked by RLS');
-- The cascade matters: a tag pointing at a deleted meal would keep that
-- meal's people in a filter forever.
select pg_temp.probe('deleting the meal clears its tags','a1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; begin delete from meal_plans where id='11111111-2222-3333-4444-555555555555'; select count(*) into n from meal_plan_members; if n<>0 then raise exception 'orphans: %', n using errcode='22000'; end if; end $$$q$,'allowed');

select n,label,expected,actual,case when expected=actual then 'ok' else 'FAIL' end as verdict from pr order by n;

rollback;
