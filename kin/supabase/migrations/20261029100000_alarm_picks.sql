-- Real alarms in the Kin iPhone app (Jonathan, 29 October). Every Kin
-- feature that needs an alarm rings like the Clock app -- full screen, with
-- sound even on silent -- once Kin is an installed app (kin/native,
-- AlarmKit). Medicine doses ring for whoever the dose reminder goes to, under
-- their existing "Health reminders" switch. Plans, check-ups and bills ring
-- only when the person switches that one item on, which is what this table
-- keeps: one row per person per item. Off by default, so a phone doesn't
-- ring all day.
--
-- Per person, not per item: the whole family's Sunday lunch can ring on one
-- grown-up's phone and stay a plain reminder on another's. A member only
-- ever sees, adds and removes their own rows. The item itself is read
-- through its own table's row-level security by api/alarms, so a pick of an
-- item the member may not see makes no alarm. A pick of an item that is
-- later deleted simply finds nothing.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.alarm_picks (
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null check (kind in ('activity', 'appointment', 'bill')),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (member_id, kind, item_id)
);

create index if not exists alarm_picks_family_idx on public.alarm_picks (family_id);

alter table public.alarm_picks enable row level security;
revoke all on public.alarm_picks from public, anon, authenticated;
grant select, insert, delete on public.alarm_picks to authenticated;

drop policy if exists alarm_picks_select on public.alarm_picks;
create policy alarm_picks_select on public.alarm_picks for select to authenticated
  using (member_id = (select public.current_member_id()));

drop policy if exists alarm_picks_insert on public.alarm_picks;
create policy alarm_picks_insert on public.alarm_picks for insert to authenticated
  with check (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
  );

drop policy if exists alarm_picks_delete on public.alarm_picks;
create policy alarm_picks_delete on public.alarm_picks for delete to authenticated
  using (member_id = (select public.current_member_id()));

-- Account deletion keeps the member row (a child's profile, letters written
-- to them), so the cascade from members never fires: leaving, being removed
-- or deleting the account clears the picks here instead.
create or replace function public.alarm_picks_follow_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is null or new.status is distinct from 'active' or new.family_id is distinct from old.family_id then
    delete from public.alarm_picks where member_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.alarm_picks_follow_member() from public, anon, authenticated;

drop trigger if exists alarm_picks_follow_member on public.members;
create trigger alarm_picks_follow_member
  after update of auth_user_id, status, family_id on public.members
  for each row execute function public.alarm_picks_follow_member();
