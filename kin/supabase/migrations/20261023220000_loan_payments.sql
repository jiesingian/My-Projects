-- A payment on a loan, split into interest and principal (Janine, 23 October)
-- ==========================================================================
--
-- Until now paying the mortgage was an expense like any other: cash went
-- down by the whole payment and the loan's balance stayed where it was until
-- someone typed a new one, so net worth fell by every peso paid. In any
-- financial statement (and on a bank's own amortisation table) a loan
-- payment is two things: interest, which is a cost, and principal, which
-- only turns cash into less debt.
--
-- A ledger entry can now point at the loan it pays (source_table
-- 'liabilities', source_id the loan) and carry principal_amount, the part
-- that pays the loan down; the rest of the amount is interest. The app
-- works the split out from the loan's rate on its remaining balance (how
-- Philippine banks amortise a housing or car loan) and the person can
-- change it before saving.
--
-- adjust_liability_balance moves a loan's balance by a delta in one
-- statement, so two payments saved at once cannot both read the old
-- balance. It runs as the caller (security invoker): liabilities' own
-- policies decide whose loan can be touched, exactly as an edit to the
-- balance by hand already does.

alter table public.wealth_transactions drop constraint if exists wealth_transactions_source_table_check;
alter table public.wealth_transactions
  add constraint wealth_transactions_source_table_check check (
    source_table is null or source_table = any (array[
      'bills', 'trips', 'events', 'buy_items', 'health_appointments', 'goals',
      'routines', 'income_schedules', 'assets', 'remittances', 'gift_list_items',
      'liabilities'
    ])
  );

alter table public.wealth_transactions add column if not exists principal_amount numeric(14, 2);

alter table public.wealth_transactions drop constraint if exists wealth_transactions_principal_check;
alter table public.wealth_transactions
  add constraint wealth_transactions_principal_check check (
    principal_amount is null
    or (principal_amount >= 0 and principal_amount <= amount and source_table = 'liabilities')
  );

create or replace function public.adjust_liability_balance(p_liability_id uuid, p_delta numeric)
returns numeric
language sql
security invoker
set search_path = ''
as $$
  update public.liabilities
     set balance = greatest(0, balance + p_delta), updated_at = now()
   where id = p_liability_id
     and family_id = (select public.current_family_id())
  returning balance;
$$;

revoke execute on function public.adjust_liability_balance(uuid, numeric) from public, anon;
grant execute on function public.adjust_liability_balance(uuid, numeric) to authenticated;
