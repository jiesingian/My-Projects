-- A QR code on a bank account or e-wallet (Janine, 27 October)
-- =============================================================
--
-- WHAT IT IS
--
-- The QR a bank or GCash gives to receive money (InstaPay/QR Ph), uploaded
-- once and shown full-screen from the account's page for someone to scan
-- and pay in. One per account; the image itself, made small on the phone
-- before upload, kept as a data URL.
--
-- WHY A TABLE OF ITS OWN, AND THE IMAGE IN IT
--
-- Like account_numbers (20261002100000), and for the same reasons: it is
-- read only where it is shown, never with every account row, and who sees
-- it is the number's rule. Keeping the image in the row rather than in
-- Storage means that one row-level policy is the whole of who can see it;
-- a Storage object would need a second set of policies to say the same.
-- A QR is a few dozen kilobytes once made small; the check holds it under
-- 400 KB of text.
--
-- WHO SEES IT -- the account number's rule:
--   * the account's owner, always;
--   * on a joint account, or a personal one that is not private, the
--     household's grown-ups -- not its children;
--   * nobody else.
-- WHO SETS IT: the owner of a personal account; any grown-up on a joint one.
--
-- Gone with its account (on delete cascade).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.account_qr_codes (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  image text not null,
  updated_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint account_qr_codes_image_shape check (image ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(image) <= 400000)
);

create index if not exists account_qr_codes_family_idx on public.account_qr_codes (family_id);
create index if not exists account_qr_codes_updated_by_idx on public.account_qr_codes (updated_by);

alter table public.account_qr_codes enable row level security;

drop policy if exists account_qr_codes_select on public.account_qr_codes;
create policy account_qr_codes_select on public.account_qr_codes
  for select to authenticated
  using (
    family_id = (select public.current_family_id())
    and exists (
      select 1 from public.accounts a
      where a.id = account_qr_codes.account_id
        and a.family_id = account_qr_codes.family_id
        and (
          a.owner_member_id = (select public.current_member_id())
          or ((a.is_joint or not a.is_private) and (select public.current_member_role()) in ('parent', 'adult'))
        )
    )
  );

-- Who may write one for this account: its owner, or a grown-up on a joint one.
create or replace function public.can_set_account_qr(p_account uuid, p_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_family = (select public.current_family_id())
    and exists (
      select 1 from public.accounts a
      where a.id = p_account and a.family_id = p_family
        and (
          (not a.is_joint and a.owner_member_id = (select public.current_member_id()))
          or (a.is_joint and (select public.current_member_role()) in ('parent', 'adult'))
        )
    );
$$;

revoke execute on function public.can_set_account_qr(uuid, uuid) from public, anon;
grant execute on function public.can_set_account_qr(uuid, uuid) to authenticated;

drop policy if exists account_qr_codes_insert on public.account_qr_codes;
create policy account_qr_codes_insert on public.account_qr_codes
  for insert to authenticated
  with check (updated_by = (select public.current_member_id()) and public.can_set_account_qr(account_id, family_id));

drop policy if exists account_qr_codes_update on public.account_qr_codes;
create policy account_qr_codes_update on public.account_qr_codes
  for update to authenticated
  using (public.can_set_account_qr(account_id, family_id))
  with check (updated_by = (select public.current_member_id()) and public.can_set_account_qr(account_id, family_id));

drop policy if exists account_qr_codes_delete on public.account_qr_codes;
create policy account_qr_codes_delete on public.account_qr_codes
  for delete to authenticated
  using (public.can_set_account_qr(account_id, family_id));

revoke all on public.account_qr_codes from anon;
grant select, insert, update, delete on public.account_qr_codes to authenticated;
