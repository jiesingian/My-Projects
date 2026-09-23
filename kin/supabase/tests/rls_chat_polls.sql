-- Chat polls: one voice each, your own voice only, and inside the household
-- ===========================================================================
--
-- The shapes a poll can go wrong in: a poll hung off somebody else's message,
-- a vote cast as somebody else, a second vote on a single-choice poll, a vote
-- for an option that belongs to a different poll, and a vote that reaches
-- into another household by id.
--
-- Run against dev (peborutoxsqqwgxwgxjo). Ends in `rollback`.

begin;

insert into auth.users (id,email) values
  ('a1111111-1111-1111-1111-111111111111','probe-a@example.invalid'),
  ('a2222222-2222-2222-2222-222222222222','probe-a2@example.invalid'),
  ('b1111111-1111-1111-1111-111111111111','probe-b@example.invalid');
insert into families (id,name,invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A','POLLAA'),
  ('bbbbbbbb-0000-0000-0000-000000000002','House B','POLLBB');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','A One','parent','a1111111-1111-1111-1111-111111111111','active'),
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','A Two','child_self','a2222222-2222-2222-2222-222222222222','active'),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','B One','parent','b1111111-1111-1111-1111-111111111111','active');
insert into family_messages (id,family_id,member_id,body) values
  ('11111111-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','Dinner?'),
  ('11111111-0000-0000-0000-0000000000a2','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','Who is free?'),
  ('11111111-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000c','mine'),
  ('22222222-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','b0000000-0000-0000-0000-00000000000b','Their poll');

-- Set up as the owner: A's single-choice dinner poll, A's multi-choice
-- availability poll, and a poll in the other household.
insert into family_polls (id,message_id,family_id,question,allow_multiple) values
  ('cccccccc-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Dinner?',false),
  ('cccccccc-0000-0000-0000-0000000000a2','11111111-0000-0000-0000-0000000000a2','aaaaaaaa-0000-0000-0000-000000000001','Who is free?',true),
  ('cccccccc-0000-0000-0000-0000000000b1','22222222-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','Their poll',false);
insert into family_poll_options (id,poll_id,family_id,label,position) values
  ('dddddddd-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','Adobo',0),
  ('dddddddd-0000-0000-0000-0000000000a2','cccccccc-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','Sinigang',1),
  ('dddddddd-0000-0000-0000-0000000000e1','cccccccc-0000-0000-0000-0000000000a2','aaaaaaaa-0000-0000-0000-000000000001','Saturday',0),
  ('dddddddd-0000-0000-0000-0000000000e2','cccccccc-0000-0000-0000-0000000000a2','aaaaaaaa-0000-0000-0000-000000000001','Sunday',1),
  ('dddddddd-0000-0000-0000-0000000000b1','cccccccc-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000002','Theirs',0);

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
    insert into pr values (nextval('ps'), l, exp, case
      when SQLSTATE='42501' then 'blocked by RLS'
      when SQLSTATE='23503' then 'refused: not an option of that poll'
      when SQLSTATE='23505' then 'refused: already voted for that'
      when SQLSTATE='23514' then 'refused: '||SQLERRM
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

-- ── asking ───────────────────────────────────────────────────────────────
select pg_temp.probe('A2 puts a poll on their own message','a2222222-2222-2222-2222-222222222222',
  $$insert into family_polls (message_id,family_id,question) values ('11111111-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','Movie night?')$$,
  'allowed');
select pg_temp.probe('A2 puts a poll on A''s message','a2222222-2222-2222-2222-222222222222',
  $$insert into family_polls (message_id,family_id,question) values ('11111111-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Hijacked')$$,
  'blocked by RLS');
select pg_temp.probe('A2 adds an option to A''s poll','a2222222-2222-2222-2222-222222222222',
  $$insert into family_poll_options (poll_id,family_id,label) values ('cccccccc-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','Ice cream for dinner')$$,
  'blocked by RLS');

-- ── voting ───────────────────────────────────────────────────────────────
select pg_temp.probe('A2 votes Adobo','a2222222-2222-2222-2222-222222222222',
  $$insert into family_poll_votes (poll_id,option_id,member_id,family_id) values ('cccccccc-0000-0000-0000-0000000000a1','dddddddd-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001')$$,
  'allowed');
select pg_temp.probe('A2 votes Adobo again','a2222222-2222-2222-2222-222222222222',
  $$insert into family_poll_votes (poll_id,option_id,member_id,family_id) values ('cccccccc-0000-0000-0000-0000000000a1','dddddddd-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001')$$,
  'refused: already voted for that');
select pg_temp.probe('A2 also votes Sinigang on a single-choice poll','a2222222-2222-2222-2222-222222222222',
  $$insert into family_poll_votes (poll_id,option_id,member_id,family_id) values ('cccccccc-0000-0000-0000-0000000000a1','dddddddd-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001')$$,
  'refused: This poll takes one answer each.');
select pg_temp.probe('A2 votes both days on a multi-choice poll (1)','a2222222-2222-2222-2222-222222222222',
  $$insert into family_poll_votes (poll_id,option_id,member_id,family_id) values ('cccccccc-0000-0000-0000-0000000000a2','dddddddd-0000-0000-0000-0000000000e1','a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001')$$,
  'allowed');
select pg_temp.probe('A2 votes both days on a multi-choice poll (2)','a2222222-2222-2222-2222-222222222222',
  $$insert into family_poll_votes (poll_id,option_id,member_id,family_id) values ('cccccccc-0000-0000-0000-0000000000a2','dddddddd-0000-0000-0000-0000000000e2','a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001')$$,
  'allowed');
-- A vote naming one poll and another poll's option. Both rows are this
-- household's, so row-level security has nothing to object to; the composite
-- foreign key is what refuses it.
select pg_temp.probe('A votes "Saturday" as an answer to the dinner poll','a1111111-1111-1111-1111-111111111111',
  $$insert into family_poll_votes (poll_id,option_id,member_id,family_id) values ('cccccccc-0000-0000-0000-0000000000a1','dddddddd-0000-0000-0000-0000000000e1','a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001')$$,
  'refused: not an option of that poll');
select pg_temp.probe('A casts a vote as A2','a1111111-1111-1111-1111-111111111111',
  $$insert into family_poll_votes (poll_id,option_id,member_id,family_id) values ('cccccccc-0000-0000-0000-0000000000a1','dddddddd-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001')$$,
  'blocked by RLS');
select pg_temp.probe('A votes on the other household''s poll by id','a1111111-1111-1111-1111-111111111111',
  $$insert into family_poll_votes (poll_id,option_id,member_id,family_id) values ('cccccccc-0000-0000-0000-0000000000b1','dddddddd-0000-0000-0000-0000000000b1','a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001')$$,
  'blocked by RLS');

-- The case that found the leak. B has voted on B's own poll; A now tries to
-- cast a vote *as B* on it. The answer must be row-level security's flat
-- refusal, which says nothing -- not the trigger's "one answer each", which
-- would confirm that somebody in another household had voted.
insert into family_poll_votes (poll_id,option_id,member_id,family_id)
  values ('cccccccc-0000-0000-0000-0000000000b1','dddddddd-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002');
insert into family_poll_options (id,poll_id,family_id,label,position) values
  ('dddddddd-0000-0000-0000-0000000000b2','cccccccc-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000002','Also theirs',1);
select pg_temp.probe('A probes whether B has voted, by voting as B','a1111111-1111-1111-1111-111111111111',
  $$insert into family_poll_votes (poll_id,option_id,member_id,family_id) values ('cccccccc-0000-0000-0000-0000000000b1','dddddddd-0000-0000-0000-0000000000b2','b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002')$$,
  'blocked by RLS');

-- ── seeing and taking back ───────────────────────────────────────────────
select pg_temp.visible('A sees A2''s votes','a1111111-1111-1111-1111-111111111111',
  $$select count(*) from family_poll_votes where member_id = 'a0000000-0000-0000-0000-00000000000c'$$, 3);
select pg_temp.visible('B sees none of House A''s polls','b1111111-1111-1111-1111-111111111111',
  $$select count(*) from family_polls where family_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 0);
select pg_temp.probe('A tries to take back A2''s vote','a1111111-1111-1111-1111-111111111111',
  $$delete from family_poll_votes where member_id = 'a0000000-0000-0000-0000-00000000000c'$$, 'allowed');
insert into pr select nextval('ps'), '...and A2''s votes are all still there', '3 row(s)', count(*)||' row(s)'
  from family_poll_votes where member_id = 'a0000000-0000-0000-0000-00000000000c';
-- Changing your mind on a single-choice poll is take-back then vote, which is
-- what the server action does.
select pg_temp.probe('A2 takes back Adobo','a2222222-2222-2222-2222-222222222222',
  $$delete from family_poll_votes where poll_id = 'cccccccc-0000-0000-0000-0000000000a1' and member_id = 'a0000000-0000-0000-0000-00000000000c'$$, 'allowed');
select pg_temp.probe('...and votes Sinigang instead','a2222222-2222-2222-2222-222222222222',
  $$insert into family_poll_votes (poll_id,option_id,member_id,family_id) values ('cccccccc-0000-0000-0000-0000000000a1','dddddddd-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001')$$,
  'allowed');

-- ── the reply trigger, rewritten here as the invoker ─────────────────────
-- Two calls that differ only in whether the foreign message exists must get
-- the same answer, or the difference is the oracle.
select pg_temp.probe('A replies into B''s household, to a message that exists','a1111111-1111-1111-1111-111111111111',
  $$insert into family_messages (family_id,member_id,body,reply_to) values ('bbbbbbbb-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','x','22222222-0000-0000-0000-00000000000b')$$,
  'blocked by RLS');
select pg_temp.probe('...and to a message that does not','a1111111-1111-1111-1111-111111111111',
  $$insert into family_messages (family_id,member_id,body,reply_to) values ('bbbbbbbb-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','x','99999999-9999-9999-9999-999999999999')$$,
  'blocked by RLS');
select pg_temp.probe('A replies at home to a message at home','a1111111-1111-1111-1111-111111111111',
  $$insert into family_messages (family_id,member_id,body,reply_to) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','yes','11111111-0000-0000-0000-00000000000a')$$,
  'allowed');
select pg_temp.probe('A replies at home to B''s message','a1111111-1111-1111-1111-111111111111',
  $$insert into family_messages (family_id,member_id,body,reply_to) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','x','22222222-0000-0000-0000-00000000000b')$$,
  'refused: A reply must point at a message in the same household.');

select n, label, expected, actual, case when actual = expected then 'PASS' else 'FAIL' end as verdict from pr order by n;
rollback;
