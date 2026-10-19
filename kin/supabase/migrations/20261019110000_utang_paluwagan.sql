-- Utang and paluwagan (the 14 October "What's Left" review, item 2)
-- =================================================================
--
-- WHAT IT IS
--
-- Two ledgers a Filipino household keeps in its head or a notebook:
--
--   utang      money lent to a relative, or borrowed from one, paid back a
--              little at a time. utang_entries is the loan, utang_payments
--              each partial payment. What is left is the amount less the
--              payments -- summed, never stored.
--   paluwagan  a rotating savings group: every member puts in the same
--              amount each round, and each round one member, in turn, takes
--              the whole pot. paluwagan_groups is the group (amount,
--              schedule), paluwagan_members its people and their turns,
--              paluwagan_payments who has paid which round.
--
-- Kin keeps the record. It moves no money and never contacts anybody: a
-- reminder is a message Kin writes for the grown-up to send themselves
-- (share sheet or copy), and only on an entry they switched it on for.
--
-- WHO SEES IT
--
-- Chosen per entry, the same two choices as a remittance (20260930130000):
--   household grown-ups  is_private = false: every parent and adult here;
--   just me              is_private = true: only whoever recorded it.
-- Children never see either -- not even a "household" one -- and a linked
-- household or a stranger sees nothing. The rows under an utang or a group
-- (payments, members) follow their parent: the policies ask for the parent
-- row through its own policy, so whoever cannot see the loan cannot see
-- its payments either.
--
-- Only the recorder can make an entry "just me"; another grown-up can
-- neither hide a household entry from the rest nor read a private one.
--
-- KIN PLUS
--
-- Wealth is Kin Plus, so every table here carries require_kin_plus.

create table if not exists public.utang_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  -- 'lent': they owe us. 'borrowed': we owe them.
  direction text not null,
  person_name text not null,
  amount numeric(14, 2) not null,
  started_on date not null default current_date,
  due_on date,
  note text,
  is_private boolean not null default false,
  -- Opt-in, per entry: Kin prepares a gentle message to send.
  remind boolean not null default false,
  recorded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint utang_entries_direction check (direction in ('lent', 'borrowed')),
  constraint utang_entries_amount_positive check (amount > 0 and amount <= 100000000),
  constraint utang_entries_person_length check (char_length(btrim(person_name)) between 1 and 120),
  constraint utang_entries_note_length check (note is null or char_length(note) <= 500),
  constraint utang_entries_due_after_start check (due_on is null or due_on >= started_on)
);

create index if not exists utang_entries_family_idx on public.utang_entries (family_id, started_on desc);
create index if not exists utang_entries_recorded_by_idx on public.utang_entries (recorded_by);

create table if not exists public.utang_payments (
  id uuid primary key default gen_random_uuid(),
  utang_id uuid not null references public.utang_entries(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  amount numeric(14, 2) not null,
  paid_on date not null default current_date,
  note text,
  recorded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint utang_payments_amount_positive check (amount > 0),
  constraint utang_payments_note_length check (note is null or char_length(note) <= 200)
);

create index if not exists utang_payments_utang_idx on public.utang_payments (utang_id);
create index if not exists utang_payments_family_idx on public.utang_payments (family_id);
create index if not exists utang_payments_recorded_by_idx on public.utang_payments (recorded_by);

create table if not exists public.paluwagan_groups (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  -- What each member puts in every round. The pot is this times the members.
  contribution numeric(14, 2) not null,
  frequency text not null default 'monthly',
  starts_on date not null,
  note text,
  is_private boolean not null default false,
  remind boolean not null default false,
  recorded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint paluwagan_groups_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint paluwagan_groups_contribution_positive check (contribution > 0 and contribution <= 10000000),
  -- semi_monthly: every kinsenas, the 15th and the end of the month's pay.
  constraint paluwagan_groups_frequency check (frequency in ('weekly', 'semi_monthly', 'monthly')),
  constraint paluwagan_groups_note_length check (note is null or char_length(note) <= 500)
);

create index if not exists paluwagan_groups_family_idx on public.paluwagan_groups (family_id);
create index if not exists paluwagan_groups_recorded_by_idx on public.paluwagan_groups (recorded_by);

create table if not exists public.paluwagan_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.paluwagan_groups(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  -- Which round's pot is theirs: 1 takes the first.
  turn integer not null,
  -- The household's own slot in the group.
  is_us boolean not null default false,
  created_at timestamptz not null default now(),
  constraint paluwagan_members_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint paluwagan_members_turn_sane check (turn between 1 and 100),
  constraint paluwagan_members_turn_unique unique (group_id, turn)
);

create index if not exists paluwagan_members_family_idx on public.paluwagan_members (family_id);

create table if not exists public.paluwagan_payments (
  member_id uuid not null references public.paluwagan_members(id) on delete cascade,
  round integer not null,
  group_id uuid not null references public.paluwagan_groups(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  paid_on date not null default current_date,
  recorded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (member_id, round),
  constraint paluwagan_payments_round_sane check (round between 1 and 100)
);

create index if not exists paluwagan_payments_group_idx on public.paluwagan_payments (group_id, round);
create index if not exists paluwagan_payments_family_idx on public.paluwagan_payments (family_id);
create index if not exists paluwagan_payments_recorded_by_idx on public.paluwagan_payments (recorded_by);

-- A payment's member must belong to the payment's group.
create or replace function public.paluwagan_payment_member_in_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.paluwagan_members m where m.id = new.member_id and m.group_id = new.group_id) then
    raise exception 'paluwagan_member_not_in_group' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.paluwagan_payment_member_in_group() from public, anon, authenticated;

drop trigger if exists paluwagan_payment_member_in_group on public.paluwagan_payments;
create trigger paluwagan_payment_member_in_group
  before insert or update on public.paluwagan_payments
  for each row execute function public.paluwagan_payment_member_in_group();

-- Payments cannot add up to more than was lent or borrowed. Checked under a
-- lock on the loan, so two phones recording at once cannot both overpay.
create or replace function public.utang_payments_not_over()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric;
  v_paid numeric;
begin
  select u.amount into v_amount from public.utang_entries u where u.id = new.utang_id for update;
  select coalesce(sum(p.amount), 0) into v_paid
    from public.utang_payments p
    where p.utang_id = new.utang_id and p.id <> new.id;
  if v_paid + new.amount > v_amount then
    raise exception 'utang_overpaid: payments would add up to more than the utang' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.utang_payments_not_over() from public, anon, authenticated;

drop trigger if exists utang_payments_not_over on public.utang_payments;
create trigger utang_payments_not_over
  before insert or update on public.utang_payments
  for each row execute function public.utang_payments_not_over();

alter table public.utang_entries enable row level security;
alter table public.utang_payments enable row level security;
alter table public.paluwagan_groups enable row level security;
alter table public.paluwagan_members enable row level security;
alter table public.paluwagan_payments enable row level security;

-- The parents: grown-ups of the household, and a private one only to its
-- recorder. Written out twice rather than generated so each reads plainly.
drop policy if exists utang_entries_select on public.utang_entries;
create policy utang_entries_select on public.utang_entries
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and (not is_private or recorded_by = (select public.current_member_id()))
  );

drop policy if exists utang_entries_insert on public.utang_entries;
create policy utang_entries_insert on public.utang_entries
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and recorded_by = (select public.current_member_id())
  );

drop policy if exists utang_entries_update on public.utang_entries;
create policy utang_entries_update on public.utang_entries
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and (not is_private or recorded_by = (select public.current_member_id()))
  )
  with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and (not is_private or recorded_by = (select public.current_member_id()))
  );

drop policy if exists utang_entries_delete on public.utang_entries;
create policy utang_entries_delete on public.utang_entries
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and (not is_private or recorded_by = (select public.current_member_id()))
  );

drop policy if exists paluwagan_groups_select on public.paluwagan_groups;
create policy paluwagan_groups_select on public.paluwagan_groups
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and (not is_private or recorded_by = (select public.current_member_id()))
  );

drop policy if exists paluwagan_groups_insert on public.paluwagan_groups;
create policy paluwagan_groups_insert on public.paluwagan_groups
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and recorded_by = (select public.current_member_id())
  );

drop policy if exists paluwagan_groups_update on public.paluwagan_groups;
create policy paluwagan_groups_update on public.paluwagan_groups
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and (not is_private or recorded_by = (select public.current_member_id()))
  )
  with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and (not is_private or recorded_by = (select public.current_member_id()))
  );

drop policy if exists paluwagan_groups_delete on public.paluwagan_groups;
create policy paluwagan_groups_delete on public.paluwagan_groups
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and (not is_private or recorded_by = (select public.current_member_id()))
  );

-- The children of each: visible and writable exactly when the parent is.
-- The exists() runs through the parent's own policy above.
drop policy if exists utang_payments_all on public.utang_payments;
create policy utang_payments_all on public.utang_payments
  for all to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.utang_entries u where u.id = utang_id)
  )
  with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.utang_entries u where u.id = utang_id and u.family_id = utang_payments.family_id)
    and recorded_by = (select public.current_member_id())
  );

drop policy if exists paluwagan_members_all on public.paluwagan_members;
create policy paluwagan_members_all on public.paluwagan_members
  for all to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.paluwagan_groups g where g.id = group_id)
  )
  with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.paluwagan_groups g where g.id = group_id and g.family_id = paluwagan_members.family_id)
  );

drop policy if exists paluwagan_payments_all on public.paluwagan_payments;
create policy paluwagan_payments_all on public.paluwagan_payments
  for all to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.paluwagan_groups g where g.id = group_id)
  )
  with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.paluwagan_groups g where g.id = group_id and g.family_id = paluwagan_payments.family_id)
    and recorded_by = (select public.current_member_id())
  );

do $$
declare
  t text;
begin
  foreach t in array array['utang_entries', 'utang_payments', 'paluwagan_groups', 'paluwagan_members', 'paluwagan_payments'] loop
    execute format('drop trigger if exists require_kin_plus on public.%I', t);
    execute format('create trigger require_kin_plus before insert on public.%I for each row execute function public.require_kin_plus(%L)', t, 'Wealth');
  end loop;
end $$;
