-- Today's plan, read aloud: a private link per member that an iPhone Shortcut
-- fetches and speaks with the phone's own voice (Get Contents of URL, then
-- Speak Text). Free -- no app store, no AI -- and one tap from the Action
-- Button's pop-up, the Home Screen widget, or "Hey Siri".
--
-- Built exactly like the calendar link (20260924120000_calendar_feed.sql),
-- and deliberately separate from it: making or resetting one must not break
-- the other. A Shortcut fetches with no cookie, so the link is the key: 32
-- random bytes shown once, with only the SHA-256 stored here.
--
-- today_brief() is SECURITY DEFINER because the fetch arrives as anon. It
-- reaches exactly what that member's calendar link would: the household's
-- whole-family tasks and events plus the ones tagged to them. Nothing about
-- money, health or documents. A wrong or malformed hash returns null, the
-- same as an unused one, so it answers no question about which links exist.
-- The rows are the recent and recurring ones; the app picks today's.

alter table public.members
  add column if not exists brief_hash text;

create unique index if not exists members_brief_hash_key
  on public.members (brief_hash)
  where brief_hash is not null;

alter table public.members
  drop constraint if exists members_brief_hash_shape;
alter table public.members
  add constraint members_brief_hash_shape
  check (brief_hash is null or brief_hash ~ '^[A-Za-z0-9_-]{43}$');

create or replace function public.today_brief(p_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select m.id, m.family_id, m.full_name
    from members m
    where p_hash ~ '^[A-Za-z0-9_-]{43}$'
      and m.brief_hash = p_hash
      and m.status in ('active', 'managed')
    limit 1
  ),
  items as (
    select a.title, a.start_at as starts_at, a.end_at as ends_at, null::date as all_day, null::date as all_day_end,
           false as yearly, a.repeat, a.location
    from activities a
    join me on a.family_id = me.family_id
    where (a.applies_to_whole_family
           or exists (select 1 from activity_members am where am.activity_id = a.id and am.member_id = me.id))
      and (a.repeat <> 'once' or a.start_at > now() - interval '2 days')
    union all
    select e.title, null, null, e.event_date, e.end_date, e.recurs_yearly, null, null
    from events e
    join me on e.family_id = me.family_id
    where (e.applies_to_whole_family
           or exists (select 1 from event_members em where em.event_id = e.id and em.member_id = me.id))
      and (e.recurs_yearly or coalesce(e.end_date, e.event_date) >= current_date - 2)
  )
  select jsonb_build_object(
    'name', me.full_name,
    'items', coalesce((select jsonb_agg(to_jsonb(items)) from items), '[]'::jsonb)
  )
  from me
$$;

revoke all on function public.today_brief(text) from public;
grant execute on function public.today_brief(text) to anon, authenticated;
