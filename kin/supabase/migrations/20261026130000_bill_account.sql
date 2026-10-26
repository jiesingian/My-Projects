-- Which account an expense comes out of (Jonathan, 26 October).
--
-- Add expense names what it is for, how much, whose and when -- but not
-- which account it will be taken from. That was only asked at Settle, so a
-- household with a BDO, a GCash and a Maya had to remember each time which
-- one Meralco goes out of. Now a bill can carry its account from the start:
--
--   account_id            -> the account it is to be paid from, chosen when
--                            the expense is added (or left for later)
--   paid_from_account_id  -> the one it was in fact paid from, set by the
--                            settlement; unchanged here
--
-- Settle preselects account_id. The account has to be one of the same
-- household's; the app only offers the member's own and joint ones, but the
-- check lives here so a forged id never ties a bill to another family's
-- account. An account deleted outright lets go of its bills (set null).

alter table public.bills add column if not exists account_id uuid references public.accounts(id) on delete set null;
create index if not exists bills_account_idx on public.bills (account_id);

-- Security invoker: the caller can already read their own household's
-- accounts, which is all this reads. Another household's account is simply
-- not found -- and refused.
create or replace function public.bill_account_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_id is not null
     and not exists (select 1 from public.accounts a where a.id = new.account_id and a.family_id = new.family_id) then
    raise exception 'That account is not this household''s.';
  end if;
  return new;
end;
$$;

drop trigger if exists bills_account_check on public.bills;
create trigger bills_account_check
  before insert or update of account_id on public.bills
  for each row execute function public.bill_account_check();
