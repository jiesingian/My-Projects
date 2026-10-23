-- Whose an income, an expense or a bill is (Janine, 23 October).
--
-- Cash Flow groups money in and out by household member first -- Janine,
-- Jonathan, a child, or Family (joint) -- then by category, and the Who
-- picker filters by it. Until now a ledger entry was whoever owned the
-- account it moved through, so a salary paid into the joint account read as
-- the family's, and a bill was nobody's. Now each carries its own:
--
--   is_joint = true            -> Family (joint); owner_member_id is null
--   is_joint = false + owner   -> that member's
--
-- A row inserted without saying (a hub posting a cost, a transfer, an
-- import) takes its account's owner -- what it always meant -- or, for a
-- bill, the household's, as bills always were. An owner must be someone in
-- the same household. Existing rows are filled in the same way, once; the
-- app lets anyone change them afterwards.

alter table public.wealth_transactions add column if not exists owner_member_id uuid references public.members(id) on delete set null;
alter table public.wealth_transactions add column if not exists is_joint boolean;
alter table public.bills add column if not exists owner_member_id uuid references public.members(id) on delete set null;
alter table public.bills add column if not exists is_joint boolean;

-- Security invoker: the caller can already read the account they are
-- writing against and their own household's members, which is all this
-- reads. A member of another household is simply not found -- and refused.
create or replace function public.entry_owner_fill()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_joint boolean;
  v_owner uuid;
begin
  if new.is_joint is null then
    if tg_table_name = 'wealth_transactions' then
      select (a.is_joint or a.owner_member_id is null), case when a.is_joint then null else a.owner_member_id end
        into v_joint, v_owner
        from public.accounts a where a.id = new.account_id;
      new.is_joint := coalesce(v_joint, true);
      new.owner_member_id := case when new.is_joint then null else coalesce(new.owner_member_id, v_owner) end;
    else
      new.is_joint := new.owner_member_id is null;
    end if;
  end if;
  if new.is_joint then
    new.owner_member_id := null;
  elsif new.owner_member_id is null then
    raise exception 'An entry that is not the family''s needs a household member as its owner.';
  elsif not exists (select 1 from public.members m where m.id = new.owner_member_id and m.family_id = new.family_id) then
    raise exception 'That person is not in this household.';
  end if;
  return new;
end;
$$;

drop trigger if exists wealth_transactions_owner_fill on public.wealth_transactions;
create trigger wealth_transactions_owner_fill
  before insert or update of owner_member_id, is_joint on public.wealth_transactions
  for each row execute function public.entry_owner_fill();
-- Expected income already says whose it is; it gets the same check that
-- the member named is in the household.
drop trigger if exists income_schedules_owner_check on public.income_schedules;
create trigger income_schedules_owner_check
  before insert or update of owner_member_id, is_joint on public.income_schedules
  for each row execute function public.entry_owner_fill();
drop trigger if exists bills_owner_fill on public.bills;
create trigger bills_owner_fill
  before insert or update of owner_member_id, is_joint on public.bills
  for each row execute function public.entry_owner_fill();

-- Once: what each row always meant. Rows already filled are left alone, so
-- a re-run changes nothing.
update public.wealth_transactions t
   set is_joint = (a.is_joint or a.owner_member_id is null),
       owner_member_id = case when a.is_joint then null else a.owner_member_id end
  from public.accounts a
 where a.id = t.account_id and t.is_joint is null;
update public.bills b
   set is_joint = coalesce(pa.is_joint or pa.owner_member_id is null, true),
       owner_member_id = case when pa.is_joint then null else pa.owner_member_id end
  from public.bills b2
  left join public.accounts pa on pa.id = b2.paid_from_account_id
 where b2.id = b.id and b.is_joint is null;
