-- Passwords and codes a household shares: the Wi-Fi, the smart door lock, the
-- gate, a streaming login. Kept under Family > Quick Links, in groups.
--
-- Not sign-in credentials. Nobody's Kin password is ever here -- those belong
-- to Supabase Auth and are never visible to anybody, including us. This is
-- the card on the fridge with the Wi-Fi password, made harder to photograph.
--
-- Each item is either for everyone in the house or for grown-ups only, and
-- that is enforced here, not in the page: the Wi-Fi is for the kids too; the
-- bank's app is not. Only grown-ups add, change or remove items.
--
-- What protects a secret, stated plainly: row-level security keeps it inside
-- the household and away from children where marked; Supabase encrypts it at
-- rest; and the page only renders it after the same PIN or fingerprint lock
-- that guards Documents. That last one is a screen lock, not encryption --
-- the same honest limit Documents has.

create table if not exists public.family_vault_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  group_name text not null,
  label text not null,
  username text,
  secret text not null,
  note text,
  visibility text not null default 'everyone',
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_vault_items_visibility check (visibility in ('everyone', 'grown_ups')),
  constraint family_vault_items_group_length check (char_length(btrim(group_name)) between 1 and 40),
  constraint family_vault_items_label_length check (char_length(btrim(label)) between 1 and 80),
  constraint family_vault_items_username_length check (username is null or char_length(username) <= 200),
  constraint family_vault_items_secret_length check (char_length(secret) between 1 and 500),
  constraint family_vault_items_note_length check (note is null or char_length(note) <= 500)
);

create index if not exists family_vault_items_family_idx on public.family_vault_items (family_id, group_name, label);

alter table public.family_vault_items enable row level security;

-- Read: the household, and of the grown-ups-only items, only grown-ups.
drop policy if exists family_vault_items_select on public.family_vault_items;
create policy family_vault_items_select on public.family_vault_items
  for select using (
    family_id = current_family_id()
    and (visibility = 'everyone' or current_member_role() in ('parent', 'adult'))
  );

-- Write: grown-ups only. A child can read the Wi-Fi password and cannot
-- change it -- or mark something as theirs to see.
drop policy if exists family_vault_items_insert on public.family_vault_items;
create policy family_vault_items_insert on public.family_vault_items
  for insert with check (family_id = current_family_id() and current_member_role() in ('parent', 'adult'));

drop policy if exists family_vault_items_update on public.family_vault_items;
create policy family_vault_items_update on public.family_vault_items
  for update
  using (family_id = current_family_id() and current_member_role() in ('parent', 'adult'))
  with check (family_id = current_family_id() and current_member_role() in ('parent', 'adult'));

drop policy if exists family_vault_items_delete on public.family_vault_items;
create policy family_vault_items_delete on public.family_vault_items
  for delete using (family_id = current_family_id() and current_member_role() in ('parent', 'adult'));
