-- 🎯 "Make it a goal" on Wealth (Jonathan, 29 October): a money goal on
-- Planner can follow one thing on Wealth and fill from it by itself.
--
--   account  a savings account's balance, up to a target
--   loan     a loan paid down to what is owed by a date (start_value is the
--            balance when the goal was set; target is how much to pay down)
--   income   a regular income (income_groups) or one expected payment
--            (income_schedules), so much a month; watch_on_time adds the
--            run of months it came on its day and in full
--   expense  a spending category's monthly limit, for a person or the
--            family (owner_member_id null); tracks_category names it
--   asset    a fund to replace or upgrade a house or car: the goal's
--            savings_goal_id is that fund, and tracks_id the asset
--
-- One goal per thing per person (a removed one doesn't count). The thing
-- has to be this household's and one the member can see: the check below
-- reads it as them, so a private account of someone else's can't be
-- followed.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.planner_goals
  add column if not exists tracks text,
  add column if not exists tracks_id uuid,
  add column if not exists tracks_category text,
  add column if not exists watch_on_time boolean not null default false;

alter table public.planner_goals drop constraint if exists planner_goals_tracks_kind;
alter table public.planner_goals add constraint planner_goals_tracks_kind
  check (tracks is null or tracks in ('account', 'loan', 'income', 'expense', 'asset'));

alter table public.planner_goals drop constraint if exists planner_goals_tracks_shape;
alter table public.planner_goals add constraint planner_goals_tracks_shape
  check (
    (tracks is null and tracks_id is null and tracks_category is null and not watch_on_time)
    or (tracks = 'expense' and tracks_id is null and tracks_category is not null and char_length(tracks_category) between 1 and 60 and not watch_on_time)
    or (tracks in ('account', 'loan', 'asset') and tracks_id is not null and tracks_category is null and not watch_on_time)
    or (tracks = 'income' and tracks_id is not null and tracks_category is null)
  );

alter table public.planner_goals drop constraint if exists planner_goals_tracks_money;
alter table public.planner_goals add constraint planner_goals_tracks_money
  check (tracks is null or kind = 'money');

create unique index if not exists planner_goals_tracks_one
  on public.planner_goals (family_id, tracks, coalesce(tracks_id::text, tracks_category), coalesce(owner_member_id::text, ''))
  where tracks is not null and removed_at is null;

-- The thing followed is this household's, and visible to whoever sets it.
-- Invoker's rights on purpose: it reads as the member, through their RLS.
create or replace function public.planner_goals_tracks_here()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tracks is null or new.tracks = 'expense' then
    return new;
  end if;
  if (new.tracks = 'account' and not exists (select 1 from accounts where id = new.tracks_id and family_id = new.family_id))
     or (new.tracks = 'loan' and not exists (select 1 from liabilities where id = new.tracks_id and family_id = new.family_id))
     or (new.tracks = 'asset' and not exists (select 1 from assets where id = new.tracks_id and family_id = new.family_id))
     or (new.tracks = 'income'
         and not exists (select 1 from income_groups where id = new.tracks_id and family_id = new.family_id)
         and not exists (select 1 from income_schedules where id = new.tracks_id and family_id = new.family_id)) then
    raise exception 'goal_tracks_elsewhere: a goal follows something of this household''s that you can see.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.planner_goals_tracks_here() from public, anon, authenticated;

drop trigger if exists planner_goals_tracks_here on public.planner_goals;
create trigger planner_goals_tracks_here
  before insert or update of tracks, tracks_id, family_id on public.planner_goals
  for each row execute function public.planner_goals_tracks_here();
