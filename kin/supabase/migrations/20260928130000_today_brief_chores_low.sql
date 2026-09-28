-- Today in Kin, read aloud, now with chores and what is running low.
--
-- Same function and the same private link as 20260928120000_today_brief.sql
-- (read that for the security model); it returns three more things:
--   routines -- the household's chores and routines, with who each is
--               assigned to and whether today's is already marked done, so
--               the spoken plan says only what is still this member's to do;
--   me       -- the member's id, to match assignments and rotas;
--   low      -- pantry items marked running low and not yet on the open
--               shopping list, for grown-ups only (who does the shopping,
--               and who the 9 AM "running low" push already goes to).
-- Still nothing about money, health or documents.

create or replace function public.today_brief(p_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select m.id, m.family_id, m.full_name, m.role
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
    'items', coalesce((select jsonb_agg(to_jsonb(items)) from items), '[]'::jsonb),
    -- Chores and other routines: the rule, who it is assigned to in rota
    -- order, and whether this member has already marked today's done or
    -- skipped. The app works out which fall today and whose turn it is.
    'routines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', r.title, 'kind', r.kind, 'freq', r.freq, 'repeat_interval', r.repeat_interval,
        'byweekday', r.byweekday, 'bymonthday', r.bymonthday, 'start_date', r.start_date, 'end_date', r.end_date,
        'time_of_day', r.time_of_day, 'location', r.location, 'whole_family', r.applies_to_whole_family,
        'rotate', r.rotate_assignee,
        'members', coalesce((select jsonb_agg(rm.member_id order by rm.position) from routine_members rm where rm.routine_id = r.id), '[]'::jsonb),
        'logged', coalesce((select jsonb_agg(distinct rl.occurrence_date) from routine_log rl
                            where rl.routine_id = r.id and rl.status in ('done', 'skipped')
                              and rl.occurrence_date >= current_date - 1 and rl.occurrence_date <= current_date + 1), '[]'::jsonb)
      ))
      from routines r
      where r.family_id = me.family_id and not r.paused
        and (r.end_date is null or r.end_date >= current_date - 1)
    ), '[]'::jsonb),
    'me', me.id,
    -- What the pantry says is running low and is not yet on the open
    -- shopping list: grown-ups only, the same people the 9 AM push goes to.
    'low', case when me.role in ('parent', 'adult') then coalesce((
      select jsonb_agg(p.name order by p.name)
      from pantry_items p
      where p.family_id = me.family_id and p.running_low
        and not exists (
          select 1 from buy_items b
          where b.family_id = p.family_id and not b.checked and not b.cleared
            and lower(btrim(b.name)) = lower(btrim(p.name)))
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from me
$$;

revoke all on function public.today_brief(text) from public;
grant execute on function public.today_brief(text) to anon, authenticated;
