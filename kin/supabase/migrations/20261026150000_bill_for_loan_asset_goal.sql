-- What a bill is for (Jonathan, 26 October): a loan it pays down, an asset
-- it keeps up, a goal it puts money into.
--
-- An expense already paid can say what it was for since the Add expense
-- redesign (#996): a loan payment lowers the loan, upkeep sits on the
-- asset, a contribution counts toward the goal. A bill -- the same money,
-- due later -- could not, so a car loan's amortisation added as a monthly
-- bill never paid the loan down when settled. Now a bill carries it:
--
--   against_table   'liabilities' | 'assets' | 'goals'
--   against_id      the row's id in that table
--
-- Both or neither. Settle then records the payment with that as its source
-- (as Move money does), and the bill is tied to the payment by
-- transaction_id. The target has to be the same household's; the check
-- lives here so a forged id never ties a bill to another family's loan.
-- A loan, asset or goal deleted lets go of its bills.

alter table public.bills add column if not exists against_table text;
alter table public.bills add column if not exists against_id uuid;
alter table public.bills drop constraint if exists bills_against_table_check;
alter table public.bills add constraint bills_against_table_check check (against_table is null or against_table in ('liabilities', 'assets', 'goals'));
alter table public.bills drop constraint if exists bills_against_pair_check;
alter table public.bills add constraint bills_against_pair_check check ((against_table is null) = (against_id is null));
create index if not exists bills_against_idx on public.bills (against_table, against_id);
-- The payment a bill is tied to, looked up from the ledger side on settle,
-- reopen and edit.
create index if not exists bills_transaction_idx on public.bills (transaction_id);

-- Security invoker: the caller can already read their own household's
-- loans, assets and goals, which is all this reads. Another household's
-- row is simply not found -- and refused.
create or replace function public.bill_against_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if new.against_table is null then
    return new;
  end if;
  execute format('select exists (select 1 from public.%I t where t.id = $1 and t.family_id = $2)', new.against_table)
    into v_ok using new.against_id, new.family_id;
  if not v_ok then
    raise exception 'That is not this household''s.';
  end if;
  return new;
end;
$$;

drop trigger if exists bills_against_check on public.bills;
create trigger bills_against_check
  before insert or update of against_table, against_id on public.bills
  for each row execute function public.bill_against_check();

-- A loan paid off and removed, an asset sold, a goal reached and deleted:
-- the bills for it stay, just no longer for anything in particular.
create or replace function public.bill_against_release()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.bills set against_table = null, against_id = null
   where against_table = tg_table_name and against_id = old.id;
  return old;
end;
$$;

drop trigger if exists bills_against_release on public.liabilities;
create trigger bills_against_release after delete on public.liabilities
  for each row execute function public.bill_against_release();
drop trigger if exists bills_against_release on public.assets;
create trigger bills_against_release after delete on public.assets
  for each row execute function public.bill_against_release();
drop trigger if exists bills_against_release on public.goals;
create trigger bills_against_release after delete on public.goals
  for each row execute function public.bill_against_release();
