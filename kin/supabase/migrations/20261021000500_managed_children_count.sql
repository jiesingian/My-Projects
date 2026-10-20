-- Managed children count: Who's coming and the monito-monita
-- ==========================================================
--
-- A child without a login of their own is a member row with role
-- 'child_managed' and status 'managed' (20260928214500, and
-- convertToChildAction). Who's coming (20261014090000) and the monito-monita
-- (20261019233200, with guests 20261020231000) were written for "a grown-up
-- answers for a managed child" and "managed children go in the draw", but
-- each checked members.status = 'active', so on real data a parent could
-- neither answer for their child nor put them in the draw, and the draw
-- left them out. The PGlite stand-in gives its managed child the default
-- 'active', which is why the probes passed. Found 20 October while taking
-- the public pages' screenshots.
--
-- Re-created, identical but for that one test, which now reads
-- status in ('active', 'managed'):
--   * event_rsvp_allowed()
--   * the gift_draw_people_insert policy
--   * draw_gift_draw()
-- The RSVP reminder (due_rsvp_reminders) is left as it is: it goes only to
-- someone with a device, which a managed child has not.
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create or replace function public.event_rsvp_allowed(p_event uuid, p_member uuid, p_family uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_family = public.current_family_id()
    and exists (
      select 1 from public.events e
      where e.id = p_event
        and e.family_id = p_family
        and not coalesce(e.recurs_yearly, false)
        -- Open until the last day has gone. An end before the start (bad
        -- data) falls back to the start, as lib/planner-done does.
        and greatest(e.event_date, coalesce(e.end_date, e.event_date)) >= public.household_today()
        and (
          e.applies_to_whole_family
          or not exists (select 1 from public.event_members em where em.event_id = e.id)
          or exists (select 1 from public.event_members em where em.event_id = e.id and em.member_id = p_member)
        )
    )
    and exists (
      select 1 from public.members m
      where m.id = p_member
        and m.family_id = p_family
        and m.status in ('active', 'managed')
        and (
          m.id = public.current_member_id()
          or (m.role = 'child_managed' and public.current_member_role() in ('parent', 'adult'))
        )
    )
$$;

revoke all on function public.event_rsvp_allowed(uuid, uuid, uuid) from public, anon;
grant execute on function public.event_rsvp_allowed(uuid, uuid, uuid) to authenticated;

drop policy if exists gift_draw_people_insert on public.gift_draw_people;
create policy gift_draw_people_insert on public.gift_draw_people
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and added_by = (select public.current_member_id())
    and public.gift_draw_member(draw_id)
    and exists (select 1 from public.gift_draws d where d.id = draw_id and d.drawn_at is null)
    and exists (
      select 1 from public.members m
      where m.id = member_id
        and m.family_id = (select public.current_family_id())
        and m.status in ('active', 'managed')
        and (m.id = (select public.current_member_id()) or (select public.current_member_role()) in ('parent', 'adult'))
    )
  );

create or replace function public.draw_gift_draw(p_draw uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d record;
  ids uuid[];
  fams uuid[];
  n integer;
  biggest integer;
  ordered uuid[];
  slots uuid[];
  slot_fams uuid[];
  i integer;
begin
  select * into d from public.gift_draws g where g.id = p_draw for update;
  if d.id is null or d.family_id is distinct from public.current_family_id() or public.current_member_role() not in ('parent', 'adult') then
    raise exception 'Only a grown-up of the household that started the draw can draw.';
  end if;
  if d.exchange_date < (now() at time zone public.safe_time_zone((select f.time_zone from public.families f where f.id = d.family_id)))::date then
    raise exception 'The exchange day has passed.';
  end if;
  -- People still in: their household is the organizer's or still asked and linked.
  select array_agg(p.id order by p.r), array_agg(p.family_id order by p.r)
    into ids, fams
  from (
    select p.id, p.family_id, random() as r
    from public.gift_draw_people p
    left join public.members m on m.id = p.member_id
    where p.draw_id = p_draw
      and (p.guest_id is not null or m.status in ('active', 'managed'))
      and (
        p.family_id = d.family_id
        or (
          exists (select 1 from public.gift_draw_households h where h.draw_id = p_draw and h.family_id = p.family_id)
          and public.families_are_linked(d.family_id, p.family_id)
        )
      )
  ) p;
  n := coalesce(array_length(ids, 1), 0);
  if n < 3 then
    raise exception 'A draw needs at least three people in.';
  end if;
  if d.not_own_household then
    select max(c) into biggest from (select count(*) as c from unnest(fams) f group by f) x;
    if biggest * 2 > n then
      raise exception 'One household is more than half the draw, so someone would pick their own. Turn off "not their own household" or ask more people in.';
    end if;
    -- Biggest households first, a random order among equals and within each;
    -- then every other place first (1, 3, 5...), then the places between.
    -- With no household over half, no two neighbours in the loop share one
    -- (checked below all the same).
    select array_agg(x.id order by x.size desc, x.fr, x.r), array_agg(x.family_id order by x.size desc, x.fr, x.r)
      into ordered, slot_fams
    from (
      select u.id, u.family_id, count(*) over (partition by u.family_id) as size,
             max(u.gr) over (partition by u.family_id) as fr, random() as r
      from (select v.id, v.family_id, random() as gr from unnest(ids, fams) as v(id, family_id)) u
    ) x;
    slots := array_fill(null::uuid, array[n]);
    fams := array_fill(null::uuid, array[n]);
    for i in 1..n loop
      if i <= (n + 1) / 2 then
        slots[2 * i - 1] := ordered[i];
        fams[2 * i - 1] := slot_fams[i];
      else
        slots[2 * (i - (n + 1) / 2)] := ordered[i];
        fams[2 * (i - (n + 1) / 2)] := slot_fams[i];
      end if;
    end loop;
    for i in 1..n loop
      if fams[i] = fams[(i % n) + 1] then
        raise exception 'Kin could not keep households apart in this draw. Turn off "not their own household" and draw again.';
      end if;
    end loop;
    ids := slots;
  end if;
  delete from public.gift_draw_picks k where k.draw_id = p_draw;
  insert into public.gift_draw_picks (draw_id, giver_id, receiver_id)
  select p_draw, ids[g.k], ids[(g.k % n) + 1] from generate_series(1, n) as g(k);
  perform set_config('kin.drawing', 'yes', true);
  update public.gift_draws g set drawn_at = now() where g.id = p_draw;
  perform set_config('kin.drawing', '', true);
  return n;
end;
$$;

revoke all on function public.draw_gift_draw(uuid) from public, anon;
grant execute on function public.draw_gift_draw(uuid) to authenticated;
