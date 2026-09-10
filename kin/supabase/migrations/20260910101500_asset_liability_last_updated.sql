-- A last-updated timestamp on assets and liabilities
-- ==================================================
--
-- From #54, Janine's seventh item out of the wealth-tab review. A car or a
-- piano does not reprice itself: its value on the A&L tab is only as current
-- as whoever last opened UPDATE and typed a new one. Without this column every
-- figure looks equally current whether it was checked yesterday or at
-- onboarding.
--
-- Other tables already carry updated_at for exactly this reason
-- (calendar_links, shopping items, health conditions), set explicitly by the
-- action that changes the row rather than by a trigger. This brings assets and
-- liabilities in line with that.
--
-- Existing rows are backfilled to their own created_at rather than left at
-- now(): a row nobody has touched since it was added genuinely has not been
-- updated since then, and now() would claim every value was checked the moment
-- this ran.
--
-- Schema first, app code after -- the order the country column went in on
-- 9 September. A column can be added with nothing reading it yet; app code
-- that reads a column which is not there fails outright.
--
-- Applied to dev by hand on 10 September, before this pipeline existed, and
-- recorded there as version 20260910101500. This file carries that same
-- version deliberately: dev's ledger already has it, so dev skips it, and
-- production -- which does not -- is the only place it runs.
--
-- No begin/commit here: the runner wraps every migration in one transaction
-- with its own ledger row.

alter table public.assets
  add column if not exists updated_at timestamptz not null default now();

alter table public.liabilities
  add column if not exists updated_at timestamptz not null default now();

update public.assets      set updated_at = created_at where updated_at <> created_at;
update public.liabilities set updated_at = created_at where updated_at <> created_at;
