-- Allowance and alkansya, in pesos (the 14 October "What's Left" review, item 1)
-- ============================================================================
--
-- WHAT IT IS
--
-- A child's weekly baon on its own schedule, chore points changed into pesos
-- at a rate a grown-up sets, and the money split three ways: gastos (to
-- spend), ipon (to save, which a grown-up may add "interest" to) and bigay
-- (to give). Like Greenlight's spend/save/give, adapted for a Filipino home.
--
-- It is a LEDGER OF CASH KEPT AT HOME. It moves no real money, touches no
-- bank and no Wealth account, and the screens say so. That is also why it is
-- Kin Free: it is part of chores and rewards, not of Wealth.
--
-- TWO TABLES
--
--   alkansya_plans    one row per child: the weekly amount and its payday,
--                     the split, what a point is worth, the interest rate.
--   alkansya_entries  the ledger. One row per jar per thing that happened.
--                     A balance is summed from it, never stored -- the same
--                     rule as points (20260922053456): a running total kept
--                     beside the rows it comes from is a second copy of one
--                     fact, and the first edit makes them disagree.
--
-- WHO SEES IT, AND WHO WRITES IT
--
-- Grown-ups (parent, adult) of the household see every child's alkansya and
-- are the only ones who write to it: it is their record of the cash they
-- hand over and keep. A child sees their own and nobody else's -- a
-- sibling's savings are not theirs to compare -- and writes nothing, so a
-- child with the anon key and their own session cannot give themselves a
-- raise (the reason rewards is locked the same way). A linked household or
-- a stranger sees nothing.
--
-- THE BAON PAYS ITSELF
--
-- alkansya_pay_allowances() writes each payday's baon that has come round
-- since the plan last paid (paid_through), split across the jars. The app
-- calls it before it reads the jars, so nothing needs a scheduled job and a
-- week nobody opened the app is still paid. It is security definer because a
-- child opening their own jars has to be able to bring them up to date; it
-- only ever writes what the household's own plan says is due, up to today
-- in the household's time zone, so calling it gains nobody anything.
--
-- Points changed into pesos are counted against what a child can spend on
-- rewards: alkansya_points_used() hands the planner each member's total --
-- a count of points, which the household already sees on the scoreboard --
-- without handing a child their siblings' peso rows.

create table if not exists public.alkansya_plans (
  member_id uuid primary key references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  weekly_amount numeric(10, 2) not null default 0,
  -- 0 = Sunday ... 6 = Saturday, as extract(dow) counts them.
  pay_weekday smallint not null default 1,
  gastos_pct smallint not null default 70,
  ipon_pct smallint not null default 20,
  bigay_pct smallint not null default 10,
  -- Pesos for one chore point. 0 = points are not changed into pesos.
  peso_per_point numeric(8, 2) not null default 0,
  -- What "Add interest" adds to ipon, as a percent of what ipon holds.
  interest_pct numeric(5, 2) not null default 0,
  active boolean not null default true,
  -- The last household day whose baon has been written. Set by the trigger
  -- below; a payday after it and up to today is due.
  paid_through date,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alkansya_plans_weekly_sane check (weekly_amount >= 0 and weekly_amount <= 100000),
  constraint alkansya_plans_weekday check (pay_weekday between 0 and 6),
  constraint alkansya_plans_split check (
    gastos_pct between 0 and 100 and ipon_pct between 0 and 100 and bigay_pct between 0 and 100
    and gastos_pct + ipon_pct + bigay_pct = 100
  ),
  constraint alkansya_plans_rate_sane check (peso_per_point >= 0 and peso_per_point <= 1000),
  constraint alkansya_plans_interest_sane check (interest_pct >= 0 and interest_pct <= 100)
);

create index if not exists alkansya_plans_family_idx on public.alkansya_plans (family_id);
create index if not exists alkansya_plans_created_by_idx on public.alkansya_plans (created_by);

create table if not exists public.alkansya_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  jar text not null,
  -- allowance  the weekly baon (written by alkansya_pay_allowances)
  -- points     chore points changed into pesos
  -- interest   a grown-up's "interest" on ipon
  -- deposit    money added by hand -- a pamasko from Lola, a birthday
  -- spend      taken out of gastos or ipon and spent
  -- give       taken out of bigay and given
  kind text not null,
  -- Signed: money in is positive, money out negative.
  amount numeric(10, 2) not null,
  -- For kind 'points': how many points this changed into pesos. One
  -- conversion writes a row per jar; the points sit on one of them.
  points integer not null default 0,
  note text,
  occurred_on date not null default current_date,
  recorded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint alkansya_entries_jar check (jar in ('gastos', 'ipon', 'bigay')),
  constraint alkansya_entries_kind check (kind in ('allowance', 'points', 'interest', 'deposit', 'spend', 'give')),
  constraint alkansya_entries_amount_sane check (amount <> 0 and abs(amount) <= 100000),
  constraint alkansya_entries_sign check (
    (kind in ('allowance', 'points', 'interest', 'deposit') and amount > 0)
    or (kind in ('spend', 'give') and amount < 0)
  ),
  constraint alkansya_entries_points check (points >= 0 and (kind = 'points' or points = 0)),
  constraint alkansya_entries_interest_jar check (kind <> 'interest' or jar = 'ipon'),
  constraint alkansya_entries_give_jar check (kind <> 'give' or jar = 'bigay'),
  constraint alkansya_entries_spend_jar check (kind <> 'spend' or jar in ('gastos', 'ipon')),
  constraint alkansya_entries_note_length check (note is null or char_length(note) <= 200)
);

create index if not exists alkansya_entries_member_idx on public.alkansya_entries (member_id, occurred_on desc);
create index if not exists alkansya_entries_family_idx on public.alkansya_entries (family_id);
create index if not exists alkansya_entries_recorded_by_idx on public.alkansya_entries (recorded_by);

alter table public.alkansya_plans enable row level security;
alter table public.alkansya_entries enable row level security;

-- Is this member a child of the caller's household? Through a definer
-- helper so the policies below do not depend on members' own policies.
create or replace function public.is_child_of_my_household(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.id = p_member
      and m.family_id = public.current_family_id()
      and m.role in ('child_managed', 'child_self')
  );
$$;

revoke execute on function public.is_child_of_my_household(uuid) from public, anon;
grant execute on function public.is_child_of_my_household(uuid) to authenticated;

drop policy if exists alkansya_plans_select on public.alkansya_plans;
create policy alkansya_plans_select on public.alkansya_plans
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and ((select public.current_member_role()) in ('parent', 'adult') or member_id = (select public.current_member_id()))
  );

drop policy if exists alkansya_plans_insert on public.alkansya_plans;
create policy alkansya_plans_insert on public.alkansya_plans
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and public.is_child_of_my_household(member_id)
    and created_by = (select public.current_member_id())
  );

drop policy if exists alkansya_plans_update on public.alkansya_plans;
create policy alkansya_plans_update on public.alkansya_plans
  for update to authenticated
  using (family_id = (select public.current_family_id()) and (select public.current_member_role()) in ('parent', 'adult'))
  with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and public.is_child_of_my_household(member_id)
  );

drop policy if exists alkansya_entries_select on public.alkansya_entries;
create policy alkansya_entries_select on public.alkansya_entries
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and ((select public.current_member_role()) in ('parent', 'adult') or member_id = (select public.current_member_id()))
  );

drop policy if exists alkansya_entries_insert on public.alkansya_entries;
create policy alkansya_entries_insert on public.alkansya_entries
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and public.is_child_of_my_household(member_id)
    and recorded_by = (select public.current_member_id())
    -- The baon is the plan's to write, through alkansya_pay_allowances().
    and kind <> 'allowance'
  );

-- No update: a mistake is taken off and written again, so the ledger never
-- says something different from what it said yesterday without a trace of
-- why. A grown-up may take an entry off.
drop policy if exists alkansya_entries_delete on public.alkansya_entries;
create policy alkansya_entries_delete on public.alkansya_entries
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
  );

-- The household's day, in its own time zone.
create or replace function public.alkansya_household_today(p_family uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select f.time_zone from public.families f where f.id = p_family), 'Asia/Manila'))::date;
$$;

revoke execute on function public.alkansya_household_today(uuid) from public, anon, authenticated;

-- A new plan, or one switched back on, starts paying from today: no back
-- pay for the weeks before it existed or while it was off. Only
-- alkansya_pay_allowances() moves paid_through on after that.
create or replace function public.alkansya_plans_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' or (new.active and not old.active) then
    new.paid_through := public.alkansya_household_today(new.family_id) - 1;
  elsif coalesce(current_setting('kin.alkansya_paying', true), 'off') <> 'on' then
    new.paid_through := old.paid_through;
  end if;
  return new;
end;
$$;

revoke execute on function public.alkansya_plans_start() from public, anon, authenticated;

drop trigger if exists alkansya_plans_start on public.alkansya_plans;
create trigger alkansya_plans_start
  before insert or update on public.alkansya_plans
  for each row execute function public.alkansya_plans_start();

-- A jar cannot go below nothing. Checked under a lock on the child so two
-- grown-ups taking money out at once cannot both take the last peso.
create or replace function public.alkansya_entries_not_overdrawn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
begin
  if new.amount >= 0 then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('alkansya:' || new.member_id::text));
  select coalesce(sum(e.amount), 0) into v_balance
    from public.alkansya_entries e
    where e.member_id = new.member_id and e.jar = new.jar;
  if v_balance + new.amount < 0 then
    raise exception 'alkansya_not_enough: there is only % in %', v_balance, new.jar
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.alkansya_entries_not_overdrawn() from public, anon, authenticated;

drop trigger if exists alkansya_entries_not_overdrawn on public.alkansya_entries;
create trigger alkansya_entries_not_overdrawn
  before insert on public.alkansya_entries
  for each row execute function public.alkansya_entries_not_overdrawn();

-- Write every baon that is due in the caller's household, and return how
-- many paydays were paid. At most twelve weeks are caught up at once.
create or replace function public.alkansya_pay_allowances()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid := public.current_family_id();
  v_today date;
  v_paid integer := 0;
  p public.alkansya_plans%rowtype;
  d date;
  v_ipon numeric;
  v_bigay numeric;
begin
  if v_family is null then
    return 0;
  end if;
  v_today := public.alkansya_household_today(v_family);
  for p in
    select * from public.alkansya_plans
    where family_id = v_family and active and coalesce(paid_through, v_today) < v_today
    for update
  loop
    if p.weekly_amount > 0 then
      for d in
        select gs::date from generate_series(greatest(p.paid_through + 1, v_today - 84), v_today, interval '1 day') gs
        where extract(dow from gs)::int = p.pay_weekday
      loop
        v_ipon := round(p.weekly_amount * p.ipon_pct / 100.0, 2);
        v_bigay := round(p.weekly_amount * p.bigay_pct / 100.0, 2);
        insert into public.alkansya_entries (family_id, member_id, jar, kind, amount, occurred_on, note)
        select v_family, p.member_id, j.jar, 'allowance', j.amount, d, 'Weekly baon'
        from (values ('gastos', p.weekly_amount - v_ipon - v_bigay), ('ipon', v_ipon), ('bigay', v_bigay)) as j(jar, amount)
        where j.amount > 0;
        v_paid := v_paid + 1;
      end loop;
    end if;
    -- The plans trigger keeps paid_through unless this flag says it is us.
    perform set_config('kin.alkansya_paying', 'on', true);
    update public.alkansya_plans set paid_through = v_today where member_id = p.member_id;
    perform set_config('kin.alkansya_paying', 'off', true);
  end loop;
  return v_paid;
end;
$$;

revoke execute on function public.alkansya_pay_allowances() from public, anon;
grant execute on function public.alkansya_pay_allowances() to authenticated;


-- Points each member has changed into pesos, for the planner's "to spend".
create or replace function public.alkansya_points_used()
returns table (member_id uuid, points bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.member_id, sum(e.points)::bigint
  from public.alkansya_entries e
  where e.family_id = public.current_family_id() and e.points > 0
  group by e.member_id;
$$;

revoke execute on function public.alkansya_points_used() from public, anon;
grant execute on function public.alkansya_points_used() to authenticated;
