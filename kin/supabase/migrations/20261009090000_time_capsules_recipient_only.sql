-- Time-capsule letters: an opened letter is for the person it was written
-- to (Janine, 7 October), not the whole household. Replaces the read rule
-- from 20261007090000_time_capsule_letters.sql:
-- * the writer always sees their own letters, sealed or opened;
-- * from the day it opens, the person it is for sees it too;
-- * nobody else does -- not the other grown-ups, not the rest of the
--   household.
-- A letter to someone without a login of their own (a child a grown-up
-- keeps a profile for) waits until they have one.

drop policy if exists time_capsules_select on public.time_capsules;
create policy time_capsules_select on public.time_capsules
  for select to authenticated using (
    (writer_member_id is not null and writer_member_id = (select public.current_member_id()))
    or (
      recipient_member_id = (select public.current_member_id())
      and opens_on <= (select public.time_capsule_today())
    )
  );
