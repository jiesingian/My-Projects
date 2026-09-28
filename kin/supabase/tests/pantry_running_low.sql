-- Running low: the once-a-morning pantry reminder. Needs pantry_items, buy_items,
-- push_subscriptions and a kin_cron_secret in Vault. Run against dev. Ends in rollback.

begin;
insert into families (id,name,invite_code) values ('aaaaaaaa-0000-0000-0000-000000000001','A','PANAAA'),('bbbbbbbb-0000-0000-0000-000000000002','B','PANBBB');
insert into members (id,family_id,full_name,role,status) values
 ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Parent','parent','active'),
 ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','Kid','child_self','active'),
 ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','Other','parent','active');
insert into push_subscriptions (member_id,family_id,endpoint,p256dh,auth) values
 ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','https://p/parent','k','a'),
 ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','https://p/kid','k','a'),
 ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','https://p/other','k','a');
insert into pantry_items (family_id,item_key,name,running_low) values
 ('aaaaaaaa-0000-0000-0000-000000000001','rice','Rice',true),('aaaaaaaa-0000-0000-0000-000000000001','eggs','Eggs',true),('aaaaaaaa-0000-0000-0000-000000000001','salt','Salt',false),
 ('bbbbbbbb-0000-0000-0000-000000000002','milk','Milk',false);
insert into buy_items (family_id,name) values ('aaaaaaaa-0000-0000-0000-000000000001','eggs');
create temp table pr (n serial, label text, expected text, actual text);
insert into pr (label,expected,actual) select 'Wrong secret: nothing','0',count(*)::text from due_pantry_reminders('nope', '2026-09-28 02:00+00');
insert into pr (label,expected,actual) select 'Before 09:00 Manila: nothing','0',count(*)::text from due_pantry_reminders((select kin_vault_secret('kin_cron_secret')), '2026-09-27 23:00+00');
insert into pr (label,expected,actual) select 'At 10:00: only the grown-up, only Rice (eggs already listed)','https://p/parent Running low: Rice',string_agg(endpoint||' '||title,';') from due_pantry_reminders((select kin_vault_secret('kin_cron_secret')), '2026-09-28 02:00+00');
insert into pr (label,expected,actual) select 'Same day again: not twice','0',count(*)::text from due_pantry_reminders((select kin_vault_secret('kin_cron_secret')), '2026-09-28 03:00+00');
select n,label,expected,actual,case when actual=expected then 'PASS' else 'FAIL' end verdict from pr order by n;
rollback;
