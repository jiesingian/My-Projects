-- Relatives across households: shared, and nothing more
-- =====================================================
--
-- Two linked households who both have Grandpa Eduardo in their trees:
--
--   House A (Jonathan's)                   House B (Miguel's)
--   Eduardo = Teresita                     Ramon                  <- Eduardo's father
--        |                                   |
--     Jonathan = Janine   Antonio          Eduardo = Teresita
--              |          (Janine's dad)        |
--            Amelia                          Miguel = Ana     Rosa (Ana's mother)
--                                                 |
--                                               Paolo          Carlo (no links)
--
-- A match of the two Eduardos lets each house see the other's record of
-- Eduardo's blood line, and the questions are all about the edges of that:
-- the in-laws' own parents (Antonio, Rosa) and the unrelated (Carlo) must
-- never come across, and nothing may cross to a household that is not linked
-- -- House C -- or after the link is revoked.
--
-- Run against dev (peborutoxsqqwgxwgxjo). Ends in `rollback`.

begin;

insert into auth.users (id,email) values
  ('a1111111-1111-1111-1111-111111111111','probe-a@example.invalid'),
  ('b1111111-1111-1111-1111-111111111111','probe-b@example.invalid'),
  ('c1111111-1111-1111-1111-111111111111','probe-c@example.invalid');
insert into families (id,name,invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A','TREEAA'),
  ('bbbbbbbb-0000-0000-0000-000000000002','House B','TREEBB'),
  ('cccccccc-0000-0000-0000-000000000003','House C','TREECC');
insert into members (id,family_id,full_name,role,auth_user_id,status) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Jonathan','parent','a1111111-1111-1111-1111-111111111111','active'),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','Miguel','parent','b1111111-1111-1111-1111-111111111111','active'),
  ('c0000000-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-000000000003','Stranger','parent','c1111111-1111-1111-1111-111111111111','active');

-- House A's tree. Ids: 1a.. are A's people.
insert into family_tree_people (id,family_id,full_name,dob) values
  ('1a000000-0000-0000-0000-0000000000ed','aaaaaaaa-0000-0000-0000-000000000001','Eduardo Singian','1952-04-02'),
  ('1a000000-0000-0000-0000-00000000007e','aaaaaaaa-0000-0000-0000-000000000001','Teresita Singian','1955-01-01'),
  ('1a000000-0000-0000-0000-0000000000a7','aaaaaaaa-0000-0000-0000-000000000001','Antonio Reyes','1950-01-01'),
  ('1a000000-0000-0000-0000-0000000000f0','aaaaaaaa-0000-0000-0000-000000000001','Jonathan Singian','1985-01-01'),
  ('1a000000-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-000000000001','Janine Singian','1987-01-01'),
  ('1a000000-0000-0000-0000-0000000000f2','aaaaaaaa-0000-0000-0000-000000000001','Amelia Singian','2014-01-01');
update family_tree_people set spouse_id='1a000000-0000-0000-0000-00000000007e' where id='1a000000-0000-0000-0000-0000000000ed';
update family_tree_people set spouse_id='1a000000-0000-0000-0000-0000000000ed' where id='1a000000-0000-0000-0000-00000000007e';
update family_tree_people set father_id='1a000000-0000-0000-0000-0000000000ed', mother_id='1a000000-0000-0000-0000-00000000007e', spouse_id='1a000000-0000-0000-0000-0000000000f1' where id='1a000000-0000-0000-0000-0000000000f0';
update family_tree_people set father_id='1a000000-0000-0000-0000-0000000000a7', spouse_id='1a000000-0000-0000-0000-0000000000f0' where id='1a000000-0000-0000-0000-0000000000f1';
update family_tree_people set father_id='1a000000-0000-0000-0000-0000000000f0', mother_id='1a000000-0000-0000-0000-0000000000f1' where id='1a000000-0000-0000-0000-0000000000f2';

-- House B's tree. Ids: 2b.. are B's people.
insert into family_tree_people (id,family_id,full_name,dob) values
  ('2b000000-0000-0000-0000-00000000000a','bbbbbbbb-0000-0000-0000-000000000002','Ramon Singian','1928-01-01'),
  ('2b000000-0000-0000-0000-0000000000ed','bbbbbbbb-0000-0000-0000-000000000002','Eduardo S.','1952-04-02'),
  ('2b000000-0000-0000-0000-00000000007e','bbbbbbbb-0000-0000-0000-000000000002','Teresita S.','1955-01-01'),
  ('2b000000-0000-0000-0000-0000000000c0','bbbbbbbb-0000-0000-0000-000000000002','Miguel Singian','1978-01-01'),
  ('2b000000-0000-0000-0000-0000000000c1','bbbbbbbb-0000-0000-0000-000000000002','Ana Singian','1980-01-01'),
  ('2b000000-0000-0000-0000-0000000000c2','bbbbbbbb-0000-0000-0000-000000000002','Rosa Cruz','1955-01-01'),
  ('2b000000-0000-0000-0000-0000000000c3','bbbbbbbb-0000-0000-0000-000000000002','Paolo Singian','2009-01-01'),
  ('2b000000-0000-0000-0000-0000000000c4','bbbbbbbb-0000-0000-0000-000000000002','Carlo Friend','1979-01-01');
update family_tree_people set father_id='2b000000-0000-0000-0000-00000000000a', spouse_id='2b000000-0000-0000-0000-00000000007e' where id='2b000000-0000-0000-0000-0000000000ed';
update family_tree_people set spouse_id='2b000000-0000-0000-0000-0000000000ed' where id='2b000000-0000-0000-0000-00000000007e';
update family_tree_people set father_id='2b000000-0000-0000-0000-0000000000ed', mother_id='2b000000-0000-0000-0000-00000000007e', spouse_id='2b000000-0000-0000-0000-0000000000c1' where id='2b000000-0000-0000-0000-0000000000c0';
update family_tree_people set mother_id='2b000000-0000-0000-0000-0000000000c2', spouse_id='2b000000-0000-0000-0000-0000000000c0' where id='2b000000-0000-0000-0000-0000000000c1';
update family_tree_people set father_id='2b000000-0000-0000-0000-0000000000c0', mother_id='2b000000-0000-0000-0000-0000000000c1' where id='2b000000-0000-0000-0000-0000000000c3';

insert into family_links (id,requester_family_id,addressee_family_id,status) values
  ('11110000-0000-0000-0000-00000000ab00','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','accepted');

create temp table pr (n int, label text, expected text, actual text);
create temp sequence ps;
create temp table ctx (k text primary key, v uuid);
grant all on pr, ctx to authenticated;
grant usage on sequence ps to authenticated;

create function pg_temp.probe(l text, who uuid, stmt text, exp text) returns void as $fn$
begin
  begin
    execute 'set local role authenticated';
    execute format('set local request.jwt.claims = %L', json_build_object('sub',who,'role','authenticated')::text);
    execute stmt; execute 'reset role';
    insert into pr values (nextval('ps'), l, exp, 'allowed');
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

-- ── offering ──────────────────────────────────────────────────────────────
select pg_temp.probe('A offers Eduardo to linked House B','a1111111-1111-1111-1111-111111111111',
  $$insert into ctx select 'ed', offer_tree_person('1a000000-0000-0000-0000-0000000000ed','bbbbbbbb-0000-0000-0000-000000000002')$$, 'allowed');
select pg_temp.probe('A offers Eduardo to unlinked House C','a1111111-1111-1111-1111-111111111111',
  $$select offer_tree_person('1a000000-0000-0000-0000-0000000000ed','cccccccc-0000-0000-0000-000000000003')$$, 'blocked');
select pg_temp.probe('A offers somebody from B''s own tree','a1111111-1111-1111-1111-111111111111',
  $$select offer_tree_person('2b000000-0000-0000-0000-0000000000c0','bbbbbbbb-0000-0000-0000-000000000002')$$, 'blocked');
select pg_temp.probe('A writes a match row directly, skipping the checks','a1111111-1111-1111-1111-111111111111',
  $$insert into family_tree_matches (offer_family_id,offer_person_id,to_family_id,to_person_id,status)
    values ('aaaaaaaa-0000-0000-0000-000000000001','1a000000-0000-0000-0000-0000000000ed','bbbbbbbb-0000-0000-0000-000000000002','2b000000-0000-0000-0000-0000000000c4','accepted')$$, 'blocked');

-- ── what the offer reveals ────────────────────────────────────────────────
select pg_temp.answer('House B sees the offer: one name and a year','b1111111-1111-1111-1111-111111111111',
  $$select string_agg(full_name||' '||birth_year||' from '||from_family_name, '; ') from tree_offers_for_me()$$, 'Eduardo Singian 1952 from House A');
select pg_temp.answer('House C sees nothing','c1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from tree_offers_for_me()$$, '0');
select pg_temp.answer('House A, who made it, is not offered it back','a1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from tree_offers_for_me()$$, '0');

-- ── answering ─────────────────────────────────────────────────────────────
select pg_temp.probe('House C answers an offer that is not theirs','c1111111-1111-1111-1111-111111111111',
  $$select respond_tree_offer((select v from ctx where k='ed'), true, null)$$, 'blocked');
select pg_temp.probe('B says it is somebody in A''s tree','b1111111-1111-1111-1111-111111111111',
  $$select respond_tree_offer((select v from ctx where k='ed'), true, '1a000000-0000-0000-0000-0000000000f0')$$, 'blocked');
select pg_temp.probe('B says: that is our Eduardo','b1111111-1111-1111-1111-111111111111',
  $$select respond_tree_offer((select v from ctx where k='ed'), true, '2b000000-0000-0000-0000-0000000000ed')$$, 'allowed');
select pg_temp.probe('B answers it a second time','b1111111-1111-1111-1111-111111111111',
  $$select respond_tree_offer((select v from ctx where k='ed'), true, '2b000000-0000-0000-0000-0000000000c4')$$, 'refused: That offer has already been answered.');

-- ── the branch A now sees of B's tree ────────────────────────────────────
select pg_temp.answer('A sees Eduardo''s blood line as B recorded it','a1111111-1111-1111-1111-111111111111',
  $$select string_agg(full_name, ', ' order by full_name) from shared_branch((select v from ctx where k='ed'))$$,
  'Ana Singian, Eduardo S., Miguel Singian, Paolo Singian, Ramon Singian, Teresita S.');
select pg_temp.answer('...not Ana''s mother, and not the unrelated friend','a1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from shared_branch((select v from ctx where k='ed')) where full_name in ('Rosa Cruz','Carlo Friend')$$, '0');
-- The branch's edge never points outside it: Ana is in it as Paolo's mother,
-- but her own mother is not, so her mother_id comes back empty.
select pg_temp.answer('...and Ana''s link to her mother is cut at the edge','a1111111-1111-1111-1111-111111111111',
  $$select coalesce(mother_id::text,'(none)') from shared_branch((select v from ctx where k='ed')) where full_name = 'Ana Singian'$$, '(none)');
select pg_temp.answer('...with years, not dates','a1111111-1111-1111-1111-111111111111',
  $$select birth_year from shared_branch((select v from ctx where k='ed')) where is_shared_person$$, '1952');

-- ── the branch B sees of A's tree, the other way ─────────────────────────
select pg_temp.answer('B sees Eduardo''s line as A recorded it','b1111111-1111-1111-1111-111111111111',
  $$select string_agg(full_name, ', ' order by full_name) from shared_branch((select v from ctx where k='ed'))$$,
  'Amelia Singian, Eduardo Singian, Janine Singian, Jonathan Singian, Teresita Singian');
select pg_temp.answer('...not Janine''s father','b1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from shared_branch((select v from ctx where k='ed')) where full_name = 'Antonio Reyes'$$, '0');
select pg_temp.answer('House C sees no branch at all','c1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from shared_branch((select v from ctx where k='ed'))$$, '0');

-- ── adding someone offered, rather than matching ─────────────────────────
select pg_temp.probe('A offers Teresita too','a1111111-1111-1111-1111-111111111111',
  $$insert into ctx select 'te', offer_tree_person('1a000000-0000-0000-0000-00000000007e','bbbbbbbb-0000-0000-0000-000000000002')$$, 'allowed');
select pg_temp.probe('B adds her to their tree as someone new','b1111111-1111-1111-1111-111111111111',
  $$select respond_tree_offer((select v from ctx where k='te'), true, null)$$, 'allowed');
insert into pr select nextval('ps'), '...and she is now in B''s tree', '1', count(*)::text
  from family_tree_people where family_id='bbbbbbbb-0000-0000-0000-000000000002' and full_name='Teresita Singian';

-- ── taking it back ────────────────────────────────────────────────────────
select pg_temp.probe('House C withdraws a match between A and B','c1111111-1111-1111-1111-111111111111',
  $$select withdraw_tree_match((select v from ctx where k='te'))$$, 'blocked');

-- Revoking the link closes every branch at once.
update family_links set status = 'revoked' where id = '11110000-0000-0000-0000-00000000ab00';
select pg_temp.answer('After the link is revoked, A sees no branch','a1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from shared_branch((select v from ctx where k='ed'))$$, '0');
select pg_temp.answer('...nor B','b1111111-1111-1111-1111-111111111111',
  $$select count(*)::text from shared_branch((select v from ctx where k='ed'))$$, '0');

select n, label, expected, actual, case when actual = expected then 'PASS' else 'FAIL' end as verdict from pr order by n;
rollback;
