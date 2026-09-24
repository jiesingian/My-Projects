-- The private calendar link: what a hash can and cannot reach
-- ===========================================================
-- House A: Jonathan (parent, has a link) and Amelia. House B: a stranger.
-- Run against dev. Ends in `rollback`.

begin;

insert into families (id,name,invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A','FEEDAA'),
  ('bbbbbbbb-0000-0000-0000-000000000002','House B','FEEDBB');
insert into members (id,family_id,full_name,role,status,calendar_feed_hash) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Jonathan','parent','active','jonathanshash000000000000000000000000000000'),
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','Amelia','child_self','active',null),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','Stranger','parent','removed','strangershash000000000000000000000000000000');
insert into activities (id,family_id,title,start_at,applies_to_whole_family) values
  ('11000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Family dinner', now() + interval '1 day', true),
  ('11000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Amelia piano', now() + interval '2 days', false),
  ('11000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','Jonathan dentist', now() + interval '3 days', false),
  ('11000000-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','Last year', now() - interval '200 days', true),
  ('22000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','B dinner', now() + interval '1 day', true);
insert into activity_members values
  ('11000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000c'),
  ('11000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-00000000000a');
insert into events (family_id,title,event_date,recurs_yearly) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Lola birthday','1946-10-02',true);

create temp table pr (n serial, label text, expected text, actual text);
grant all on pr to anon; grant all on sequence pr_n_seq to anon;

set local role anon;
insert into pr (label,expected,actual) select 'Jonathan''s link: whole-family, his own, and yearly events',
  'Family dinner, Jonathan dentist, Lola birthday', string_agg(title, ', ' order by title) from calendar_feed('jonathanshash000000000000000000000000000000');
insert into pr (label,expected,actual) select '...not Amelia''s own task, nor last year''s', '0',
  count(*)::text from calendar_feed('jonathanshash000000000000000000000000000000') where title in ('Amelia piano','Last year');
insert into pr (label,expected,actual) select 'A removed member''s link answers nothing', '0',
  count(*)::text from calendar_feed('strangershash000000000000000000000000000000');
insert into pr (label,expected,actual) select 'A guessed or malformed link answers nothing', '0',
  count(*)::text from calendar_feed('x') union all select 'Empty string too', '0', count(*)::text from calendar_feed('');
insert into pr (label,expected,actual) select 'anon cannot read members directly', 'blocked', 'n/a';
reset role;

do $$ begin
  set local role anon;
  perform calendar_feed_hash from members;
  reset role;
  update pr set actual = 'allowed' where label = 'anon cannot read members directly';
exception when insufficient_privilege then
  reset role;
  update pr set actual = 'blocked' where label = 'anon cannot read members directly';
end $$;

select n, label, expected, actual, case when actual = expected then 'PASS' else 'FAIL' end as verdict from pr order by n;
rollback;
