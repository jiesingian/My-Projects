-- The only hole in the wall, and how wide it actually is
-- ======================================================
--
-- Every other policy in this database is family_id = current_family_id().
-- The Family Feed is the single exception, so this file exists to measure
-- it: not only that sharing works, but that nothing travels alongside it.
--
-- The cases that matter most are the negative ones. A feature like this
-- fails safe when it does not work and fails badly when it works too well,
-- and "the shared entry appeared" tells you nothing about whether the
-- private one did too.
--
-- Run against dev (peborutoxsqqwgxwgxjo), never production. Ends in
-- `rollback`. Expects the migrations to have been applied. Every row of the
-- final table should say 'ok'.

begin;

-- Two entirely separate households.
insert into auth.users (id,email) values
  ('a1111111-1111-1111-1111-111111111111','a-parent@example.invalid'),
  ('a2222222-2222-2222-2222-222222222222','a-child@example.invalid'),
  ('b1111111-1111-1111-1111-111111111111','b-parent@example.invalid');
insert into families (id,name,invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A','CODEAA'),
  ('bbbbbbbb-0000-0000-0000-000000000002','House B','CODEBB');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','A Parent','parent','a1111111-1111-1111-1111-111111111111','active'),
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','A Child','child_self','a2222222-2222-2222-2222-222222222222','active'),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','B Parent','parent','b1111111-1111-1111-1111-111111111111','active');

-- One shared and one private, so every visibility check can tell them apart.
insert into journal_entries (id,family_id,entry_date,title,note,source,shared_at) values
  ('e0000000-0000-0000-0000-00000000000f','aaaaaaaa-0000-0000-0000-000000000001',current_date,'A shared memory','note','manual',now()),
  ('e0000000-0000-0000-0000-00000000000e','aaaaaaaa-0000-0000-0000-000000000001',current_date,'A PRIVATE memory','secret','manual',null);
insert into journal_media (family_id, media_type, storage_provider, storage_path)
  values ('aaaaaaaa-0000-0000-0000-000000000001','photo','supabase','a/secret.jpg');

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
    -- The full message, not a prefix. An earlier version truncated it to a
    -- guessed length and reported two passing cases as failures, which
    -- wasted a run proving the probe wrong rather than the schema right.
    insert into pr values (nextval('ps'), l, exp, case when SQLSTATE='42501' then 'blocked by RLS' else 'refused: '||SQLERRM end);
  end;
  perform set_config('request.jwt.claims','',true);
end; $fn$ language plpgsql;

select pg_temp.probe('B sees nothing of A before any link','b1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; begin select count(*) into n from journal_entries where family_id='aaaaaaaa-0000-0000-0000-000000000001'; if n<>0 then raise exception 'saw %', n using errcode='22000'; end if; end $$$q$,'allowed');
select pg_temp.probe('B requests a link with As code','b1111111-1111-1111-1111-111111111111',
  $q$select request_family_link('codeaa')$q$,'allowed');
-- Consent is the point: asking must not be enough.
select pg_temp.probe('a pending link shares nothing yet','b1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; begin select count(*) into n from journal_entries where family_id='aaaaaaaa-0000-0000-0000-000000000001'; if n<>0 then raise exception 'saw %', n using errcode='22000'; end if; end $$$q$,'allowed');
select pg_temp.probe('B cannot accept its own request','b1111111-1111-1111-1111-111111111111',
  $q$select respond_family_link((select id from family_links limit 1), true)$q$,'refused: That request was not made to your household.');
select pg_temp.probe('As child cannot accept','a2222222-2222-2222-2222-222222222222',
  $q$select respond_family_link((select id from family_links limit 1), true)$q$,'refused: Only a parent or another adult can answer this.');
select pg_temp.probe('As parent accepts','a1111111-1111-1111-1111-111111111111',
  $q$select respond_family_link((select id from family_links limit 1), true)$q$,'allowed');

-- Now the link is live. What crosses, and what does not.
select pg_temp.probe('B now sees the shared entry, and only that one','b1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; t text; begin select count(*) into n from journal_entries where family_id='aaaaaaaa-0000-0000-0000-000000000001'; select title into t from journal_entries where family_id='aaaaaaaa-0000-0000-0000-000000000001'; if n<>1 or t<>'A shared memory' then raise exception 'saw % (%)', n, t using errcode='22000'; end if; end $$$q$,'allowed');
select pg_temp.probe('the album does not travel','b1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; begin select count(*) into n from journal_media where family_id='aaaaaaaa-0000-0000-0000-000000000001'; if n<>0 then raise exception 'saw %', n using errcode='22000'; end if; end $$$q$,'allowed');
select pg_temp.probe('nor do As members','b1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; begin select count(*) into n from members where family_id='aaaaaaaa-0000-0000-0000-000000000001'; if n<>0 then raise exception 'saw %', n using errcode='22000'; end if; end $$$q$,'allowed');
-- Readable is not writable.
select pg_temp.probe('B cannot edit As shared entry','b1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; begin update journal_entries set title='HIJACKED' where id='e0000000-0000-0000-0000-00000000000f'; get diagnostics n = row_count; if n<>0 then raise exception 'changed %', n using errcode='22000'; end if; end $$$q$,'allowed');
-- And the link itself cannot be forged; there is no insert policy at all.
select pg_temp.probe('B cannot hand-write a link','b1111111-1111-1111-1111-111111111111',
  $q$insert into family_links (requester_family_id,addressee_family_id,status) values ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','accepted')$q$,'blocked by RLS');

-- Revocation is one-sided and immediate.
select pg_temp.probe('B revokes on its own','b1111111-1111-1111-1111-111111111111',
  $q$select revoke_family_link((select id from family_links where status='accepted' limit 1))$q$,'allowed');
select pg_temp.probe('and the entry vanishes again','b1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; begin select count(*) into n from journal_entries where family_id='aaaaaaaa-0000-0000-0000-000000000001'; if n<>0 then raise exception 'saw %', n using errcode='22000'; end if; end $$$q$,'allowed');
select pg_temp.probe('A still sees both of its own','a1111111-1111-1111-1111-111111111111',
  $q$do $$ declare n int; begin select count(*) into n from journal_entries where family_id='aaaaaaaa-0000-0000-0000-000000000001'; if n<>2 then raise exception 'saw %', n using errcode='22000'; end if; end $$$q$,'allowed');

select n,label,expected,actual,case when expected=actual then 'ok' else 'FAIL' end as verdict from pr order by n;

rollback;
