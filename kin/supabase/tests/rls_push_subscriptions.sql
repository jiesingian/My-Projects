-- Push subscriptions: whose devices a sender can reach
-- ====================================================
-- House A: Jonathan (parent), Janine (parent, chat notifications off),
-- Amelia (child). House B: a stranger. Every member has one device.
-- Run against dev. Ends in `rollback`.

begin;

insert into auth.users (id,email) values
  ('a1111111-1111-1111-1111-111111111111','p-a1@example.invalid'),
  ('a2222222-2222-2222-2222-222222222222','p-a2@example.invalid'),
  ('a3333333-3333-3333-3333-333333333333','p-a3@example.invalid'),
  ('b1111111-1111-1111-1111-111111111111','p-b1@example.invalid');
insert into families (id,name,invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A','PUSHAA'),
  ('bbbbbbbb-0000-0000-0000-000000000002','House B','PUSHBB');
insert into members (id,family_id,full_name,role,auth_user_id,status,notification_prefs) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Jonathan','parent','a1111111-1111-1111-1111-111111111111','active','{}'),
  ('a0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001','Janine','parent','a2222222-2222-2222-2222-222222222222','active','{"chat": false}'),
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','Amelia','child_self','a3333333-3333-3333-3333-333333333333','active','{}'),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','Stranger','parent','b1111111-1111-1111-1111-111111111111','active','{}');
insert into push_subscriptions (member_id,family_id,endpoint,p256dh,auth) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','https://push.example/jonathan','k','a'),
  ('a0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001','https://push.example/janine','k','a'),
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','https://push.example/amelia','k','a'),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','https://push.example/stranger','k','a');

create temp table pr (n serial, label text, expected text, actual text);
grant all on pr to authenticated; grant all on sequence pr_n_seq to authenticated;

create function pg_temp.as_user(who uuid) returns void as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
$$ language sql;

-- Jonathan sends a chat message.
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
set local role authenticated;
insert into pr (label,expected,actual) select 'Chat reaches the rest of House A, minus Janine who turned chat off',
  'https://push.example/amelia', string_agg(endpoint, ', ' order by endpoint) from push_targets('chat');
insert into pr (label,expected,actual) select 'Journal reaches everyone else in House A',
  'https://push.example/amelia, https://push.example/janine', string_agg(endpoint, ', ' order by endpoint) from push_targets('journal');
insert into pr (label,expected,actual) select 'Aimed at one member only',
  'https://push.example/janine', string_agg(endpoint, ', ') from push_targets('journal', array['a0000000-0000-0000-0000-00000000000b'::uuid]);
insert into pr (label,expected,actual) select 'Aimed at a stranger in another house: nothing',
  '0', count(*)::text from push_targets('journal', array['b0000000-0000-0000-0000-00000000000b'::uuid]);
insert into pr (label,expected,actual) select 'Jonathan reads only his own device rows',
  'https://push.example/jonathan', string_agg(endpoint, ', ') from push_subscriptions;
insert into pr (label,expected,actual) select 'A malformed kind returns nothing', '0', count(*)::text from push_targets('x; drop');
select forget_push_endpoint('https://push.example/stranger');
reset role;
insert into pr (label,expected,actual) select 'Forgetting another house''s endpoint does nothing', '1',
  count(*)::text from push_subscriptions where endpoint = 'https://push.example/stranger';

-- Jonathan tries to register a device as Janine's.
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
do $$ begin
  set local role authenticated;
  insert into push_subscriptions (member_id,family_id,endpoint,p256dh,auth) values ('a0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001','https://push.example/fake','k','a');
  reset role;
  insert into pr (label,expected,actual) values ('Registering a device for someone else','blocked','allowed');
exception when insufficient_privilege then
  reset role;
  insert into pr (label,expected,actual) values ('Registering a device for someone else','blocked','blocked');
end $$;

select n, label, expected, actual, case when actual = expected then 'PASS' else 'FAIL' end as verdict from pr order by n;
rollback;
