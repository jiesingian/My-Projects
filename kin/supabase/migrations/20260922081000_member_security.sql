-- A lock on the documents, for the phone that is already unlocked
-- ===============================================================
--
-- WHAT THIS DEFENDS AGAINST, AND WHAT IT CANNOT
--
-- The Documents folder holds passports, birth certificates, insurance. The
-- realistic threat is not an attacker on the network -- it is a handed-over
-- or left-on phone, already signed in to Kin, and somebody idly tapping
-- through. That is what this stops.
--
-- It is not a boundary against the member themselves. They hold the anon
-- key and their own session; anything their account may read, they may read
-- with a fetch call. A second factor cannot change that, and this does not
-- pretend to. It is a door on a room inside a house you already live in.
--
-- WHY TWO TABLES AND NOT A COLUMN ON members
--
-- Both of these hold secrets belonging to one person, and members is
-- readable by the whole household -- correctly, it is how the family screen
-- works. A pin hash on members would be visible to every relative with the
-- anon key. These rows are readable only by the member they belong to, and
-- the policies below say so with current_member_id() rather than
-- current_family_id(). That difference is the entire point of splitting
-- them out, so do not "tidy" them back in.

create table public.member_security (
  member_id uuid primary key references public.members(id) on delete cascade,
  -- scrypt, with a per-member salt. Null until somebody sets one.
  pin_hash text,
  pin_salt text,
  pin_set_at timestamptz,
  -- A phone can be guessed at all afternoon, so the count is kept where the
  -- attacker cannot reach it and the wait is enforced server side.
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  -- What "already unlocked" means. The cookie carries the raw token; only
  -- its hash is here, so reading this table does not let anybody in.
  unlock_token_hash text,
  unlock_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint member_security_pin_paired check (
    (pin_hash is null and pin_salt is null) or (pin_hash is not null and pin_salt is not null)
  ),
  constraint member_security_attempts_sane check (failed_attempts >= 0 and failed_attempts <= 1000)
);

-- One row per authenticator, because a person has a phone and a laptop and
-- should not have to choose. Face ID, a fingerprint and the device's own
-- passcode all arrive here as the same thing: a platform credential that
-- only signs when the device has verified its owner.
create table public.member_webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  -- base64url, as the browser gives it
  credential_id text not null unique,
  -- SPKI DER, base64. Taken from the browser's getPublicKey() so the server
  -- never has to parse CBOR to find it.
  public_key text not null,
  -- COSE algorithm identifier: -7 is ES256, -257 is RS256.
  alg integer not null,
  sign_count bigint not null default 0,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index member_webauthn_credentials_member_id_idx
  on public.member_webauthn_credentials(member_id);

alter table public.member_security enable row level security;
alter table public.member_webauthn_credentials enable row level security;

-- Yours and nobody else's -- not a parent's, not the organiser's. A
-- household that can read each other's unlock secrets has not got a lock.
create policy member_security_select on public.member_security
  for select using (member_id = current_member_id());
create policy member_security_insert on public.member_security
  for insert with check (member_id = current_member_id());
create policy member_security_update on public.member_security
  for update using (member_id = current_member_id())
  with check (member_id = current_member_id());
create policy member_security_delete on public.member_security
  for delete using (member_id = current_member_id());

create policy member_webauthn_credentials_select on public.member_webauthn_credentials
  for select using (member_id = current_member_id());
create policy member_webauthn_credentials_insert on public.member_webauthn_credentials
  for insert with check (member_id = current_member_id());
create policy member_webauthn_credentials_update on public.member_webauthn_credentials
  for update using (member_id = current_member_id())
  with check (member_id = current_member_id());
create policy member_webauthn_credentials_delete on public.member_webauthn_credentials
  for delete using (member_id = current_member_id());
