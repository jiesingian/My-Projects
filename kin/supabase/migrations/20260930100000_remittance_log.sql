-- The remittance log (Jonathan, 30 September): money a family member abroad
-- sends home.
--
-- One row per padala: what was sent, in what currency, on what day; what the
-- European Central Bank's rate said it was worth in pesos; what actually
-- arrived; who sent it, who got it, through which channel; and, as child
-- rows, what it went to. When it landed in one of the household's accounts,
-- the money-in on that account is a normal wealth_transactions row, and the
-- remittance points at it.
--
-- Two numbers, on purpose. `ecb_rate` is the reference rate Frankfurter
-- serves, which is not what a remittance centre or GCash pays out; the
-- pesos that actually arrived are `php_received`, typed by the person. The
-- difference is the real cost of sending, and it is worth being able to see.
--
-- Who sees it: grown-ups only (a parent or an adult). A row marked private
-- ("Just me") is its recorder's alone. The row-level policies below are the
-- lock; the Wealth tab is already hidden in kid view, which is the courtesy.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

-- 1. A money-in can now name the remittance it came from -------------------
--
-- The same constraint also gains 'assets' and 'events', which the app has
-- been writing for a while (pay against an asset from Money out; an event's
-- expense from its hub) and which neither database's check allowed, so both
-- were being refused. 'trips' stays for rows written before travel became an
-- event.

alter table public.wealth_transactions drop constraint if exists wealth_transactions_source_table_check;
alter table public.wealth_transactions
  add constraint wealth_transactions_source_table_check check (
    source_table is null or source_table = any (array[
      'bills', 'trips', 'events', 'buy_items', 'health_appointments', 'goals',
      'routines', 'income_schedules', 'assets', 'remittances'
    ])
  );

-- 2. The log ---------------------------------------------------------------

create table if not exists public.remittances (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,

  -- Who sent it: a member of the household, or a name for someone who is not
  -- on Kin (a brother in Riyadh who has never opened the app).
  sender_member_id uuid references public.members(id) on delete set null,
  sender_name text,
  receiver_member_id uuid references public.members(id) on delete set null,

  amount numeric(14, 2) not null,
  currency text not null,
  sent_on date not null,

  -- The reference rate on that day, pesos per one unit of `currency`, and
  -- the date the rate is actually for (a Sunday transfer takes Friday's).
  -- 'usd_peg' is a Gulf currency with no ECB rate of its own, converted
  -- through its fixed peg to the dollar. Both null when no rate was found.
  ecb_rate numeric(18, 8),
  ecb_rate_date date,
  rate_source text,

  php_received numeric(14, 2) not null,

  channel text not null,
  channel_name text,

  account_id uuid references public.accounts(id) on delete set null,
  transaction_id uuid references public.wealth_transactions(id) on delete set null,

  note text,
  is_private boolean not null default false,
  recorded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint remittances_amount_positive check (amount > 0),
  constraint remittances_php_received_positive check (php_received > 0),
  constraint remittances_currency_shape check (currency ~ '^[A-Z]{3}$'),
  constraint remittances_rate_positive check (ecb_rate is null or ecb_rate > 0),
  constraint remittances_rate_source_check check (rate_source is null or rate_source in ('ecb', 'usd_peg')),
  constraint remittances_rate_complete check ((ecb_rate is null) = (ecb_rate_date is null) and (ecb_rate is null) = (rate_source is null)),
  constraint remittances_channel_check check (channel in ('bank', 'gcash', 'maya', 'remittance_centre', 'cash', 'other')),
  constraint remittances_sender_named check (sender_member_id is not null or char_length(btrim(coalesce(sender_name, ''))) > 0),
  constraint remittances_sender_name_length check (sender_name is null or char_length(sender_name) <= 120),
  constraint remittances_channel_name_length check (channel_name is null or char_length(channel_name) <= 120),
  constraint remittances_note_length check (note is null or char_length(note) <= 1000)
);

create index if not exists remittances_family_sent_idx on public.remittances (family_id, sent_on desc);
create index if not exists remittances_sender_member_idx on public.remittances (sender_member_id);
create index if not exists remittances_receiver_member_idx on public.remittances (receiver_member_id);
create index if not exists remittances_account_idx on public.remittances (account_id);
create index if not exists remittances_transaction_idx on public.remittances (transaction_id);
create index if not exists remittances_recorded_by_idx on public.remittances (recorded_by);

create table if not exists public.remittance_allocations (
  id uuid primary key default gen_random_uuid(),
  remittance_id uuid not null references public.remittances(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  purpose text not null,
  amount numeric(14, 2) not null,
  category text,
  created_at timestamptz not null default now(),
  constraint remittance_allocations_amount_positive check (amount > 0),
  constraint remittance_allocations_purpose_length check (char_length(btrim(purpose)) between 1 and 80),
  constraint remittance_allocations_category_length check (category is null or char_length(category) <= 60)
);

create index if not exists remittance_allocations_remittance_idx on public.remittance_allocations (remittance_id);
create index if not exists remittance_allocations_family_idx on public.remittance_allocations (family_id);

-- 3. Who may see and change it ---------------------------------------------
--
-- Every clause reads the caller through the existing security-definer
-- helpers, wrapped in a select so each is asked once per statement.

alter table public.remittances enable row level security;
alter table public.remittance_allocations enable row level security;

drop policy if exists remittances_select on public.remittances;
create policy remittances_select on public.remittances
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and (not is_private or recorded_by = (select public.current_member_id()))
  );

-- Writing: the same, plus every id on the row has to be something this
-- grown-up may actually use. The people are this household's. The account is
-- one they can pay into (joint, or their own), and a private remittance
-- lands only in their own account -- a "Just me" padala shown to everyone
-- through a joint account's money-in would not be just them. The money-in,
-- when there is one, is this household's.
drop policy if exists remittances_insert on public.remittances;
create policy remittances_insert on public.remittances
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and recorded_by = (select public.current_member_id())
    and (sender_member_id is null or exists (
      select 1 from public.members m where m.id = sender_member_id and m.family_id = remittances.family_id))
    and (receiver_member_id is null or exists (
      select 1 from public.members m where m.id = receiver_member_id and m.family_id = remittances.family_id))
    and (account_id is null or exists (
      select 1 from public.accounts a
      where a.id = account_id
        and a.family_id = remittances.family_id
        and not a.is_archived
        and (a.owner_member_id = (select public.current_member_id()) or (a.is_joint and not remittances.is_private))))
    and (transaction_id is null or exists (
      select 1 from public.wealth_transactions t where t.id = transaction_id and t.family_id = remittances.family_id))
  );

drop policy if exists remittances_update on public.remittances;
create policy remittances_update on public.remittances
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
    and (sender_member_id is null or exists (
      select 1 from public.members m where m.id = sender_member_id and m.family_id = remittances.family_id))
    and (receiver_member_id is null or exists (
      select 1 from public.members m where m.id = receiver_member_id and m.family_id = remittances.family_id))
    and (account_id is null or exists (
      select 1 from public.accounts a
      where a.id = account_id
        and a.family_id = remittances.family_id
        and (a.owner_member_id = (select public.current_member_id()) or (a.is_joint and not remittances.is_private))))
    and (transaction_id is null or exists (
      select 1 from public.wealth_transactions t where t.id = transaction_id and t.family_id = remittances.family_id))
  );

drop policy if exists remittances_delete on public.remittances;
create policy remittances_delete on public.remittances
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (select public.current_member_role()) in ('parent', 'adult')
    and (not is_private or recorded_by = (select public.current_member_id()))
  );

-- An allocation is visible and changeable exactly when its remittance is:
-- the subquery below runs under the remittances policies above, so a
-- private or grown-ups-only remittance hides its allocations with it.
drop policy if exists remittance_allocations_select on public.remittance_allocations;
create policy remittance_allocations_select on public.remittance_allocations
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.remittances r where r.id = remittance_id)
  );

drop policy if exists remittance_allocations_insert on public.remittance_allocations;
create policy remittance_allocations_insert on public.remittance_allocations
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.remittances r where r.id = remittance_id and r.family_id = remittance_allocations.family_id)
  );

drop policy if exists remittance_allocations_update on public.remittance_allocations;
create policy remittance_allocations_update on public.remittance_allocations
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.remittances r where r.id = remittance_id)
  )
  with check (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.remittances r where r.id = remittance_id and r.family_id = remittance_allocations.family_id)
  );

drop policy if exists remittance_allocations_delete on public.remittance_allocations;
create policy remittance_allocations_delete on public.remittance_allocations
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (select 1 from public.remittances r where r.id = remittance_id)
  );

-- 4. Kin Plus, like the rest of Wealth --------------------------------------

drop trigger if exists require_kin_plus on public.remittances;
create trigger require_kin_plus before insert on public.remittances
  for each row execute function public.require_kin_plus('Wealth');
drop trigger if exists require_kin_plus on public.remittance_allocations;
create trigger require_kin_plus before insert on public.remittance_allocations
  for each row execute function public.require_kin_plus('Wealth');

-- 5. Recording one, all or nothing ------------------------------------------
--
-- The remittance, the money-in on the account it landed in, and what it went
-- to are three tables; a phone losing signal between them would leave a
-- padala with no money-in, or a money-in with no padala. One function, one
-- transaction. SECURITY INVOKER: every insert below runs under the caller's
-- own row-level security, so this can do nothing the caller could not do
-- one statement at a time.

create or replace function public.log_remittance(
  p_sender_member_id uuid,
  p_sender_name text,
  p_receiver_member_id uuid,
  p_amount numeric,
  p_currency text,
  p_sent_on date,
  p_ecb_rate numeric,
  p_ecb_rate_date date,
  p_rate_source text,
  p_php_received numeric,
  p_channel text,
  p_channel_name text,
  p_account_id uuid,
  p_note text,
  p_is_private boolean,
  p_allocations jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_family uuid := public.current_family_id();
  v_me uuid := public.current_member_id();
  v_id uuid := gen_random_uuid();
  v_tx uuid;
  v_sender text;
  v_alloc_total numeric := 0;
  a jsonb;
begin
  if v_family is null or v_me is null then
    raise exception 'not signed in to a household' using errcode = '42501';
  end if;

  if p_allocations is not null and jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'allocations must be a list' using errcode = '22023';
  end if;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into v_alloc_total
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) x;
  if v_alloc_total > p_php_received then
    raise exception 'remittance_over_allocated: what it went to adds up to more than arrived' using errcode = 'P0001';
  end if;

  -- The remittance first, so a refusal on it (a child, a stranger's
  -- account) stops everything before any money moves.
  insert into public.remittances (
    id, family_id, sender_member_id, sender_name, receiver_member_id, amount, currency, sent_on,
    ecb_rate, ecb_rate_date, rate_source, php_received, channel, channel_name, account_id,
    note, is_private, recorded_by
  ) values (
    v_id, v_family, p_sender_member_id, nullif(btrim(p_sender_name), ''), p_receiver_member_id, p_amount, upper(p_currency), p_sent_on,
    p_ecb_rate, p_ecb_rate_date, p_rate_source, p_php_received, p_channel, nullif(btrim(p_channel_name), ''), p_account_id,
    nullif(btrim(p_note), ''), coalesce(p_is_private, false), v_me
  );

  if p_account_id is not null then
    select coalesce(nullif(btrim(p_sender_name), ''), m.full_name, 'abroad')
      into v_sender
      from (select 1) one
      left join public.members m on m.id = p_sender_member_id;
    insert into public.wealth_transactions (
      family_id, account_id, direction, amount, particulars, category, occurred_at, status,
      source_table, source_id, recorded_by
    ) values (
      v_family, p_account_id, 'in', p_php_received,
      left('Remittance from ' || split_part(v_sender, ' ', 1), 150), 'Remittance',
      (p_sent_on::timestamp + time '12:00') at time zone 'Asia/Manila', 'confirmed',
      'remittances', v_id, v_me
    )
    returning id into v_tx;
    update public.remittances set transaction_id = v_tx where id = v_id;
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    insert into public.remittance_allocations (remittance_id, family_id, purpose, amount, category)
    values (v_id, v_family, btrim(a ->> 'purpose'), (a ->> 'amount')::numeric, nullif(btrim(a ->> 'category'), ''));
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.log_remittance(uuid, text, uuid, numeric, text, date, numeric, date, text, numeric, text, text, uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.log_remittance(uuid, text, uuid, numeric, text, date, numeric, date, text, numeric, text, text, uuid, text, boolean, jsonb) to authenticated;

-- Deleting one takes its money-in with it, in the same transaction, for the
-- same reason. Also invoker: a remittance the caller cannot see deletes
-- nothing, and says so.
create or replace function public.delete_remittance(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx uuid;
begin
  delete from public.remittances where id = p_id returning transaction_id into v_tx;
  if not found then
    raise exception 'remittance_not_found' using errcode = 'P0002';
  end if;
  if v_tx is not null then
    delete from public.wealth_transactions where id = v_tx and source_table = 'remittances' and source_id = p_id;
  end if;
end;
$$;

revoke execute on function public.delete_remittance(uuid) from public, anon;
grant execute on function public.delete_remittance(uuid) to authenticated;
