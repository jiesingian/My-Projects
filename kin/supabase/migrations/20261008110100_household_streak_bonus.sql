-- Streak bonuses: the household sets what they are worth, from now on
-- ===================================================================
--
-- A daily chore's run reaching 7 and 30 days earns bonus points: 10 and 50
-- unless the household says otherwise (lib/streaks STREAK_BONUS). A parent
-- sets them on the Rewards panel. Until this shipped, a bonus was 1 point.
--
-- A change applies to streaks reached from that day on, never to ones
-- already earned (Janine, 7 October) -- lowering the bonus must not take
-- points back, and raising it must not hand out more for last month. So
-- each change is a dated row, and a streak is paid at the rate in force on
-- the day it was reached. Rows are never edited; the newest one wins.
--
-- Streaks already reached when this runs stay at the 1 point they were
-- worth (Janine, 7 October): every existing household is seeded with a rate
-- of 1 for all time before today, and 10/50 from today. A household made
-- later has no rows and gets the 10/50 default; it has no past to protect.
--
-- Writing is a grown-up's job: bonuses are summed into every child's
-- balance. There is no insert/update/delete policy, so the only way in is
-- set_streak_bonus(), which checks the role.

create table if not exists public.streak_bonus_rates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  effective_from date not null,
  seven integer not null,
  thirty integer not null,
  set_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint streak_bonus_rates_sane check (seven between 0 and 1000 and thirty between 0 and 1000)
);

create index if not exists streak_bonus_rates_family_idx
  on public.streak_bonus_rates (family_id, effective_from);

alter table public.streak_bonus_rates enable row level security;

drop policy if exists streak_bonus_rates_select on public.streak_bonus_rates;
create policy streak_bonus_rates_select on public.streak_bonus_rates
  for select using (family_id = public.current_family_id());

-- "Today" is the household's own day (families.time_zone, through
-- safe_time_zone from 20261007140000), not the server's.
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
  insert into public.streak_bonus_rates (family_id, effective_from, seven, thirty, set_by)
  select f.id, (now() at time zone public.safe_time_zone(f.time_zone))::date, p_seven, p_thirty, public.current_member_id()
  from public.families f
  where f.id = public.current_family_id();
end;
$$;

revoke all on function public.set_streak_bonus(integer, integer) from public, anon;
grant execute on function public.set_streak_bonus(integer, integer) to authenticated;

-- The seed: once per household, and only for households with no rates yet,
-- so a re-run adds nothing.
insert into public.streak_bonus_rates (family_id, effective_from, seven, thirty)
select f.id, coalesce(d.effective_from, (now() at time zone public.safe_time_zone(f.time_zone))::date), d.seven, d.thirty
from public.families f
cross join (values
  (date '2000-01-01', 1, 1),
  (null::date, 10, 50)
) as d(effective_from, seven, thirty)
where not exists (select 1 from public.streak_bonus_rates r where r.family_id = f.id);
