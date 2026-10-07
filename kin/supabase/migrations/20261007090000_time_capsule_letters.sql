-- Time-capsule letters (roadmap item 6, Janine, 7 October): a grown-up
-- writes a letter to someone in the household that stays sealed until a day
-- they pick -- by default that person's 18th birthday -- and on that day it
-- opens on Today and in the journal.
--
-- Who may read one:
-- * before it opens, only the person who wrote it -- not the person it is
--   for, not the other grown-ups;
-- * from the day it opens (Manila's day, as everywhere else in Kin), the
--   whole household, like a journal entry.
--
-- Who writes it is set here from the caller, never taken from the row, and
-- the writer's name travels on the row so the letter still says who it is
-- from if they later leave the household. A grown-up (parent or adult) may
-- write; the person it is for must be in the same household. Only the
-- writer may change a letter, and only while it is still sealed; the writer
-- may take one back at any time.

create table if not exists public.time_capsules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  writer_member_id uuid references public.members(id) on delete set null,
  writer_name text not null default '',
  recipient_member_id uuid not null references public.members(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  body text not null check (char_length(body) between 1 and 20000),
  opens_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists time_capsules_family_opens_idx on public.time_capsules (family_id, opens_on);
create index if not exists time_capsules_writer_idx on public.time_capsules (writer_member_id);

alter table public.time_capsules enable row level security;

-- Today in the household's zone.
create or replace function public.time_capsule_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

revoke execute on function public.time_capsule_today() from public, anon;
grant execute on function public.time_capsule_today() to authenticated;

-- The writer is whoever is signed in; the household is theirs; a letter
-- with no date opens on the recipient's 18th birthday.
create or replace function public.time_capsules_fill()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_dob date;
begin
  if tg_op = 'INSERT' then
    new.family_id := (select public.current_family_id());
    new.writer_member_id := (select public.current_member_id());
    new.writer_name := coalesce((select m.full_name from public.members m where m.id = new.writer_member_id), '');
    new.created_at := now();
    if new.opens_on is null then
      select m.dob into v_dob from public.members m
        where m.id = new.recipient_member_id and m.family_id = new.family_id;
      if v_dob is null then
        raise exception 'Pick the day this letter opens.' using errcode = '22023';
      end if;
      new.opens_on := (v_dob + interval '18 years')::date;
    end if;
  else
    new.family_id := old.family_id;
    new.writer_member_id := old.writer_member_id;
    new.writer_name := old.writer_name;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists time_capsules_fill on public.time_capsules;
create trigger time_capsules_fill
  before insert or update on public.time_capsules
  for each row execute function public.time_capsules_fill();

drop policy if exists time_capsules_select on public.time_capsules;
create policy time_capsules_select on public.time_capsules
  for select to authenticated using (
    (writer_member_id is not null and writer_member_id = (select public.current_member_id()))
    or (family_id = (select public.current_family_id()) and opens_on <= (select public.time_capsule_today()))
  );

drop policy if exists time_capsules_insert on public.time_capsules;
create policy time_capsules_insert on public.time_capsules
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and writer_member_id = (select public.current_member_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and opens_on > (select public.time_capsule_today())
    and exists (
      select 1 from public.members m
      where m.id = time_capsules.recipient_member_id and m.family_id = time_capsules.family_id
    )
  );

drop policy if exists time_capsules_update on public.time_capsules;
create policy time_capsules_update on public.time_capsules
  for update to authenticated
  using (
    writer_member_id = (select public.current_member_id())
    and opens_on > (select public.time_capsule_today())
  )
  with check (
    writer_member_id = (select public.current_member_id())
    and opens_on > (select public.time_capsule_today())
    and exists (
      select 1 from public.members m
      where m.id = time_capsules.recipient_member_id and m.family_id = time_capsules.family_id
    )
  );

drop policy if exists time_capsules_delete on public.time_capsules;
create policy time_capsules_delete on public.time_capsules
  for delete to authenticated using (
    writer_member_id = (select public.current_member_id())
  );

grant select, insert, update, delete on public.time_capsules to authenticated;
