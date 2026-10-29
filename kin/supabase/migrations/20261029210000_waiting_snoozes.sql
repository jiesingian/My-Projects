-- "Not now" on "Waiting on you" (Jonathan, 29 October): a flag that needs no
-- doing today -- "No insurance listed", a loan's yearly insurance -- can be
-- put away for 30 days instead of showing every visit. One row per person
-- per item: someone else's list is theirs to keep. Only a member sees, adds
-- and removes their own rows; an item's key is the list's own
-- (lib/queries/waiting.ts), so a key for something since gone matches
-- nothing and does no harm.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.waiting_snoozes (
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  item_key text not null check (length(item_key) between 1 and 120),
  until date not null,
  created_at timestamptz not null default now(),
  primary key (member_id, item_key)
);

create index if not exists waiting_snoozes_family_idx on public.waiting_snoozes (family_id);

alter table public.waiting_snoozes enable row level security;
revoke all on public.waiting_snoozes from public, anon, authenticated;
grant select, insert, delete on public.waiting_snoozes to authenticated;

drop policy if exists waiting_snoozes_select on public.waiting_snoozes;
create policy waiting_snoozes_select on public.waiting_snoozes for select to authenticated
  using (member_id = (select public.current_member_id()));

drop policy if exists waiting_snoozes_insert on public.waiting_snoozes;
create policy waiting_snoozes_insert on public.waiting_snoozes for insert to authenticated
  with check (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
  );

drop policy if exists waiting_snoozes_delete on public.waiting_snoozes;
create policy waiting_snoozes_delete on public.waiting_snoozes for delete to authenticated
  using (member_id = (select public.current_member_id()));
