-- "What should Kin do next?" (Jonathan, 29 October): one question on Today
-- for each grown-up, so the next features are ranked by the families who
-- use Kin rather than guessed. One answer per person, changeable; an
-- optional note for "something else".
--
-- A member writes and reads only their own answer. Nobody in the app reads
-- anyone else's: the tally is read by the people who build Kin, from the
-- database, in aggregate.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.feature_votes (
  member_id uuid primary key references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  choice text not null check (choice in ('live_alerts', 'phone_app', 'group_calls', 'school_more', 'other')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_votes_choice_idx on public.feature_votes (choice);

alter table public.feature_votes enable row level security;
revoke all on public.feature_votes from public, anon, authenticated;
grant select, insert, update on public.feature_votes to authenticated;

drop policy if exists feature_votes_select on public.feature_votes;
create policy feature_votes_select on public.feature_votes for select to authenticated
  using (member_id = (select public.current_member_id()));

drop policy if exists feature_votes_insert on public.feature_votes;
create policy feature_votes_insert on public.feature_votes for insert to authenticated
  with check (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
  );

drop policy if exists feature_votes_update on public.feature_votes;
create policy feature_votes_update on public.feature_votes for update to authenticated
  using (member_id = (select public.current_member_id()))
  with check (
    member_id = (select public.current_member_id())
    and family_id = (select public.current_family_id())
  );
