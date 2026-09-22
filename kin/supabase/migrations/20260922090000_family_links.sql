-- Two households, one memory, and the first hole in the wall
-- ==========================================================
--
-- Every policy in this database until now has been some version of
-- family_id = current_family_id(). That single sentence is what keeps one
-- household's money, health and children out of another's, and it has never
-- had an exception. This adds one, so it is worth being exact about how
-- narrow it is.
--
-- WHAT CROSSES, AND WHAT CANNOT
--
-- Only a journal entry, and only one that somebody deliberately marked
-- shared, and only to a household that both sides agreed to link with.
-- Three independent conditions, all required.
--
-- Nothing else moves, and it is worth being precise about the photographs,
-- because an entry does reference them -- through journal_entry_media -- and
-- an earlier draft of this comment wrongly said it did not.
--
-- They stay behind the wall anyway, in three independent places. The join
-- table journal_entry_media is scoped by its entry's family_id, so the other
-- household cannot even see that a photo is attached. journal_media is
-- scoped by family_id of its own. And the storage bucket is signed with the
-- reader's own session. Any one of those failing would still leave the other
-- two. journal_entry_people is scoped the same way, so the feed does not
-- carry who was tagged either.
--
-- The practical consequence is that a shared entry crosses as its title,
-- its date and its note, and nothing else. That is a real limitation rather
-- than an oversight: sharing photographs of other people's children between
-- households is a much larger decision than sharing the sentence "Mia
-- walked today", and it is not this migration's to make.
--
-- Not milestones, not money, not health, not documents, not members. Those
-- policies are untouched and still say family_id = current_family_id().
--
-- CONSENT IS TWO-SIDED AND REVOCATION IS ONE-SIDED
--
-- A link is requested by one household and has no effect until the other
-- accepts. Either side can revoke it afterwards, alone, with no negotiation
-- -- the asymmetry is deliberate. Revoking stops the sharing in the same
-- instant, in both directions, because the policy reads the link's status
-- rather than copying anything.
--
-- WHY THE WRITES GO THROUGH FUNCTIONS
--
-- Requesting a link means writing a row that names a household you cannot
-- see, and accepting one means writing a row you did not create. Neither is
-- expressible in a policy without making families readable across the
-- wall, which would leak the existence and name of every household. The
-- three functions below are security definer and each one re-checks the
-- caller's own membership first.

create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  requester_family_id uuid not null references public.families(id) on delete cascade,
  addressee_family_id uuid not null references public.families(id) on delete cascade,
  status text not null default 'pending',
  requested_by uuid references public.members(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.members(id) on delete set null,
  decided_at timestamptz,
  constraint family_links_status_check check (status in ('pending', 'accepted', 'revoked')),
  constraint family_links_not_self check (requester_family_id <> addressee_family_id)
);

-- One live link per pair, in whichever order it was made. A revoked one is
-- kept as history and does not block asking again.
create unique index family_links_pair_live_idx
  on public.family_links (least(requester_family_id, addressee_family_id), greatest(requester_family_id, addressee_family_id))
  where status in ('pending', 'accepted');

create index family_links_requester_idx on public.family_links(requester_family_id);
create index family_links_addressee_idx on public.family_links(addressee_family_id);

-- Null means private, which is the default and the safe direction: an entry
-- that existed before this migration, or one written without thinking about
-- it, is not shared.
alter table public.journal_entries add column if not exists shared_at timestamptz;

create index journal_entries_shared_idx
  on public.journal_entries (family_id, entry_date desc) where shared_at is not null;

-- Is there a live, accepted link between these two households? Security
-- definer because family_links is only readable from one side at a time and
-- this has to answer from either.
create or replace function public.families_are_linked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.family_links l
    where l.status = 'accepted'
      and ((l.requester_family_id = a and l.addressee_family_id = b)
        or (l.requester_family_id = b and l.addressee_family_id = a))
  );
$$;

alter table public.family_links enable row level security;

-- You can see a link your household is on either end of, and nothing else.
create policy family_links_select on public.family_links
  for select using (
    requester_family_id = current_family_id() or addressee_family_id = current_family_id()
  );

-- Every write goes through the functions below, so there is deliberately no
-- insert, update or delete policy here. A household cannot hand-write a link
-- to itself from another family and call it accepted.

-- The one exception to family_id = current_family_id(), stated as narrowly
-- as it can be: a shared entry, from a household we are linked to.
drop policy if exists journal_entries_select_linked on public.journal_entries;
create policy journal_entries_select_linked on public.journal_entries
  for select using (
    shared_at is not null
    and family_id <> current_family_id()
    and public.families_are_linked(family_id, current_family_id())
  );

-- Ask to link, using the other household's invite code. Knowing the code is
-- not enough on its own -- it produces a request, and the other side has to
-- say yes. Anyone holding that code could already join the household
-- outright, so this is strictly the weaker capability.
create or replace function public.request_family_link(code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me_family uuid;
  me_member uuid;
  target uuid;
  existing uuid;
begin
  select family_id, id into me_family, me_member
    from public.members where auth_user_id = auth.uid() and status = 'active' limit 1;
  if me_family is null then raise exception 'Not a member of any household.'; end if;

  select id into target from public.families where invite_code = upper(trim(code));
  if target is null then raise exception 'No household has that code.'; end if;
  if target = me_family then raise exception 'That is your own household.'; end if;

  select id into existing from public.family_links
   where status in ('pending','accepted')
     and ((requester_family_id = me_family and addressee_family_id = target)
       or (requester_family_id = target and addressee_family_id = me_family));
  if existing is not null then return existing; end if;

  insert into public.family_links (requester_family_id, addressee_family_id, requested_by)
  values (me_family, target, me_member)
  returning id into existing;
  return existing;
end;
$$;

-- Answer a request. Only the household that was asked may accept it --
-- otherwise a requester could accept on the other's behalf, which would
-- make the two-sided consent decorative.
create or replace function public.respond_family_link(link_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me_family uuid;
  me_member uuid;
  me_role text;
  row_addressee uuid;
begin
  select family_id, id, role into me_family, me_member, me_role
    from public.members where auth_user_id = auth.uid() and status = 'active' limit 1;
  if me_family is null then raise exception 'Not a member of any household.'; end if;
  if me_role not in ('parent','adult') then raise exception 'Only a parent or another adult can answer this.'; end if;

  select addressee_family_id into row_addressee
    from public.family_links where id = link_id and status = 'pending';
  if row_addressee is null then raise exception 'That request is no longer open.'; end if;
  if row_addressee <> me_family then raise exception 'That request was not made to your household.'; end if;

  update public.family_links
     set status = case when accept then 'accepted' else 'revoked' end,
         decided_by = me_member, decided_at = now()
   where id = link_id;
end;
$$;

-- Either side, alone, at any time.
create or replace function public.revoke_family_link(link_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me_family uuid;
  me_member uuid;
  me_role text;
  found int;
begin
  select family_id, id, role into me_family, me_member, me_role
    from public.members where auth_user_id = auth.uid() and status = 'active' limit 1;
  if me_family is null then raise exception 'Not a member of any household.'; end if;
  if me_role not in ('parent','adult') then raise exception 'Only a parent or another adult can do that.'; end if;

  update public.family_links
     set status = 'revoked', decided_by = me_member, decided_at = now()
   where id = link_id
     and status in ('pending','accepted')
     and (requester_family_id = me_family or addressee_family_id = me_family);
  get diagnostics found = row_count;
  if found = 0 then raise exception 'That link is not yours to change.'; end if;
end;
$$;

revoke all on function public.request_family_link(text) from public;
revoke all on function public.respond_family_link(uuid, boolean) from public;
revoke all on function public.revoke_family_link(uuid) from public;
grant execute on function public.request_family_link(text) to authenticated;
grant execute on function public.respond_family_link(uuid, boolean) to authenticated;
grant execute on function public.revoke_family_link(uuid) to authenticated;
