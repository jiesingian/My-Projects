-- A private calendar link per member, for Apple Calendar, Outlook and
-- anything else that subscribes to an .ics feed.
--
-- Apple has no API a web app can sign in to; the way every family app gets
-- onto an iPhone's calendar is a subscription link. Apple fetches it every so
-- often with no cookie and no session, so the link itself is the key: 32
-- random bytes the member is shown once. Only its SHA-256 is stored here, so
-- a read of this table -- by anybody, including us -- cannot reproduce a
-- working link. Making a new link replaces the hash and the old one stops.
--
-- calendar_feed() is SECURITY DEFINER because the fetch arrives as anon, with
-- no row-level identity to check. What it can reach is exactly what the
-- member could see in the Planner: the household's whole-family tasks and
-- events plus the ones tagged to them, from 60 days back. Nothing else --
-- no notes on money, no health, no documents. A wrong or malformed hash
-- returns nothing rather than an error, so the function answers no question
-- about which hashes exist.

alter table public.members
  add column if not exists calendar_feed_hash text;

create unique index if not exists members_calendar_feed_hash_key
  on public.members (calendar_feed_hash)
  where calendar_feed_hash is not null;

alter table public.members
  drop constraint if exists members_calendar_feed_hash_shape;
alter table public.members
  add constraint members_calendar_feed_hash_shape
  check (calendar_feed_hash is null or calendar_feed_hash ~ '^[A-Za-z0-9_-]{43}$');

create or replace function public.calendar_feed(feed_hash text)
returns table (
  uid text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day date,
  all_day_end date,
  yearly boolean,
  repeat text,
  location text,
  notes text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select m.id, m.family_id
    from members m
    where feed_hash ~ '^[A-Za-z0-9_-]{43}$'
      and m.calendar_feed_hash = feed_hash
      and m.status in ('active', 'managed')
    limit 1
  )
  select 'a-' || a.id, a.title, a.start_at, a.end_at, null::date, null::date, false, a.repeat, a.location, a.notes
  from activities a
  join me on a.family_id = me.family_id
  where (a.applies_to_whole_family
         or exists (select 1 from activity_members am where am.activity_id = a.id and am.member_id = me.id))
    and (a.repeat <> 'once' or a.start_at > now() - interval '60 days')
  union all
  select 'e-' || e.id, e.title, null, null, e.event_date, e.end_date, e.recurs_yearly, null, null, e.sub_note
  from events e
  join me on e.family_id = me.family_id
  where (e.applies_to_whole_family
         or exists (select 1 from event_members em where em.event_id = e.id and em.member_id = me.id))
    and (e.recurs_yearly or coalesce(e.end_date, e.event_date) > current_date - 60)
$$;

revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
