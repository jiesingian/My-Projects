-- Streak bonuses: the household sets what they are worth
-- ======================================================
--
-- A daily chore's run reaching 7 and 30 days earns bonus points. The app
-- defaulted them to 10 and 50 (lib/streaks STREAK_BONUS); a parent now sets
-- them per household, on the Rewards panel.
--
-- Changing them is a grown-up's job: bonuses are summed into every child's
-- balance, so a child who could raise them could give themselves points.
-- Grown-ups write through set_streak_bonus() rather than a direct update,
-- because the families update policy predates the migrations folder and
-- may be organiser-only; the trigger below holds whichever way a write
-- comes in.

alter table public.families add column if not exists streak_bonus_7 integer not null default 10;
alter table public.families add column if not exists streak_bonus_30 integer not null default 50;

alter table public.families drop constraint if exists families_streak_bonus_sane;
alter table public.families add constraint families_streak_bonus_sane
  check (streak_bonus_7 between 0 and 1000 and streak_bonus_30 between 0 and 1000);

create or replace function public.families_streak_bonus_grown_ups_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.current_member_role();
begin
  if r is null or r in ('parent', 'adult') then
    return new;
  end if;
  if new.streak_bonus_7 is distinct from old.streak_bonus_7
     or new.streak_bonus_30 is distinct from old.streak_bonus_30 then
    raise exception 'Only a parent or another adult can change the streak bonus.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.families_streak_bonus_grown_ups_only() from public, anon;

drop trigger if exists families_streak_bonus_grown_ups_only on public.families;
create trigger families_streak_bonus_grown_ups_only
  before update on public.families
  for each row execute function public.families_streak_bonus_grown_ups_only();

create or replace function public.set_streak_bonus(p_seven integer, p_thirty integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_member_role() is null or public.current_member_role() not in ('parent', 'adult') then
    raise exception 'Only a parent or another adult can change the streak bonus.'
      using errcode = '42501';
  end if;
  update public.families
     set streak_bonus_7 = p_seven, streak_bonus_30 = p_thirty
   where id = public.current_family_id();
end;
$$;

revoke all on function public.set_streak_bonus(integer, integer) from public, anon;
grant execute on function public.set_streak_bonus(integer, integer) to authenticated;
