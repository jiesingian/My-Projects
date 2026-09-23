-- Chat attachments stay with their message, their sender and their household
-- ==========================================================================
--
-- The file itself is guarded by the storage policies every bucket already has.
-- This is about the index row, which is what a signed URL is asked for by --
-- so the questions are whether a row can point somewhere it should not, and
-- whether it can be hung off a message that is not yours.
--
-- Run against dev (peborutoxsqqwgxwgxjo). Ends in `rollback`.

begin;

insert into auth.users (id,email) values
  ('a1111111-1111-1111-1111-111111111111','probe-a@example.invalid'),
  ('a2222222-2222-2222-2222-222222222222','probe-a2@example.invalid'),
  ('b1111111-1111-1111-1111-111111111111','probe-b@example.invalid');
insert into families (id,name,invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A','ATTAAA'),
  ('bbbbbbbb-0000-0000-0000-000000000002','House B','ATTBBB');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','A One','parent','a1111111-1111-1111-1111-111111111111','active'),
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','A Two','adult','a2222222-2222-2222-2222-222222222222','active'),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','B One','parent','b1111111-1111-1111-1111-111111111111','active');
insert into family_messages (id,family_id,member_id,body) values
  ('11111111-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a',''),
  ('11111111-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000c','housemate'),
  ('22222222-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','b0000000-0000-0000-0000-00000000000b','other house');

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
    insert into pr values (nextval('ps'), l, exp, case when SQLSTATE='42501' then 'blocked by RLS'
      when SQLSTATE='23514' then 'refused by check: '||coalesce(nullif(split_part(SQLERRM,'"',4),''),SQLERRM)
      else 'refused: '||SQLERRM end);
  end;
  perform set_config('request.jwt.claims','',true);
end; $fn$ language plpgsql;
create function pg_temp.visible(l text, who uuid, q text, exp int) returns void as $fn$
declare n int;
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub',who,'role','authenticated')::text);
  execute q into n; execute 'reset role';
  insert into pr values (nextval('ps'), l, exp||' row(s)', n||' row(s)');
  perform set_config('request.jwt.claims','',true);
end; $fn$ language plpgsql;

select pg_temp.probe('A attaches a photo to their own message','a1111111-1111-1111-1111-111111111111',
  $$insert into family_message_attachments (id,message_id,family_id,storage_path,file_name,mime_type,size_bytes)
    values ('99999999-0000-0000-0000-00000000000a','11111111-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/chat/1-fridge.jpg','fridge.jpg','image/jpeg',120000)$$,
  'allowed');
select pg_temp.probe('A hangs a file off their housemate''s message','a1111111-1111-1111-1111-111111111111',
  $$insert into family_message_attachments (message_id,family_id,storage_path,file_name,mime_type,size_bytes)
    values ('11111111-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/chat/2-x.jpg','x.jpg','image/jpeg',100)$$,
  'blocked by RLS');
-- The index row names another household's file. The storage policy would
-- still refuse to sign it, but a table that can only hold its own
-- household's paths is not one anybody has to reason about later.
select pg_temp.probe('A indexes a path under the other household''s prefix','a1111111-1111-1111-1111-111111111111',
  $$insert into family_message_attachments (message_id,family_id,storage_path,file_name,mime_type,size_bytes)
    values ('11111111-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001',
            'bbbbbbbb-0000-0000-0000-000000000002/chat/their-passport.jpg','p.jpg','image/jpeg',100)$$,
  'refused by check: family_message_attachments_path_in_family');
select pg_temp.probe('A attaches to the other household''s message','a1111111-1111-1111-1111-111111111111',
  $$insert into family_message_attachments (message_id,family_id,storage_path,file_name,mime_type,size_bytes)
    values ('22222222-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002',
            'bbbbbbbb-0000-0000-0000-000000000002/chat/x.jpg','x.jpg','image/jpeg',100)$$,
  'blocked by RLS');
select pg_temp.probe('A attaches an empty file','a1111111-1111-1111-1111-111111111111',
  $$insert into family_message_attachments (message_id,family_id,storage_path,file_name,mime_type,size_bytes)
    values ('11111111-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/chat/3-empty.txt','empty.txt','text/plain',0)$$,
  'refused by check: family_message_attachments_size_positive');

select pg_temp.visible('B sees A''s attachment','b1111111-1111-1111-1111-111111111111',
  $$select count(*) from family_message_attachments$$, 0);
select pg_temp.visible('A''s housemate sees it','a2222222-2222-2222-2222-222222222222',
  $$select count(*) from family_message_attachments$$, 1);

-- A DELETE a policy hides every row from reports success having matched
-- nothing, so the row is counted afterwards rather than trusting the absence
-- of an error.
select pg_temp.probe('A''s housemate tries to remove it','a2222222-2222-2222-2222-222222222222',
  $$delete from family_message_attachments where id = '99999999-0000-0000-0000-00000000000a'$$, 'allowed');
insert into pr select nextval('ps'), '...and it is still there', '1 row(s)', count(*)||' row(s)'
  from family_message_attachments where id = '99999999-0000-0000-0000-00000000000a';
select pg_temp.probe('A removes their own','a1111111-1111-1111-1111-111111111111',
  $$delete from family_message_attachments where id = '99999999-0000-0000-0000-00000000000a'$$, 'allowed');
insert into pr select nextval('ps'), '...and it is gone', '0 row(s)', count(*)||' row(s)'
  from family_message_attachments where id = '99999999-0000-0000-0000-00000000000a';

select n, label, expected, actual, case when actual = expected then 'PASS' else 'FAIL' end as verdict from pr order by n;
rollback;
