-- One row per member, per drink type, per day -- a running count rather than
-- individual sips, since that's the granularity the quick-add buttons and
-- the day's tally both actually need.
create table if not exists liquid_intake_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  type text not null check (type in ('water', 'juice', 'milk')),
  log_date date not null,
  glasses integer not null default 0 check (glasses >= 0 and glasses <= 24),
  updated_at timestamptz not null default now(),
  unique (member_id, type, log_date)
);

create index if not exists liquid_intake_log_family_id_idx on liquid_intake_log(family_id);
create index if not exists liquid_intake_log_member_date_idx on liquid_intake_log(member_id, log_date);

alter table liquid_intake_log enable row level security;

-- Open to any signed-in member, not just the member being logged for -- the
-- same reasoning emergency_contacts and the family tree already use, and the
-- one this table needs most: a parent logs a baby's milk, not the baby.
drop policy if exists liquid_intake_log_select on liquid_intake_log;
create policy liquid_intake_log_select on liquid_intake_log
  for select using (family_id = current_family_id());

drop policy if exists liquid_intake_log_insert on liquid_intake_log;
create policy liquid_intake_log_insert on liquid_intake_log
  for insert with check (family_id = current_family_id());

drop policy if exists liquid_intake_log_update on liquid_intake_log;
create policy liquid_intake_log_update on liquid_intake_log
  for update using (family_id = current_family_id());
