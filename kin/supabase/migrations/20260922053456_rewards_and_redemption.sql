-- Somewhere for the points to go, and a lock on who may say yes
-- ==============================================================
--
-- Points without anything to spend them on is a scoreboard, not a reward
-- system. A reward is a thing the household agrees is worth something -- an
-- hour of screen time, choosing Friday's dinner, a trip to the shop -- with
-- a price in points. A child asks for it; a grown-up grants it, the same
-- people and the same shape as approving a chore.
--
-- WHY THE POLICIES BELOW ARE NOT JUST family_id = current_family_id()
-- -------------------------------------------------------------------
-- Every other table in this app can be, because every member of a household
-- is trusted with the household's own records. This pair cannot, and neither
-- can routine_log, for one reason: the person the rule is about is signed in
-- and holds the anon key.
--
-- Kin ships a browser Supabase client (lib/supabase/client.ts, used by chat
-- and uploads), the anon key is public by design, and a member's session
-- lives in their browser. So a child with the developer tools open can send
-- PostgREST whatever they like as themselves, and the only thing standing in
-- the way is row-level security. A role check inside a server action is a
-- user interface, not a boundary.
--
-- Every policy below names the grown-up roles rather than the child ones, and
-- that is deliberate: the roles are 'parent', 'adult', 'child_managed' and
-- 'child_self', and a rule written the other way round has to remember all of
-- them or it lets somebody through. The application code asked for a role
-- called 'child' -- which nobody has ever been -- and so never required an
-- approval at all; that is fixed alongside this, in lib/roles.ts.
--
-- routine_log's update policy checked family_id alone, which meant the child
-- whose chore was waiting could set approval = 'approved' on their own row
-- directly. The approval workflow shipped one release earlier was therefore
-- advisory. This fixes that as well, because it is the same hole.

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  cost_points integer not null,
  -- Retired rather than deleted: a redemption from last month still needs
  -- to be able to say what it was for.
  active boolean not null default true,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint rewards_cost_sane check (cost_points > 0 and cost_points <= 10000)
);

create index if not exists rewards_family_id_idx on rewards(family_id);

create table if not exists reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  reward_id uuid not null references rewards(id) on delete restrict,
  member_id uuid not null references members(id) on delete cascade,
  -- What it cost *then*. The reward's price is allowed to change, and when
  -- it does it must not silently rewrite what somebody already spent -- the
  -- same reason routine points are summed from the log rather than kept as
  -- a running total that could drift from it.
  cost_points integer not null,
  status text not null default 'pending',
  decided_by uuid references members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reward_redemptions_status_check check (status in ('pending', 'granted', 'refused'))
);

create index if not exists reward_redemptions_family_id_idx on reward_redemptions(family_id);
create index if not exists reward_redemptions_member_id_idx on reward_redemptions(member_id);
-- The grown-ups' queue, asked for on every visit to Today.
create index if not exists reward_redemptions_pending_idx
  on reward_redemptions (family_id) where status = 'pending';

alter table rewards enable row level security;
alter table reward_redemptions enable row level security;

-- Everyone in the house sees the list. Setting what things cost is a
-- grown-up's job, or the price of a bicycle is whatever the child last typed.
drop policy if exists rewards_select on rewards;
create policy rewards_select on rewards
  for select using (family_id = current_family_id());

drop policy if exists rewards_insert on rewards;
create policy rewards_insert on rewards
  for insert with check (
    family_id = current_family_id()
    and current_member_role() in ('parent', 'adult')
  );

drop policy if exists rewards_update on rewards;
create policy rewards_update on rewards
  for update using (family_id = current_family_id())
  with check (
    family_id = current_family_id()
    and current_member_role() in ('parent', 'adult')
  );

drop policy if exists reward_redemptions_select on reward_redemptions;
create policy reward_redemptions_select on reward_redemptions
  for select using (family_id = current_family_id());

-- Asking is allowed; granting yourself is not. A child may write only a
-- pending request, only for themselves, and only at the price the reward
-- actually carries -- otherwise the snapshot could be forged to nothing.
-- A grown-up may ask on someone's behalf, at that same price.
drop policy if exists reward_redemptions_insert on reward_redemptions;
create policy reward_redemptions_insert on reward_redemptions
  for insert with check (
    family_id = current_family_id()
    and cost_points = (select r.cost_points from rewards r where r.id = reward_id and r.family_id = current_family_id())
    and (
      current_member_role() in ('parent', 'adult')
      or (status = 'pending' and member_id = current_member_id())
    )
  );

-- Answering a request is a grown-up's, full stop.
drop policy if exists reward_redemptions_update on reward_redemptions;
create policy reward_redemptions_update on reward_redemptions
  for update using (family_id = current_family_id())
  with check (
    family_id = current_family_id()
    and current_member_role() in ('parent', 'adult')
  );

-- And the same lock on the chore approval that shipped without one. A child
-- may still tick and untick their own -- that writes 'pending' or
-- 'not_required' -- but only a grown-up can write an answer.
drop policy if exists routine_log_update on routine_log;
create policy routine_log_update on routine_log
  for update using (family_id = current_family_id())
  with check (
    family_id = current_family_id()
    and (
      current_member_role() in ('parent', 'adult')
      or approval in ('pending', 'not_required')
    )
  );
