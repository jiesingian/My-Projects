-- Deleting a household removes every member's prescription and visit photo
-- files too (the stabilisation pass's "Minor, left": "Deleting a household
-- leaves another member's private prescription file behind (#730)").
--
-- 20261020090100_health_photo_files_follow_their_row.sql made a health
-- photo's file in the journal bucket readable and removable only by whoever
-- can see its row -- so a child cannot download Lola's private slip -- and
-- noted the gap it left: deleteHouseholdAction removes the household's files
-- as the organizer, with the organizer's own rights, so a private medicine's
-- slip that the organizer cannot see stays in the bucket after the household
-- is gone (its row cascades away; nobody can read the file after, and
-- nobody can remove it either).
--
-- The organizer may delete the whole household (delete_household), so being
-- let at its photo rows on the way out is no wider a power. This function,
-- for the organizer only, deletes every health photo row of their household
-- and hands back the files' paths; with no row naming them, the journal
-- bucket's own household-folder policy lets the organizer remove the files,
-- which the action then does before delete_household. It is not for any
-- other moment: it takes no arguments, names no medicine, and refuses anyone
-- but the organizer of their own household.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create or replace function public.forget_household_health_photos()
returns setof text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  select m.family_id into v_family
  from public.members m
  where auth.uid() is not null
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and m.is_organiser
  limit 1;
  if v_family is null then
    raise exception 'Only the organizer can delete the household.' using errcode = '42501';
  end if;

  return query
  with meds as (
    delete from public.health_medicine_photos p where p.family_id = v_family returning p.storage_path
  ),
  visits as (
    delete from public.health_visit_photos p where p.family_id = v_family returning p.storage_path
  )
  select storage_path from meds
  union
  select storage_path from visits;
end;
$$;

revoke all on function public.forget_household_health_photos() from public, anon;
grant execute on function public.forget_household_health_photos() to authenticated;
