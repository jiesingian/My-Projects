-- Home upkeep (Jonathan, 29 October): the things a home owns need looking
-- after, and their warranties run out without anyone noticing. Each item in
-- an asset's breakdown (the aircon, the water filter, the ref) can now say
-- how often it is serviced, when it last was, and when its warranty ends.
-- Today reminds when a service is due and the week before a warranty ends.
--
-- Plain columns on asset_items: its existing row-level policies already
-- decide who reads and changes an item, and these follow them.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

alter table public.asset_items add column if not exists warranty_until date;
alter table public.asset_items add column if not exists service_every_months smallint;
alter table public.asset_items add column if not exists last_serviced_on date;

alter table public.asset_items drop constraint if exists asset_items_service_every_months_range;
alter table public.asset_items add constraint asset_items_service_every_months_range
  check (service_every_months is null or service_every_months between 1 and 60);
