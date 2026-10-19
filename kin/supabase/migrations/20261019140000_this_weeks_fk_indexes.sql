-- The foreign keys from this week's tables that Supabase's performance
-- advisor found without a covering index (19 October, dev and production
-- alike). Without one, deleting a member or a household scans the whole
-- table to find the rows the cascade or `set null` has to reach.
--
-- The advisor's other findings on this week's objects were left as they are,
-- on purpose:
--  * list_add_tokens has RLS on and no policies: deny-all is the design, and
--    only the security-definer functions in 20261014202000 touch it.
--  * SECURITY DEFINER functions callable by anon: the due_* reminders are
--    called by /api/cron/reminders with the anon key and refuse without the
--    cron secret; add_to_list_by_link, calendar_feed and today_brief are
--    reached by a token on purpose.
--  * the same functions callable by authenticated: each checks the caller
--    itself (or is a trigger function, which Postgres will not run as an RPC).
--  * unused indexes: the tables are days old.

create index if not exists health_medicine_photos_created_by_idx
  on public.health_medicine_photos (created_by);

create index if not exists vault_emergency_contacts_added_by_idx
  on public.vault_emergency_contacts (added_by);

create index if not exists vault_emergency_contacts_member_family_idx
  on public.vault_emergency_contacts (member_family_id);
