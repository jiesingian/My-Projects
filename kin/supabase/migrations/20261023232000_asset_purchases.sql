-- Money spent on an asset: buying it, adding to it, or keeping it up
-- (Janine, 23 October)
-- ===================================================================
--
-- Money recorded "for" an asset was always an expense. In a financial
-- statement it is one of three things:
--
--   buying it      a down payment, or paying for it outright: the asset's
--                  value is already on record, so this only moves cash into
--                  it -- not a living cost, net worth unchanged;
--   adding to it   a renovation, an appliance, an upgrade: the asset is now
--                  worth more by what it cost, so it becomes one of the
--                  asset's items (asset_items, 20261012190000);
--   upkeep         repairs, dues, insurance: an ordinary expense.
--
-- wealth_transactions.capital marks the first two (only on money tied to an
-- asset), so statements can leave them out of living costs.
-- asset_items.transaction_id ties an item added this way to the payment
-- that bought it: delete the payment and the item goes with it, so the
-- asset's value never keeps something nobody paid for.

alter table public.wealth_transactions add column if not exists capital boolean not null default false;

alter table public.wealth_transactions drop constraint if exists wealth_transactions_capital_check;
alter table public.wealth_transactions
  -- coalesce: with no source_table the comparison is null, and a check
  -- passes on null.
  add constraint wealth_transactions_capital_check check (not capital or coalesce(source_table = 'assets', false));

alter table public.asset_items add column if not exists transaction_id uuid references public.wealth_transactions(id) on delete cascade;
create index if not exists asset_items_transaction_idx on public.asset_items (transaction_id);
