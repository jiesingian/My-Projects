-- Net worth, day by day (Jonathan, 27 October): the A&L line gets the
-- same Days / Weeks / Months / Years picker as Cash Flow and Accounts.
--
-- A row was one viewer's net worth for one Who choice in one MONTH: the
-- current month's row was brought up to date on every visit and froze
-- when the month ended (20260930140000). That gave a line with one point
-- a month and nothing finer to show. Now a row is one DAY's: each visit
-- writes the household's day, and a month's figure is its last recorded
-- day, which is what the monthly row already held. Weeks and days draw
-- from the same rows; a day nobody opened Wealth on carries the last
-- figure forward (lib/wealth.ts, netWorthSeries), so the line never
-- invents a value and never has a hole.
--
-- The column is renamed, not added beside the old one, so nothing can
-- write a month and a day that disagree. Rows that exist keep their
-- values; each is moved to the day it was last brought up to date, which
-- is the day its figure was true on. Re-runnable: the rename and the move
-- happen only while the old column is still there.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'net_worth_snapshots' and column_name = 'month'
  ) then
    alter table public.net_worth_snapshots drop constraint if exists net_worth_snapshots_month_is_first;
    alter table public.net_worth_snapshots rename column month to day;
    -- The month's row held the figure as of its last update: date it so.
    -- Two rows of one viewer and scope can't collide -- a row was only
    -- ever updated within its own month.
    update public.net_worth_snapshots
      set day = (updated_at at time zone 'Asia/Manila')::date
      where date_trunc('month', (updated_at at time zone 'Asia/Manila')::date)::date = day;
  end if;
end $$;

-- Read newest-first per viewer and scope, which is how the line asks.
create index if not exists net_worth_snapshots_viewer_scope_day_idx
  on public.net_worth_snapshots (viewer_member_id, scope, day desc);
