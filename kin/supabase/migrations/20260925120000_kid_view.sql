-- Kid view: a simpler Kin for a child with a login of their own, switched on
-- and off by a grown-up (approved 25 September as K1, K2 and K3).
--
-- K1. Per child. Any grown-up in the household (a parent or an adult) can
--     turn it on or off; the child cannot. That second half is enforced
--     here, by the trigger below, rather than by the settings page hiding a
--     switch: members can edit their own row (their profile), and without the
--     trigger a child could write kid_view = false on themselves directly.
-- K2. What a child in kid view sees is the app's business (four tabs, and
--     the pages behind the others send them back to Today). This column is
--     only the switch the app reads.
-- K3. A child who gets a login of their own starts in kid view: a new
--     child_self member, or a managed child who becomes one when a login is
--     attached. A grown-up can switch it off afterwards.
--
-- Nothing changes for anybody else: the column defaults to false, and every
-- existing child_self member keeps seeing exactly what they see today until
-- a grown-up turns kid view on for them.

alter table public.members add column if not exists kid_view boolean not null default false;

create or replace function public.guard_kid_view()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- K3: a login of their own for the first time means kid view.
  if new.role = 'child_self' and (tg_op = 'INSERT' or old.role is distinct from 'child_self') then
    new.kid_view := true;
  end if;

  -- K1: only a grown-up in the same household changes it afterwards.
  -- current_member_role() is null for a session with no member (the
  -- migration runner, a security-definer function acting for the system),
  -- which is allowed: those are not a child reaching for their own switch.
  if tg_op = 'UPDATE' and new.kid_view is distinct from old.kid_view then
    if current_member_role() is not null
       and (current_member_role() not in ('parent', 'adult') or current_family_id() is distinct from new.family_id) then
      raise exception 'Only a grown-up in the household can change kid view.' using errcode = '42501';
    end if;
  end if;

  -- Kid view is for children with a login. A grown-up, or a managed child
  -- with no login to see anything with, is never in it.
  if new.role not in ('child_self') then
    new.kid_view := false;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_kid_view() from public;

drop trigger if exists members_guard_kid_view on public.members;
create trigger members_guard_kid_view before insert or update on public.members
  for each row execute function public.guard_kid_view();
