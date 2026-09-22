-- Can a relative read, or replace, your lock? Asked of the database.
-- ===================================================================
--
-- Every other table in Kin is readable by the whole household, and that is
-- correct: a family's records belong to the family. These two are the
-- exception. A pin hash and a list of registered authenticators belong to
-- one person, and `members` -- which the family screen reads in full -- is
-- exactly where they must not live.
--
-- So the policies here use current_member_id(), not current_family_id().
-- This file is what proves that distinction survived contact with the
-- schema, because it is one word's difference and it is invisible in review.
--
-- Run against dev (peborutoxsqqwgxwgxjo), never production. Ends in
-- `rollback`. Expects the migrations to have been applied.
--
-- NOTE ON CASE 4. A parent's UPDATE of somebody else's row does not raise
-- 42501 -- the row is simply not visible to it, so the statement succeeds
-- having changed nothing. "Succeeded" and "did what it wanted" are not the
-- same thing, and a probe that only watched for an exception would call
-- that a pass while the pin was being overwritten. It checks row_count and
-- then re-reads the value.

begin;

insert into auth.users (id,email) values
  ('44444444-4444-4444-4444-444444444444','probe-parent@example.invalid'),
  ('55555555-5555-5555-5555-555555555555','probe-child@example.invalid');
insert into families (id,name,invite_code) values ('11111111-1111-1111-1111-111111111111','Probe household','PROBE1');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Probe Parent','parent','44444444-4444-4444-4444-444444444444','active'),
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','Probe Child','child_self','55555555-5555-5555-5555-555555555555','active');

insert into member_security (member_id, pin_hash, pin_salt) values ('33333333-3333-3333-3333-333333333333','ORIGINAL','ORIGINAL');
insert into member_webauthn_credentials (member_id, credential_id, public_key, alg)
  values ('33333333-3333-3333-3333-333333333333','probe-cred','probe-spki',-7);

create temp table pr (n int, label text, expected text, actual text);
create temp sequence ps;
create function pg_temp.probe(l text, who uuid, stmt text, exp text) returns void as $fn$
begin
  begin
    execute 'set local role authenticated';
    execute format('set local request.jwt.claims = %L', json_build_object('sub', who, 'role','authenticated')::text);
    execute stmt; execute 'reset role';
    insert into pr values (nextval('ps'), l, exp, 'allowed');
  exception when others then
    execute 'reset role';
    insert into pr values (nextval('ps'), l, exp, case when SQLSTATE='42501' then 'blocked by RLS' else 'error '||SQLSTATE end);
  end;
  perform set_config('request.jwt.claims','',true);
end; $fn$ language plpgsql;

-- Invisible, not merely un-writable. A relative should not learn that a
-- lock exists, let alone read its hash.
select pg_temp.probe('parent cannot see the childs security row','44444444-4444-4444-4444-444444444444',
  $q$do $$ declare n int; begin select count(*) into n from member_security; if n > 0 then raise exception 'saw % rows', n using errcode='22000'; end if; end $$$q$,'allowed');
select pg_temp.probe('parent cannot see the childs credentials','44444444-4444-4444-4444-444444444444',
  $q$do $$ declare n int; begin select count(*) into n from member_webauthn_credentials; if n > 0 then raise exception 'saw % rows', n using errcode='22000'; end if; end $$$q$,'allowed');
select pg_temp.probe('child sees their own row','55555555-5555-5555-5555-555555555555',
  $q$do $$ declare n int; begin select count(*) into n from member_security; if n <> 1 then raise exception 'saw % rows', n using errcode='22000'; end if; end $$$q$,'allowed');

-- Replacing the lock is the attack that matters: it needs no reading at all.
select pg_temp.probe('parent cannot overwrite the childs pin','44444444-4444-4444-4444-444444444444',
  $q$do $$ declare n int; begin
       update member_security set pin_hash='HIJACKED', pin_salt='HIJACKED' where member_id='33333333-3333-3333-3333-333333333333';
       get diagnostics n = row_count;
       if n <> 0 then raise exception 'parent changed % row(s)', n using errcode='22000'; end if;
     end $$$q$,'allowed');
select pg_temp.probe('and the pin is untouched','55555555-5555-5555-5555-555555555555',
  $q$do $$ declare v text; begin
       select pin_hash into v from member_security where member_id='33333333-3333-3333-3333-333333333333';
       if v <> 'ORIGINAL' then raise exception 'pin is now %', v using errcode='22000'; end if;
     end $$$q$,'allowed');

-- Nor can a relative quietly add their own face to your lock.
select pg_temp.probe('parent cannot enrol a credential onto the child','44444444-4444-4444-4444-444444444444',
  $q$insert into member_webauthn_credentials (member_id,credential_id,public_key,alg) values ('33333333-3333-3333-3333-333333333333','theirs','theirs',-7)$q$,'blocked by RLS');
select pg_temp.probe('parent cannot delete the childs credential','44444444-4444-4444-4444-444444444444',
  $q$do $$ declare n int; begin
       delete from member_webauthn_credentials where member_id='33333333-3333-3333-3333-333333333333';
       get diagnostics n = row_count;
       if n > 0 then raise exception 'deleted %', n using errcode='22000'; end if;
     end $$$q$,'allowed');

-- And the owner is not locked out of their own settings.
select pg_temp.probe('child sets their own pin','55555555-5555-5555-5555-555555555555',
  $q$update member_security set pin_hash='MINE', pin_salt='MINE' where member_id='33333333-3333-3333-3333-333333333333'$q$,'allowed');
select pg_temp.probe('child cannot create a row for the parent','55555555-5555-5555-5555-555555555555',
  $q$insert into member_security (member_id) values ('22222222-2222-2222-2222-222222222222')$q$,'blocked by RLS');

select n,label,expected,actual,case when expected=actual then 'ok' else 'FAIL' end as verdict from pr order by n;

rollback;
