-- Chat replies, the pinned message, and read receipts
-- ===================================================
--
-- Three questions, and one of them is a regression test.
--
--   1. Can a member post as somebody else in their own household? Until the
--      migration that goes with this file, yes -- family_messages_insert
--      checked the household and not the author. Cases 2 and 3.
--   2. Can a reply or a pin reach out of the household? Cases 5, 8, 9.
--   3. Read receipts widen family_message_reads from "your own marker" to
--      "everyone's, to read". Does the write side stay shut? Cases 13, 14.
--
-- Run against dev (peborutoxsqqwgxwgxjo). Ends in `rollback`; nothing here
-- survives the transaction.

begin;

insert into auth.users (id,email) values
  ('a1111111-1111-1111-1111-111111111111','probe-a@example.invalid'),
  ('a2222222-2222-2222-2222-222222222222','probe-a2@example.invalid'),
  ('b1111111-1111-1111-1111-111111111111','probe-b@example.invalid');
insert into families (id,name,invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A','CHATAA'),
  ('bbbbbbbb-0000-0000-0000-000000000002','House B','CHATBB');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','A One','parent','a1111111-1111-1111-1111-111111111111','active'),
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','A Two','adult','a2222222-2222-2222-2222-222222222222','active'),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','B One','parent','b1111111-1111-1111-1111-111111111111','active');
insert into family_messages (id,family_id,member_id,body) values
  ('11111111-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','Anyone home?'),
  ('22222222-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','b0000000-0000-0000-0000-00000000000b','Other household');
insert into family_message_reads (member_id,family_id,last_read_at) values
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001',now()),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002',now());

create temp table pr (n int, label text, expected text, actual text);
create temp sequence ps;

-- Only SQLSTATE 42501 counts as row-level security refusing. A check
-- constraint or a trigger failing is a different answer to a different
-- question, and an earlier probe in this repository scored one as the other.
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

-- A row a policy hides is not an error, it is an absence, so counting is the
-- only way to ask "can this person see it".
create function pg_temp.visible(l text, who uuid, q text, exp int) returns void as $fn$
declare n int;
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub',who,'role','authenticated')::text);
  execute q into n;
  execute 'reset role';
  insert into pr values (nextval('ps'), l, exp||' row(s)', n||' row(s)');
  perform set_config('request.jwt.claims','',true);
end; $fn$ language plpgsql;

-- ── posting as yourself, and not as anybody else ─────────────────────────
select pg_temp.probe('A posts as themselves','a1111111-1111-1111-1111-111111111111',
  $$insert into family_messages (family_id,member_id,body) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','mine')$$,
  'allowed');
select pg_temp.probe('A posts as their housemate','a1111111-1111-1111-1111-111111111111',
  $$insert into family_messages (family_id,member_id,body) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000c','not mine to send')$$,
  'blocked by RLS');
select pg_temp.probe('A posts into the other household','a1111111-1111-1111-1111-111111111111',
  $$insert into family_messages (family_id,member_id,body) values ('bbbbbbbb-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','wrong house')$$,
  'blocked by RLS');

-- ── replies stay in the household ────────────────────────────────────────
select pg_temp.probe('A replies to a message at home','a1111111-1111-1111-1111-111111111111',
  $$insert into family_messages (family_id,member_id,body,reply_to) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','yes','11111111-0000-0000-0000-00000000000a')$$,
  'allowed');
select pg_temp.probe('A replies to the other household''s message','a1111111-1111-1111-1111-111111111111',
  $$insert into family_messages (family_id,member_id,body,reply_to) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','eavesdropping','22222222-0000-0000-0000-00000000000b')$$,
  'refused: A reply must point at a message in the same household.');

-- ── the pinned message ───────────────────────────────────────────────────
select pg_temp.probe('A pins a message at home','a1111111-1111-1111-1111-111111111111',
  $$insert into family_chat_pins (family_id,message_id,pinned_by) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a')$$,
  'allowed');
select pg_temp.probe('A pins and credits their housemate','a1111111-1111-1111-1111-111111111111',
  $$insert into family_chat_pins (family_id,message_id,pinned_by) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000c')$$,
  'blocked by RLS');
select pg_temp.probe('A pins into the other household','a1111111-1111-1111-1111-111111111111',
  $$insert into family_chat_pins (family_id,message_id,pinned_by) values ('bbbbbbbb-0000-0000-0000-000000000002','22222222-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a')$$,
  'blocked by RLS');
select pg_temp.visible('B sees A''s pin','b1111111-1111-1111-1111-111111111111',
  $$select count(*) from family_chat_pins$$, 0);
select pg_temp.visible('A''s housemate sees the pin','a2222222-2222-2222-2222-222222222222',
  $$select count(*) from family_chat_pins$$, 1);
-- Five people do not need a moderator: whoever is there can take it down.
select pg_temp.probe('A''s housemate unpins it','a2222222-2222-2222-2222-222222222222',
  $$delete from family_chat_pins where family_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'allowed');

-- ── read receipts ────────────────────────────────────────────────────────
select pg_temp.visible('A reads their housemate''s marker','a1111111-1111-1111-1111-111111111111',
  $$select count(*) from family_message_reads where member_id = 'a0000000-0000-0000-0000-00000000000c'$$, 1);
select pg_temp.visible('A reads the other household''s markers','a1111111-1111-1111-1111-111111111111',
  $$select count(*) from family_message_reads where family_id = 'bbbbbbbb-0000-0000-0000-000000000002'$$, 0);
-- Widening the read side must not widen the write side: marking somebody
-- else as having seen a message is how a read receipt stops meaning anything.
--
-- An UPDATE that a policy hides every row from does not raise -- it matches
-- nothing and reports success -- so asking whether it errored proves nothing.
-- The question worth asking is whether the row moved.
create temp table before_update as
  select member_id, last_read_at from family_message_reads where member_id = 'a0000000-0000-0000-0000-00000000000c';
select pg_temp.probe('A tries to mark their housemate as having read','a1111111-1111-1111-1111-111111111111',
  $$update family_message_reads set last_read_at = now() + interval '1 day' where member_id = 'a0000000-0000-0000-0000-00000000000c'$$,
  'allowed');
-- Checked as the owner rather than through pg_temp.visible: that helper takes
-- the `authenticated` role, which cannot read this probe's own temp table.
insert into pr
  select nextval('ps'), '...and the housemate''s marker did not move', '0 row(s)',
         count(*)||' row(s)'
  from family_message_reads r join before_update b using (member_id)
  where r.last_read_at <> b.last_read_at;
select pg_temp.probe('A inserts a marker for their housemate','a1111111-1111-1111-1111-111111111111',
  $$insert into family_message_reads (member_id,family_id) values ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001')$$,
  'blocked by RLS');

select n, label, expected, actual, case when actual = expected then 'PASS' else 'FAIL' end as verdict from pr order by n;

rollback;
