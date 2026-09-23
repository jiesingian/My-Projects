-- Milestones on the family feed, and conversations between linked households
-- ==========================================================================
--
-- House A and House B are linked; House C is not. What must hold: a
-- milestone crosses only once shared and only to a linked household; a link's
-- conversation is readable and writable by its two households and nobody
-- else, never under somebody else's name, and closes when the link does.
--
-- Run against dev (peborutoxsqqwgxwgxjo). Ends in `rollback`.

begin;

insert into auth.users (id,email) values
  ('a1111111-1111-1111-1111-111111111111','probe-a@example.invalid'),
  ('a2222222-2222-2222-2222-222222222222','probe-a2@example.invalid'),
  ('b1111111-1111-1111-1111-111111111111','probe-b@example.invalid'),
  ('c1111111-1111-1111-1111-111111111111','probe-c@example.invalid');
insert into families (id,name,invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A','FEEDAA'),
  ('bbbbbbbb-0000-0000-0000-000000000002','House B','FEEDBB'),
  ('cccccccc-0000-0000-0000-000000000003','House C','FEEDCC');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Jonathan Singian','parent','a1111111-1111-1111-1111-111111111111','active'),
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','Janine Singian','parent','a2222222-2222-2222-2222-222222222222','active'),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','Miguel Singian','parent','b1111111-1111-1111-1111-111111111111','active'),
  ('c0000000-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-000000000003','Stranger','parent','c1111111-1111-1111-1111-111111111111','active');
insert into family_links (id,requester_family_id,addressee_family_id,status) values
  ('11110000-0000-0000-0000-00000000ab00','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','accepted');
insert into milestones (id,family_id,title,milestone_date,shared_at) values
  ('33333333-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Amelia''s first day of school','2026-06-15',now()),
  ('33333333-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001','Private milestone','2026-06-16',null);

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
    insert into pr values (nextval('ps'), l, exp, case when SQLSTATE='42501' then 'blocked by RLS' when SQLSTATE='23514' then 'refused by check' else 'refused: '||SQLERRM end);
  end;
  perform set_config('request.jwt.claims','',true);
end; $fn$ language plpgsql;
create function pg_temp.answer(l text, who uuid, q text, exp text) returns void as $fn$
declare r text;
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub',who,'role','authenticated')::text);
  execute q into r; execute 'reset role';
  insert into pr values (nextval('ps'), l, exp, coalesce(r,'(none)'));
  perform set_config('request.jwt.claims','',true);
end; $fn$ language plpgsql;

-- ── milestones ────────────────────────────────────────────────────────────
select pg_temp.answer('B, linked, sees A''s shared milestone and only that','b1111111-1111-1111-1111-111111111111',
  $$select string_agg(title, ', ') from milestones$$, 'Amelia''s first day of school');
select pg_temp.answer('C, not linked, sees none of them','c1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from milestones$$, '0');
select pg_temp.probe('B edits A''s shared milestone','b1111111-1111-1111-1111-111111111111',
  $$update milestones set title = 'changed' where id = '33333333-0000-0000-0000-00000000000a'$$, 'allowed');
insert into pr select nextval('ps'), '...and it did not change', 'Amelia''s first day of school', title
  from milestones where id = '33333333-0000-0000-0000-00000000000a';

-- ── the conversation ──────────────────────────────────────────────────────
select pg_temp.probe('A writes to B','a1111111-1111-1111-1111-111111111111',
  $$insert into family_link_messages (link_id,family_id,member_id,body) values ('11110000-0000-0000-0000-00000000ab00','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','Merry Christmas from all of us!')$$, 'allowed');
select pg_temp.probe('B writes back','b1111111-1111-1111-1111-111111111111',
  $$insert into family_link_messages (link_id,family_id,member_id,body) values ('11110000-0000-0000-0000-00000000ab00','bbbbbbbb-0000-0000-0000-000000000002','b0000000-0000-0000-0000-00000000000b','And to you!')$$, 'allowed');
select pg_temp.answer('B reads both, with the right names on them','b1111111-1111-1111-1111-111111111111',
  $$select string_agg(author_name||': '||body, ' | ' order by created_at, author_name) from family_link_messages$$,
  'Jonathan Singian: Merry Christmas from all of us! | Miguel Singian: And to you!');
select pg_temp.answer('C reads nothing','c1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from family_link_messages$$, '0');
select pg_temp.probe('C writes into A and B''s conversation','c1111111-1111-1111-1111-111111111111',
  $$insert into family_link_messages (link_id,family_id,member_id,body) values ('11110000-0000-0000-0000-00000000ab00','cccccccc-0000-0000-0000-000000000003','c0000000-0000-0000-0000-00000000000c','hi')$$, 'blocked by RLS');
select pg_temp.probe('A posts as Janine','a1111111-1111-1111-1111-111111111111',
  $$insert into family_link_messages (link_id,family_id,member_id,body) values ('11110000-0000-0000-0000-00000000ab00','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000c','not me')$$, 'blocked by RLS');
-- The name is written from the caller, whatever the client sends.
select pg_temp.probe('A sends a message claiming to be Lola','a1111111-1111-1111-1111-111111111111',
  $$insert into family_link_messages (link_id,family_id,member_id,author_name,body) values ('11110000-0000-0000-0000-00000000ab00','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','Lola','from lola')$$, 'allowed');
insert into pr select nextval('ps'), '...and it goes out under A''s own name', 'Jonathan Singian', author_name
  from family_link_messages where body = 'from lola';
select pg_temp.probe('An empty message','a1111111-1111-1111-1111-111111111111',
  $$insert into family_link_messages (link_id,family_id,member_id,body) values ('11110000-0000-0000-0000-00000000ab00','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','   ')$$, 'refused by check');
select pg_temp.probe('B deletes A''s message','b1111111-1111-1111-1111-111111111111',
  $$delete from family_link_messages where author_name = 'Jonathan Singian'$$, 'allowed');
insert into pr select nextval('ps'), '...and A''s messages are all still there', '2', count(*)::text
  from family_link_messages where author_name = 'Jonathan Singian';

-- ── when the link ends ────────────────────────────────────────────────────
update family_links set status = 'revoked' where id = '11110000-0000-0000-0000-00000000ab00';
select pg_temp.answer('After revoking, B reads nothing','b1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from family_link_messages$$, '0');
select pg_temp.answer('...and no longer sees the milestone','b1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from milestones$$, '0');
select pg_temp.probe('...and cannot write','b1111111-1111-1111-1111-111111111111',
  $$insert into family_link_messages (link_id,family_id,member_id,body) values ('11110000-0000-0000-0000-00000000ab00','bbbbbbbb-0000-0000-0000-000000000002','b0000000-0000-0000-0000-00000000000b','still there?')$$, 'blocked by RLS');

select n, label, expected, actual, case when actual = expected then 'PASS' else 'FAIL' end as verdict from pr order by n;
rollback;
