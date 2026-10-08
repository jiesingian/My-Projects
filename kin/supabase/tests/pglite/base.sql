create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.people (id uuid primary key default gen_random_uuid(), auth_user_id uuid unique, created_at timestamptz default now());
create table public.families (id uuid primary key default gen_random_uuid(), name text, invite_code text, share_with_relatives boolean not null default true);
create table public.members (id uuid primary key default gen_random_uuid(), family_id uuid references families(id), person_id uuid references people(id), auth_user_id uuid, full_name text not null, avatar_url text, role text not null, status text not null default 'active', notification_prefs jsonb default '{}', created_at timestamptz default now());
create table public.family_links (id uuid primary key default gen_random_uuid(), requester_family_id uuid, addressee_family_id uuid, status text);
create function public.current_family_id() returns uuid language sql stable security definer set search_path=public as $$ select family_id from members where auth_user_id = auth.uid() and status='active' limit 1 $$;
create function public.current_member_id() returns uuid language sql stable security definer set search_path=public as $$ select id from members where auth_user_id = auth.uid() and status='active' limit 1 $$;
create function public.current_person_id() returns uuid language sql stable security definer set search_path='' as $$ select p.id from public.people p where p.auth_user_id = auth.uid() $$;
create function public.families_are_linked(a uuid, b uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists (select 1 from family_links l where l.status='accepted' and ((l.requester_family_id=a and l.addressee_family_id=b) or (l.requester_family_id=b and l.addressee_family_id=a))) $$;
create function public.can_see_occasions_of(p_family_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select p_family_id = current_family_id() or (families_are_linked(p_family_id, current_family_id()) and exists (select 1 from families f where f.id = p_family_id and f.share_with_relatives)) $$;
grant usage on schema public to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated, anon;
alter table people enable row level security; alter table members enable row level security; alter table families enable row level security;
create policy m on members for select using (family_id = current_family_id());
create policy f on families for select using (id = current_family_id());
create policy p on people for select using (auth_user_id = auth.uid());
grant select on people, families, members, family_links to authenticated;

-- Households: A (parent Ann, child Kid), B linked with A (Ben), C linked with A but not sharing (Cat), D stranger (Dan, grown-up), E stranger kid.
insert into families (id,name,share_with_relatives) values
 ('a0000000-0000-0000-0000-000000000000','House A',true),
 ('b0000000-0000-0000-0000-000000000000','House B',true),
 ('c0000000-0000-0000-0000-000000000000','House C',false),
 ('d0000000-0000-0000-0000-000000000000','House D',true);
insert into family_links (requester_family_id, addressee_family_id, status) values
 ('a0000000-0000-0000-0000-000000000000','b0000000-0000-0000-0000-000000000000','accepted'),
 ('c0000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000000','accepted');
insert into people (id, auth_user_id) values
 ('00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-0000000000a2'),
 ('00000000-0000-0000-0000-0000000000a3',null),
 ('00000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000d1'),
 ('00000000-0000-0000-0000-0000000000d2','10000000-0000-0000-0000-0000000000d2');
insert into members (id,family_id,person_id,auth_user_id,full_name,role) values
 ('00000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-0000000000a1','Ann A','parent'),
 ('00000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-0000000000a2','Kid A','child_self'),
 ('00000000-0000-0000-0000-0000000000a3','a0000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000a3',null,'Baby A','child_managed'),
 ('00000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-0000000000b1','Ben B','parent'),
 ('00000000-0000-0000-0000-0000000000c1','c0000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-0000000000c1','Cat C','parent'),
 ('00000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000d1','Dan D','adult'),
 ('00000000-0000-0000-0000-0000000000d2','d0000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000d2','10000000-0000-0000-0000-0000000000d2','Dee D','child_self');
create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), member_id uuid references members(id), family_id uuid, endpoint text, p256dh text, auth text);
insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) select id, family_id, 'https://push/'||full_name, 'k', 'a' from members where auth_user_id is not null;
update members set notification_prefs = '{"chat": false}' where full_name = 'Kid A';
create table public.family_link_messages (id uuid primary key default gen_random_uuid(), link_id uuid, family_id uuid, member_id uuid, author_name text default '', body text, created_at timestamptz default now());
alter table family_link_messages enable row level security;
create policy flm on family_link_messages for select using (exists (select 1 from family_links l where l.id = link_id and l.status='accepted' and current_family_id() in (l.requester_family_id, l.addressee_family_id)));
grant select on family_link_messages to authenticated;
create schema storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select on storage.objects to authenticated;
create policy own_folder on storage.objects for select to authenticated using (bucket_id = 'documents' and split_part(name, '/', 1) = public.current_family_id()::text);
insert into storage.objects (bucket_id, name) values
 ('documents', 'a0000000-0000-0000-0000-000000000000/chat/room.jpg'),
 ('documents', 'a0000000-0000-0000-0000-000000000000/chat/household-only.jpg'),
 ('documents', 'a0000000-0000-0000-0000-000000000000/chat/dm.jpg');
create table if not exists public.family_message_attachments (id uuid primary key default gen_random_uuid(), family_id uuid);

-- Wealth stand-ins, for the remittance log (20260930130000). Accounts and the
-- ledger carry the same row-level policies as the real ones; Kin Plus is not
-- what these probes are about, so its guard lets everything through.
create function public.current_member_role() returns text language sql stable security definer set search_path=public as $$ select role from members where auth_user_id = auth.uid() and status='active' limit 1 $$;
create function public.require_kin_plus() returns trigger language plpgsql as $$ begin return new; end $$;
create table public.accounts (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), name text not null, opening_balance numeric not null default 0, is_joint boolean not null default false, owner_member_id uuid references members(id), is_private boolean not null default false, is_archived boolean not null default false);
create table public.wealth_transactions (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), account_id uuid not null references accounts(id), direction text not null, amount numeric not null check (amount > 0), particulars text not null, category text, occurred_at timestamptz not null default now(), status text not null default 'confirmed', source_table text, source_id uuid, goal_id uuid, recorded_by uuid, created_at timestamptz not null default now(),
  constraint wealth_transactions_source_table_check check (source_table is null or source_table = any (array['bills','trips','buy_items','health_appointments','goals','routines','income_schedules'])));
alter table accounts enable row level security; alter table wealth_transactions enable row level security;
create policy accounts_select on accounts for select using (family_id = current_family_id() and (is_joint or owner_member_id = current_member_id() or not is_private));
create policy wealth_transactions_select on wealth_transactions for select using (family_id = current_family_id() and exists (select 1 from accounts a where a.id = wealth_transactions.account_id and (a.is_joint or a.owner_member_id = current_member_id() or not a.is_private)));
create policy wealth_transactions_insert on wealth_transactions for insert with check (family_id = current_family_id());
create policy wealth_transactions_delete on wealth_transactions for delete using (family_id = current_family_id());
insert into members (id,family_id,person_id,auth_user_id,full_name,role) values
 ('00000000-0000-0000-0000-0000000000a4','a0000000-0000-0000-0000-000000000000',null,'10000000-0000-0000-0000-0000000000a4','Abe A','adult');
insert into accounts (id,family_id,name,is_joint,owner_member_id,is_private) values
 ('a4000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000000','Joint BDO',true,null,false),
 ('a4000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000000','Ann GCash',false,'00000000-0000-0000-0000-0000000000a1',true),
 ('d4000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000000','Dan bank',true,null,false);

-- Scheduled messages (20260930210000) write into the household chat and read
-- the cron secret from Vault; stand-ins for both.
create table if not exists public.family_messages (id uuid primary key default gen_random_uuid(), family_id uuid not null, member_id uuid, body text not null, mentions uuid[] not null default '{}', created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz, reply_to uuid, forwarded_from text);
create or replace function public.kin_vault_secret(p_name text) returns text language sql stable as $$ select 'pglite-cron-secret-0123456789abcdef0123456789' $$;
-- Journal stand-ins (for 20261006100500_journal_entry_videos.sql): an entry is
-- seen by its household when it is a household entry, by its owner when it is
-- Just me, and by a linked household once shared -- the same three rules
-- production's journal_entries policies give, reduced to what the video
-- policies lean on.
create table public.journal_entries (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), title text not null default 'An entry', visibility text not null default 'household', owner_person_id uuid, shared_at timestamptz);
alter table journal_entries enable row level security;
create policy je_household on journal_entries for select using (family_id = current_family_id() and (visibility = 'household' or owner_person_id = current_person_id()));
create policy je_linked on journal_entries for select using (shared_at is not null and visibility = 'household' and families_are_linked(family_id, current_family_id()));
grant select on journal_entries to authenticated;
grant delete on storage.objects to authenticated;
create policy journal_own_family on storage.objects for select to authenticated using (bucket_id = 'journal' and split_part(name, '/', 1) = public.current_family_id()::text);
create policy journal_own_person on storage.objects for select to authenticated using (bucket_id = 'journal' and split_part(name, '/', 1) = 'person' and split_part(name, '/', 2) = public.current_person_id()::text);
insert into journal_entries (id, family_id, visibility, owner_person_id) values
 ('e0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-000000000000','household','00000000-0000-0000-0000-0000000000a1'),
 ('e0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-000000000000','personal','00000000-0000-0000-0000-0000000000a1'),
 ('e0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-000000000000','household','00000000-0000-0000-0000-0000000000b1');
insert into storage.objects (bucket_id, name) values
 ('journal', 'a0000000-0000-0000-0000-000000000000/videos/v.mp4'),
 ('journal', 'a0000000-0000-0000-0000-000000000000/videos/v.jpg'),
 ('journal', 'person/00000000-0000-0000-0000-0000000000a1/videos/mine.mp4'),
 ('journal', 'person/00000000-0000-0000-0000-0000000000a1/videos/mine.jpg');

-- Family tree stand-ins (for 20260923160000_tree_shared_relatives and
-- 20261006120000_tree_match_suggestions): a person row with the columns and
-- the household-only policies the real table has.
alter table members add column if not exists dob date;
create table public.family_tree_people (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), member_id uuid references members(id), full_name text, dob date, notes text, father_id uuid references family_tree_people(id), mother_id uuid references family_tree_people(id), spouse_id uuid references family_tree_people(id), created_by uuid, created_at timestamptz not null default now());
alter table family_tree_people enable row level security;
create policy ftp_select on family_tree_people for select using (family_id = current_family_id());
create policy ftp_insert on family_tree_people for insert with check (family_id = current_family_id());

-- Bills and the reminder ledger (for 20261007170000_bill_reminder_days): the
-- columns the ahead-of-time bill push reads, and reminder_sends as
-- 20260926140000_reminders made it.
create table public.bills (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), name text not null, amount numeric not null default 1, due_date date, status text not null default 'unpaid', paid_at timestamptz, recurrence text);
create table if not exists public.reminder_sends (key text primary key, sent_at timestamptz not null default now());
-- The shopping list and the meal plan, for buy_item_meals (20261008100000): the household's own rows, nobody else's.
create table public.buy_items (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), name text not null, quantity numeric, unit text, section text not null default 'Other', source text not null default 'house', checked boolean not null default false, cleared boolean not null default false);
create table public.meal_plans (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), plan_date date not null default current_date, slot text not null default 'dinner', dish text not null);
alter table buy_items enable row level security; alter table meal_plans enable row level security;
create policy bi_all on buy_items for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy mp_all on meal_plans for all using (family_id = current_family_id()) with check (family_id = current_family_id());
-- member_locations as 20260922071500_member_locations made it (that file is not
-- re-runnable, so it stands in here rather than in run.mjs MIGRATIONS).
create table public.member_locations (
  member_id uuid primary key references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  sharing boolean not null default false,
  lat double precision,
  lng double precision,
  -- What the device claimed, in metres. Worth keeping: "within 12 m" and
  -- "within 3 km" are the difference between a location and a guess, and the
  -- board says which one it is showing.
  accuracy_m integer,
  updated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_locations_coords_paired check (
    (lat is null and lng is null)
    or (lat between -90 and 90 and lng between -180 and 180)
  ),
  constraint member_locations_accuracy_sane check (
    accuracy_m is null or (accuracy_m >= 0 and accuracy_m <= 10000000)
  ),
  -- Not sharing means not holding a position. The constraint is what makes
  -- that true rather than merely intended.
  constraint member_locations_cleared_when_off check (
    sharing or (lat is null and lng is null and accuracy_m is null)
  )
);

create index member_locations_family_id_idx on public.member_locations(family_id);

alter table public.member_locations enable row level security;

-- The household sees the board. That is the whole point of it, and it is
-- why turning sharing on has to be a deliberate act.
create policy member_locations_select on public.member_locations
  for select using (family_id = current_family_id());

-- Your own row, or a managed child's -- that profile has no login, so if a
-- grown-up cannot create it nobody can.
create policy member_locations_insert on public.member_locations
  for insert with check (
    family_id = current_family_id()
    and (
      member_id = current_member_id()
      or (
        current_member_role() in ('parent', 'adult')
        and exists (
          select 1 from public.members m
          where m.id = member_id
            and m.family_id = current_family_id()
            and m.role = 'child_managed'
        )
      )
    )
  );

create policy member_locations_update on public.member_locations
  for update using (family_id = current_family_id())
  with check (
    family_id = current_family_id()
    and (
      member_id = current_member_id()
      or (
        -- A grown-up may switch a managed profile's sharing, but may not
        -- put a position on it. Only a device reports a position, and a
        -- managed profile has no device.
        lat is null and lng is null
        and current_member_role() in ('parent', 'adult')
        and exists (
          select 1 from public.members m
          where m.id = member_id
            and m.family_id = current_family_id()
            and m.role = 'child_managed'
        )
      )
    )
  );

-- Stopping is never harder than starting.
create policy member_locations_delete on public.member_locations
  for delete using (
    family_id = current_family_id()
    and (
      member_id = current_member_id()
      or current_member_role() in ('parent', 'adult')
    )
  );
grant all on public.member_locations to authenticated;
