-- The household's shared passwords: who sees what, who may change it
-- ==================================================================
--
-- House A: Jonathan (parent), Lola (adult), Amelia (child with her own login).
-- House C: a stranger. Two items in A's vault: the Wi-Fi, for everyone, and
-- the bank app, for grown-ups only.
--
-- Run against dev (peborutoxsqqwgxwgxjo). Ends in `rollback`.

begin;

insert into auth.users (id,email) values
  ('a1111111-1111-1111-1111-111111111111','probe-a@example.invalid'),
  ('a2222222-2222-2222-2222-222222222222','probe-a2@example.invalid'),
  ('a3333333-3333-3333-3333-333333333333','probe-a3@example.invalid'),
  ('c1111111-1111-1111-1111-111111111111','probe-c@example.invalid');
insert into families (id,name,invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A','VAULTA'),
  ('cccccccc-0000-0000-0000-000000000003','House C','VAULTC');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Jonathan','parent','a1111111-1111-1111-1111-111111111111','active'),
  ('a0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001','Lola','adult','a2222222-2222-2222-2222-222222222222','active'),
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','Amelia','child_self','a3333333-3333-3333-3333-333333333333','active'),
  ('c0000000-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-000000000003','Stranger','parent','c1111111-1111-1111-1111-111111111111','active');

create temp table pr (n int, label text, expected text, actual text);
create temp sequence ps;
grant all on pr to authenticated;
grant usage on sequence ps to authenticated;

create function pg_temp.probe(l text, who uuid, stmt text, exp text) returns void as $fn$
declare n int;
begin
  begin
    execute 'set local role authenticated';
    execute format('set local request.jwt.claims = %L', json_build_object('sub',who,'role','authenticated')::text);
    execute stmt; get diagnostics n = row_count; execute 'reset role';
    insert into pr values (nextval('ps'), l, exp, case when n = 0 then 'no rows' else 'allowed' end);
  exception when others then
    execute 'reset role';
    insert into pr values (nextval('ps'), l, exp, case when SQLSTATE='42501' then 'blocked' else 'refused: '||SQLERRM end);
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

-- ── adding ────────────────────────────────────────────────────────────────
select pg_temp.probe('Parent adds the Wi-Fi, for everyone','a1111111-1111-1111-1111-111111111111',
  $$insert into family_vault_items (id,family_id,group_name,label,secret,visibility)
    values ('11000000-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-000000000001','Wi-Fi','Home 5G','kalamansi2026','everyone')$$, 'allowed');
select pg_temp.probe('Adult adds the bank app, grown-ups only','a2222222-2222-2222-2222-222222222222',
  $$insert into family_vault_items (id,family_id,group_name,label,username,secret,visibility)
    values ('11000000-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-000000000001','Bank','BPI app','jsingian','hunter2','grown_ups')$$, 'allowed');
select pg_temp.probe('Child adds an item','a3333333-3333-3333-3333-333333333333',
  $$insert into family_vault_items (family_id,group_name,label,secret)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Games','Switch','1234')$$, 'blocked');
select pg_temp.probe('Stranger plants an item in House A','c1111111-1111-1111-1111-111111111111',
  $$insert into family_vault_items (family_id,group_name,label,secret)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Wi-Fi','Free Wi-Fi','x')$$, 'blocked');
select pg_temp.probe('Parent sets an unknown visibility','a1111111-1111-1111-1111-111111111111',
  $$insert into family_vault_items (family_id,group_name,label,secret,visibility)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Wi-Fi','Guest','x','kids_only')$$,
  'refused: new row for relation "family_vault_items" violates check constraint "family_vault_items_visibility"');

-- ── reading ───────────────────────────────────────────────────────────────
select pg_temp.answer('Parent sees both','a1111111-1111-1111-1111-111111111111',
  $$select string_agg(label, ', ' order by label) from family_vault_items$$, 'BPI app, Home 5G');
select pg_temp.answer('Adult sees both','a2222222-2222-2222-2222-222222222222',
  $$select string_agg(label, ', ' order by label) from family_vault_items$$, 'BPI app, Home 5G');
select pg_temp.answer('Child sees the Wi-Fi only','a3333333-3333-3333-3333-333333333333',
  $$select string_agg(label||'='||secret, ', ') from family_vault_items$$, 'Home 5G=kalamansi2026');
select pg_temp.answer('Stranger sees nothing','c1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from family_vault_items$$, '0');

-- ── changing ──────────────────────────────────────────────────────────────
select pg_temp.probe('Child changes the Wi-Fi password','a3333333-3333-3333-3333-333333333333',
  $$update family_vault_items set secret='pwned' where id='11000000-0000-0000-0000-0000000000f1'$$, 'no rows');
select pg_temp.probe('Child opens the bank app to everyone','a3333333-3333-3333-3333-333333333333',
  $$update family_vault_items set visibility='everyone' where id='11000000-0000-0000-0000-0000000000b1'$$, 'no rows');
select pg_temp.probe('Child deletes the Wi-Fi','a3333333-3333-3333-3333-333333333333',
  $$delete from family_vault_items where id='11000000-0000-0000-0000-0000000000f1'$$, 'no rows');
select pg_temp.probe('Stranger changes A''s Wi-Fi','c1111111-1111-1111-1111-111111111111',
  $$update family_vault_items set secret='pwned' where id='11000000-0000-0000-0000-0000000000f1'$$, 'no rows');
select pg_temp.probe('Parent moves an item to House C','a1111111-1111-1111-1111-111111111111',
  $$update family_vault_items set family_id='cccccccc-0000-0000-0000-000000000003' where id='11000000-0000-0000-0000-0000000000f1'$$, 'blocked');
select pg_temp.probe('Adult changes the Wi-Fi password','a2222222-2222-2222-2222-222222222222',
  $$update family_vault_items set secret='kalamansi2027' where id='11000000-0000-0000-0000-0000000000f1'$$, 'allowed');
insert into pr select nextval('ps'), '...and nobody else''s change landed', 'kalamansi2027 everyone 2', 
  (select secret||' '||visibility from family_vault_items where id='11000000-0000-0000-0000-0000000000f1')||' '||count(*)
  from family_vault_items where family_id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.probe('Parent deletes the bank app','a1111111-1111-1111-1111-111111111111',
  $$delete from family_vault_items where id='11000000-0000-0000-0000-0000000000b1'$$, 'allowed');

select n, label, expected, actual, case when actual = expected then 'PASS' else 'FAIL' end as verdict from pr order by n;
rollback;
