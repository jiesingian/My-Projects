-- The journal in three layers (approved by Jonathan, 28 September, BACKLOG
-- item 3), step 2: a milestone becomes a ★ on a journal entry, and existing
-- milestones move over.
--
-- A milestone was its own small record -- a date, a title, whose it was --
-- kept apart from the entry that told the story of the same day. Now an
-- entry can be marked a milestone:
--   * journal_entries.milestone        the ★
--   * journal_entries.milestone_member_id  whose milestone (null: the family's)
--   * journal_entries.event_id         the birthday or anniversary it came
--                                      from (20260929001000), one per day
--
-- MOVING THEM OVER. Every milestone becomes an entry with the SAME id, the
-- same household, date, title, author, creation time and shared_at, as a
-- household entry, marked ★. Who it is about is also tagged on the entry, so
-- it shows under "Who was there". Who could see each one is unchanged: a
-- milestone was readable by its household and, once shared, by linked
-- households -- exactly the rules of a household entry.
--
-- The auto-share trigger is switched off for the copy, so a milestone that
-- was never shared is not shared now just because its household shares new
-- memories by default; it is switched back on straight after.
--
-- THE OLD TABLE is kept, as it was, as a record -- nothing is dropped -- but
-- it no longer takes new or changed rows: anything still writing milestones
-- there gets an error instead of silently writing where nobody reads.
-- Deletes still go through, because deleting a household cascades into it.

alter table public.journal_entries
  add column if not exists milestone boolean not null default false,
  add column if not exists milestone_member_id uuid references public.members(id) on delete set null,
  add column if not exists event_id uuid references public.events(id) on delete set null;

alter table public.journal_entries drop constraint if exists journal_entries_milestone_fields;
alter table public.journal_entries
  add constraint journal_entries_milestone_fields
  check (milestone or (milestone_member_id is null and event_id is null));

create index if not exists journal_entries_milestone_member_id_idx on public.journal_entries (milestone_member_id);
create index if not exists journal_entries_event_id_idx on public.journal_entries (event_id);
create index if not exists journal_entries_milestones_idx on public.journal_entries (family_id, entry_date desc) where milestone;
-- One milestone per occasion per day, as before: marking twice keeps one.
create unique index if not exists journal_entries_event_day_idx
  on public.journal_entries (event_id, entry_date) where milestone and event_id is not null;

comment on column public.journal_entries.milestone is
  'A milestone: the ★ on an entry. Milestones were their own table until 29 September; they were moved here with the same ids.';

-- Moving them over.
alter table public.journal_entries disable trigger journal_entries_share_new;

insert into public.journal_entries
  (id, family_id, entry_date, title, source, created_by, created_at, shared_at,
   visibility, owner_person_id, milestone, milestone_member_id, event_id)
select ms.id, ms.family_id, ms.milestone_date, ms.title, 'manual', ms.created_by, ms.created_at, ms.shared_at,
       'household', author.person_id, true, ms.member_id, ms.event_id
  from public.milestones ms
  left join public.members author on author.id = ms.created_by
on conflict (id) do nothing;

alter table public.journal_entries enable trigger journal_entries_share_new;

insert into public.journal_entry_people (entry_id, member_id)
select ms.id, ms.member_id from public.milestones ms
 where ms.member_id is not null
on conflict do nothing;

-- The old table: kept, no longer written.
create or replace function public.milestones_are_entries_now()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Milestones are journal entries now (journal_entries.milestone); this table is kept only as a record.'
    using errcode = '42501';
end;
$$;

revoke execute on function public.milestones_are_entries_now() from public, anon, authenticated;

drop trigger if exists milestones_are_entries_now on public.milestones;
create trigger milestones_are_entries_now
  before insert or update on public.milestones
  for each row execute function public.milestones_are_entries_now();

comment on table public.milestones is
  'Kept as a record only. Since 29 September a milestone is a journal entry with milestone = true (same id); this table takes no writes.';
