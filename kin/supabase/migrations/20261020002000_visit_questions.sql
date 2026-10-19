-- Questions for the doctor (Kin Free, approved 19 October)
-- ========================================================
--
-- The doctor-visit sheet (/family/members/<id>/visit-sheet) gathers what a
-- doctor asks about -- medicines and doses, allergies, recent readings,
-- recent illnesses, a child's vaccines -- onto one page to print or share.
-- The one thing on it that is not already somewhere in Health is the
-- family's list of questions to ask, kept here per person so it carries
-- from one visit to the next until it is ticked off.
--
-- WHO
--
-- The household's grown-ups, and the person themself. Another child in the
-- household sees nothing: a sibling's questions for the doctor are not
-- theirs to read. Kid view is kept off the page by the app as well.
--
-- No Kin Plus trigger: this is Kin Free.

create table if not exists public.health_visit_questions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  body text not null,
  done boolean not null default false,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint health_visit_questions_body_length check (char_length(btrim(body)) between 1 and 300)
);

create index if not exists health_visit_questions_member_idx on public.health_visit_questions (member_id, created_at);
create index if not exists health_visit_questions_created_by_idx on public.health_visit_questions (created_by);
create index if not exists health_visit_questions_family_idx on public.health_visit_questions (family_id);

alter table public.health_visit_questions enable row level security;

drop policy if exists health_visit_questions_select on public.health_visit_questions;
create policy health_visit_questions_select on public.health_visit_questions
  for select to authenticated using (
    family_id = (select public.current_family_id())
    and ((select public.current_member_role()) in ('parent', 'adult') or member_id = (select public.current_member_id()))
  );

drop policy if exists health_visit_questions_insert on public.health_visit_questions;
create policy health_visit_questions_insert on public.health_visit_questions
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and ((select public.current_member_role()) in ('parent', 'adult') or member_id = (select public.current_member_id()))
    and exists (select 1 from public.members m where m.id = member_id and m.family_id = (select public.current_family_id()))
  );

drop policy if exists health_visit_questions_update on public.health_visit_questions;
create policy health_visit_questions_update on public.health_visit_questions
  for update to authenticated
  using (
    family_id = (select public.current_family_id())
    and ((select public.current_member_role()) in ('parent', 'adult') or member_id = (select public.current_member_id()))
  )
  with check (
    family_id = (select public.current_family_id())
    and ((select public.current_member_role()) in ('parent', 'adult') or member_id = (select public.current_member_id()))
    and exists (select 1 from public.members m where m.id = member_id and m.family_id = (select public.current_family_id()))
  );

drop policy if exists health_visit_questions_delete on public.health_visit_questions;
create policy health_visit_questions_delete on public.health_visit_questions
  for delete to authenticated using (
    family_id = (select public.current_family_id())
    and ((select public.current_member_role()) in ('parent', 'adult') or member_id = (select public.current_member_id()))
  );

revoke all on public.health_visit_questions from anon;
