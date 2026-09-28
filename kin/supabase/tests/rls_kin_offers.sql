-- Kin's offers: days of Plus, earned once, never self-granted.
-- ==========================================================
--
-- Asked of the database (20260929020000_kin_offers.sql), as a signed-in
-- member. Outcome words as rls_goal_reward_giver.sql. Run against dev
-- (peborutoxsqqwgxwgxjo) only; it ends in `rollback`.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'offer-parent@example.invalid'),
  ('a0000000-0000-0000-0000-000000000003', 'offer-child@example.invalid'),
  ('c0000000-0000-0000-0000-000000000001', 'offer-new@example.invalid'),
  ('d0000000-0000-0000-0000-000000000001', 'offer-comped@example.invalid');

-- A: on Kin Free, twenty days old (past the 14-day referral window). C: brand new. D: comped, invites C.
select set_config('kin.privileged', 'on', true);
insert into families (id, name, invite_code, access_status, access_expires_at, created_at) values
  ('a1000000-0000-0000-0000-000000000000', 'Offer probe A', 'OFFRPA', 'expired', now() - interval '1 day', now() - interval '20 days'),
  ('c1000000-0000-0000-0000-000000000000', 'Offer probe C', 'OFFRPC', 'trialing', now() + interval '14 days', now()),
  ('d1000000-0000-0000-0000-000000000000', 'Offer probe D', 'OFFRPD', 'comped', null, now() - interval '60 days');
select set_config('kin.privileged', 'off', true);

-- The grown-ups are their households' organizers, so the guard -- not the
-- families update policy -- is what refuses them below.
insert into members (id, family_id, full_name, role, auth_user_id, status, is_organiser) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Probe Parent', 'parent',     'a0000000-0000-0000-0000-000000000001', 'active', true),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'Probe Child',  'child_self', 'a0000000-0000-0000-0000-000000000003', 'active', false),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000000', 'New Parent',   'parent',     'c0000000-0000-0000-0000-000000000001', 'active', true),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000000', 'Comped Parent','parent',     'd0000000-0000-0000-0000-000000000001', 'active', true);

create temp table probe_results (n int, label text, expected text, actual text);
create temp sequence probe_seq;

create function pg_temp.probe(p_label text, p_who uuid, p_stmt text, p_expect text) returns void as $fn$
declare
  rc bigint;
begin
  begin
    execute 'set local role authenticated';
    execute format('set local request.jwt.claims = %L', json_build_object('sub', p_who, 'role', 'authenticated')::text);
    execute p_stmt;
    get diagnostics rc = row_count;
    execute 'reset role';
    insert into probe_results values (nextval('probe_seq'), p_label, p_expect, case when rc > 0 then 'allowed' else 'no rows' end);
  exception when others then
    execute 'reset role';
    insert into probe_results values (nextval('probe_seq'), p_label, p_expect,
      case when SQLSTATE = '42501' then 'blocked by RLS' else 'error ' || SQLSTATE end);
  end;
end;
$fn$ language plpgsql;

-- Offers ------------------------------------------------------------------------
select pg_temp.probe('a child is not offered anything', 'a0000000-0000-0000-0000-000000000003',
  $q$select * from public.next_kin_offer()$q$, 'no rows');
select pg_temp.probe('a new household waits a week', 'c0000000-0000-0000-0000-000000000001',
  $q$select * from public.next_kin_offer()$q$, 'no rows');
select pg_temp.probe('a grown-up is offered one', 'a0000000-0000-0000-0000-000000000001',
  $q$select * from public.next_kin_offer()$q$, 'allowed');
select pg_temp.probe('asking again gives the same one', 'a0000000-0000-0000-0000-000000000001',
  $q$select 1 from public.next_kin_offer() o where o.id = (select id from household_offers where family_id = 'a1000000-0000-0000-0000-000000000000' limit 1)$q$, 'allowed');
select pg_temp.probe('a child answers it', 'a0000000-0000-0000-0000-000000000003',
  $q$select public.respond_kin_offer((select id from household_offers where family_id = 'a1000000-0000-0000-0000-000000000000' limit 1), true)$q$, 'blocked by RLS');
select pg_temp.probe('the grown-up skips it', 'a0000000-0000-0000-0000-000000000001',
  $q$select public.respond_kin_offer((select id from household_offers where family_id = 'a1000000-0000-0000-0000-000000000000' limit 1), false)$q$, 'allowed');
select pg_temp.probe('no second offer the same day', 'a0000000-0000-0000-0000-000000000001',
  $q$select * from public.next_kin_offer()$q$, 'no rows');
select pg_temp.probe('a member writes an offer themselves', 'a0000000-0000-0000-0000-000000000001',
  $q$insert into household_offers (family_id, code, days, status) values ('a1000000-0000-0000-0000-000000000000', 'goal', 30, 'completed')$q$, 'blocked by RLS');

-- Earning: a taken offer, done, on Kin Free -> a taste of Plus, once.
insert into household_offers (family_id, code, days, status, offered_at) values
  ('a1000000-0000-0000-0000-000000000000', 'goal', 1, 'accepted', now() - interval '2 days');
select pg_temp.probe('not done yet: nothing earned', 'a0000000-0000-0000-0000-000000000001',
  $q$select * from public.check_kin_offers()$q$, 'no rows');
select pg_temp.probe('the grown-up sets a goal', 'a0000000-0000-0000-0000-000000000001',
  $q$insert into planner_goals (family_id, title, kind, target, created_by) values ('a1000000-0000-0000-0000-000000000000', 'Walks', 'custom', 5, 'a2000000-0000-0000-0000-000000000001')$q$, 'allowed');
select pg_temp.probe('done: a day of Plus earned', 'a0000000-0000-0000-0000-000000000001',
  $q$select 1 from public.check_kin_offers() c where c.code = 'goal' and c.days = 1$q$, 'allowed');
select pg_temp.probe('Kin Free became a day of Plus', 'a0000000-0000-0000-0000-000000000001',
  $q$select 1 from families where id = 'a1000000-0000-0000-0000-000000000000' and access_status = 'trialing' and access_expires_at between now() + interval '23 hours' and now() + interval '25 hours'$q$, 'allowed');
select pg_temp.probe('earned once', 'a0000000-0000-0000-0000-000000000001',
  $q$select * from public.check_kin_offers()$q$, 'no rows');
select pg_temp.probe('a member banks their own days', 'a0000000-0000-0000-0000-000000000001',
  $q$update families set plus_credit_days = 365 where id = 'a1000000-0000-0000-0000-000000000000'$q$, 'error P0001');
select pg_temp.probe('a member names a referrer directly', 'c0000000-0000-0000-0000-000000000001',
  $q$update families set referred_by = 'd1000000-0000-0000-0000-000000000000' where id = 'c1000000-0000-0000-0000-000000000000'$q$, 'error P0001');
select pg_temp.probe('a member grants themselves days', 'a0000000-0000-0000-0000-000000000001',
  $q$select public.grant_plus_days('a1000000-0000-0000-0000-000000000000', 60, 'offer:x', null)$q$, 'blocked by RLS');

-- Referral: 7 days on joining, 30 more on subscribing. The codes are read
-- as the owner, before the probe signs in: another family's code is not
-- visible to a member, which is the point. ------------------------------
select pg_temp.probe('the new household names itself', 'c0000000-0000-0000-0000-000000000001',
  format('select public.set_referrer(%L)', (select referral_code from families where id = 'c1000000-0000-0000-0000-000000000000')), 'error P0002');
select pg_temp.probe('the new household names who invited it', 'c0000000-0000-0000-0000-000000000001',
  format('select public.set_referrer(%L)', (select referral_code from families where id = 'd1000000-0000-0000-0000-000000000000')), 'allowed');
select pg_temp.probe('the inviter banked 7 days (comped)', 'd0000000-0000-0000-0000-000000000001',
  $q$select 1 from families where id = 'd1000000-0000-0000-0000-000000000000' and plus_credit_days = 7$q$, 'allowed');
select pg_temp.probe('naming a second referrer', 'c0000000-0000-0000-0000-000000000001',
  format('select public.set_referrer(%L)', (select referral_code from families where id = 'a1000000-0000-0000-0000-000000000000')), 'error P0001');
select pg_temp.probe('an old household names a referrer', 'a0000000-0000-0000-0000-000000000001',
  format('select public.set_referrer(%L)', (select referral_code from families where id = 'd1000000-0000-0000-0000-000000000000')), 'error P0001');

select set_config('kin.privileged', 'on', true);
update families set access_status = 'active', access_source = 'subscription' where id = 'c1000000-0000-0000-0000-000000000000';
update families set access_status = 'past_due' where id = 'c1000000-0000-0000-0000-000000000000';
update families set access_status = 'active' where id = 'c1000000-0000-0000-0000-000000000000';
-- The award inside that privileged update must not switch the flag off.
insert into probe_results values (nextval('probe_seq'), 'privileged work continues after an award', 'on', current_setting('kin.privileged', true));
select set_config('kin.privileged', 'off', true);
select pg_temp.probe('they subscribed: 30 more, once (37)', 'd0000000-0000-0000-0000-000000000001',
  $q$select 1 from families where id = 'd1000000-0000-0000-0000-000000000000' and plus_credit_days = 37$q$, 'allowed');

-- Another household ---------------------------------------------------------------
select pg_temp.probe('another household reads A''s offers', 'd0000000-0000-0000-0000-000000000001',
  $q$select * from household_offers where family_id = 'a1000000-0000-0000-0000-000000000000'$q$, 'no rows');
select pg_temp.probe('another household answers A''s offer', 'd0000000-0000-0000-0000-000000000001',
  $q$select public.respond_kin_offer((select id from household_offers where family_id = 'a1000000-0000-0000-0000-000000000000' and status = 'skipped' limit 1), true)$q$, 'error P0002');
select pg_temp.probe('CONTROL: A reads its own awards', 'a0000000-0000-0000-0000-000000000001',
  $q$select * from kin_plus_awards where family_id = 'a1000000-0000-0000-0000-000000000000'$q$, 'allowed');

select n, label, expected, actual, case when expected = actual then 'ok' else 'FAIL' end as verdict
from probe_results order by n;

rollback;
