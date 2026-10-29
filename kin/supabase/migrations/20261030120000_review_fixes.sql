-- Four fixes from a review of the watched-change digests (#1066, #1105,
-- #1112), 29 October. No begin/commit: migrate.mjs wraps this file and its
-- ledger row in one transaction. Re-runnable.

-- 1. A journal photo's file is in its own household's folder or its
-- uploader's own. journal_media's insert and update policies
-- (20260928185000) check the row's household and visibility, never its
-- storage_path, so a member could file a row naming any person/<id>/ path
-- they had seen -- a connection's Public photo, say -- and then:
--   * delete that file through journal_person_household_delete
--     (20260929021700), which lets a household delete any person/ file a
--     household row of its own names;
--   * have the account-deletion job delete it with the service role, from
--     finalize_account_deletion's or delete_household_for_account_deletion's
--     path lists (20261022160000).
-- The app already refuses such a path (lib/actions/journal.ts, "That file
-- doesn't belong to this household"); this makes the database refuse it too.
-- Only when the path is set or changed, so moving a personal photo to the
-- household (visibility changes, the path stays) is untouched, and only for a
-- member's own request: the service role's jobs, migrations and definer
-- functions write as they did.
create or replace function public.journal_media_path_is_own()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.storage_path is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.storage_path is not distinct from old.storage_path then
    return new;
  end if;
  -- A member's own request runs as the authenticated role; the service
  -- role's jobs, migrations and definer functions run as another.
  if current_user is distinct from 'authenticated' then
    return new;
  end if;
  if position('..' in new.storage_path) = 0 and (
    new.storage_path like new.family_id::text || '/%'
    or (public.current_person_id() is not null
        and new.storage_path like 'person/' || public.current_person_id()::text || '/%')
  ) then
    return new;
  end if;
  raise exception 'A photo''s file must be in this household''s folder or your own.'
    using errcode = '42501';
end;
$$;

drop trigger if exists journal_media_path_is_own on public.journal_media;
create trigger journal_media_path_is_own
  before insert or update of storage_path on public.journal_media
  for each row execute function public.journal_media_path_is_own();

-- 2. "A linked person on the writer's tree" (20261021140000) is someone in
-- the writer's own household on its tree, or someone matched onto it from a
-- linked household. The first branch never checked the member was in the
-- writer's household, and any member -- a child included -- may write
-- family_tree_people with any member_id (20260911024650). So anyone in a
-- household could put an outsider's member id on its tree, and that outsider
-- read every grown-up's Public entries there, connected to nobody. The member
-- must now be the writer's household's own; outsiders come in only through
-- the second branch, an accepted match between linked households. Otherwise
-- unchanged.
create or replace function public.on_family_tree_as_me(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_family_id is not null and public.current_person_id() is not null and (
    exists (
      select 1 from public.family_tree_people t
      join public.members m on m.id = t.member_id
      where t.family_id = p_family_id
        and m.family_id = p_family_id
        and m.person_id = public.current_person_id()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.family_tree_matches fm
      join public.family_tree_people mine
        on mine.id = case when fm.offer_family_id = p_family_id then fm.to_person_id else fm.offer_person_id end
      join public.members m on m.id = mine.member_id
      where fm.status = 'accepted'
        and p_family_id in (fm.offer_family_id, fm.to_family_id)
        and mine.family_id = case when fm.offer_family_id = p_family_id then fm.to_family_id else fm.offer_family_id end
        and m.family_id = mine.family_id
        and m.person_id = public.current_person_id()
        and m.status = 'active'
        and public.families_are_linked(fm.offer_family_id, fm.to_family_id)
    )
  );
$$;

revoke execute on function public.on_family_tree_as_me(uuid) from public, anon;
grant execute on function public.on_family_tree_as_me(uuid) to authenticated;

-- 3. A past shopping trip is kept for a week (20261023210000), but its insert
-- policy had no upper bound on checked_out_at: a trip dated in the future
-- stayed readable and was never swept. The app never sets the column (its
-- default is now()), so a few minutes either side is all a real one needs.
drop policy if exists buy_trips_insert on public.buy_trips;
create policy buy_trips_insert on public.buy_trips
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and created_by = (select public.current_member_id())
    and checked_out_at > now() - interval '5 minutes'
    and checked_out_at < now() + interval '5 minutes'
  );

-- 4. "X is due in N days" skips a bill marked as paid in a banking app and
-- waiting to be confirmed (status 'scheduled'), as the day-before and
-- on-the-day pushes have since 20261023235000. Re-created by 20261029130000
-- with only 'paid' left out, so its payer was told to pay again. Otherwise
-- unchanged.
create or replace function public.due_bill_ahead_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  expected text := public.kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  return query
  with zones as (
    select hc.family_id, hc.local_now, hc.today from public.household_clock(p_now) hc
  ),
  candidates as (
    select 'bill:' || b.id || ':' || b.due_date || ':ahead' as key,
           b.family_id,
           public.money_push_recipients(b.family_id, b.account_id, b.owner_member_id, b.is_joint) as recipients,
           b.name || ' is due in ' || b.remind_days_before || ' days' as title,
           'Due ' || to_char(b.due_date, 'FMDay FMDD Mon') || '. Tap to pay or mark it paid.' as body,
           '/wealth?seg=cashflow' as url
    from public.bills b
    join zones z on z.family_id = b.family_id
    where b.status not in ('paid', 'scheduled') and b.paid_at is null
      and b.remind_days_before >= 2
      and b.due_date = z.today + b.remind_days_before
      -- From 09:00 in the household's own zone, like the day-before and
      -- on-the-day bill pushes.
      and z.local_now::time >= time '09:00'
  ),
  fresh as (
    insert into public.reminder_sends (key)
    select c.key from candidates c where cardinality(c.recipients) > 0
    on conflict do nothing
    returning public.reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh f on f.key = c.key
  join public.push_subscriptions s on s.family_id = c.family_id and s.member_id = any (c.recipients)
  join public.members m on m.id = s.member_id
  where m.status = 'active' and coalesce((m.notification_prefs ->> 'bills')::boolean, true);
end;
$$;

revoke all on function public.due_bill_ahead_reminders(text, timestamptz) from public;
grant execute on function public.due_bill_ahead_reminders(text, timestamptz) to anon, authenticated;
