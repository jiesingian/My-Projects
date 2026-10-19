-- Helper access: the whole family's plans as well as the children's
-- (Jonathan, 15 October, answering #637's open question: "both for plans").
--
-- helper_kids_plans() sent only Planner activities tagged to a
-- child. A helper also needs what the whole household is doing -- the
-- Sunday lunch at Lola's, the trip to the province -- so helper_family_plans()
-- sends, for today and tomorrow:
--   - an activity tagged to a child (as before), and
--   - an activity for the whole family, or tagged to nobody (the same
--     "for everyone" rule as lib/for-me.ts and the reminders).
-- A grown-up's own plan (tagged to grown-ups only, not for the whole family)
-- stays out, as before. Still title, time, place and children's first names
-- only; the new for_whole_family column lets the page say "Whole family".
--
-- The answer gains a column, so it is a new function, helper_family_plans(),
-- with the same grants as helper_kids_plans() had in
-- 20261015121000_household_helpers.sql, and the old one is dropped (only
-- /helper called it). A new name rather than a changed return type keeps
-- both files re-runnable in order.

create or replace function public.helper_family_plans(p_family uuid)
returns table (title text, start_at timestamptz, end_at timestamptz, repeat text, repeat_days smallint[], repeat_until date, place text, children text[], for_whole_family boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
begin
  if public.helper_row_for(p_family, 'kids') is null then
    raise exception 'The family''s plans are not shared with you.' using errcode = '42501';
  end if;
  select public.safe_time_zone(f.time_zone) into v_tz from public.families f where f.id = p_family;
  v_from := ((now() at time zone v_tz)::date)::timestamp at time zone v_tz;
  v_to := (((now() at time zone v_tz)::date) + 2)::timestamp at time zone v_tz;
  return query
    select a.title::text, a.start_at::timestamptz, a.end_at::timestamptz, a.repeat::text, a.repeat_days::smallint[], a.repeat_until::date, a.location::text,
      coalesce(kids.names, '{}'::text[]),
      (coalesce(a.applies_to_whole_family, false) or tagged.n = 0)
    from public.activities a
    cross join lateral (
      select array_agg(split_part(btrim(mm.full_name), ' ', 1) order by mm.full_name) as names
      from public.activity_members am
      join public.members mm on mm.id = am.member_id
      where am.activity_id = a.id
        and mm.family_id = p_family
        and mm.role in ('child_self', 'child_managed')
        and mm.status <> 'removed'
    ) kids
    cross join lateral (
      select count(*) as n from public.activity_members am where am.activity_id = a.id
    ) tagged
    where a.family_id = p_family
      and a.status in ('upcoming', 'completed')
      and (kids.names is not null or coalesce(a.applies_to_whole_family, false) or tagged.n = 0)
      and a.start_at < v_to
      and (coalesce(a.repeat, 'once') <> 'once' or a.start_at >= v_from)
      and (a.repeat_until is null or a.repeat_until >= (v_from at time zone v_tz)::date)
    order by a.start_at;
end;
$$;

revoke execute on function public.helper_family_plans(uuid) from public, anon;
grant execute on function public.helper_family_plans(uuid) to authenticated;

drop function if exists public.helper_kids_plans(uuid);
