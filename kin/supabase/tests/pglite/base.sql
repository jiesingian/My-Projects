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
