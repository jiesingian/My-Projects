-- 🎯 A goal's milestone and "Remind" on a shared goal's deposit reach the
-- phone (30 October). Both were sent as kind 'bills' with a made-up label
-- for a source ("goal-milestone:<id>:50", "deposit:<id>"), but a push's
-- source is the id of the event that warrants it (20261021130000), and
-- 'bills' had no event: push_targets refused the label as not a uuid, and
-- would have found nobody warranted anyway. Neither push ever went out;
-- "Remind" said "Reminded ✓" regardless.
--
-- money_pushes  One row per such push, written by the person whose action
--               sends it: what it is ('milestone' of a Planner goal, at its
--               step; 'deposit' reminder on a savings goal, to one person),
--               and the row's id is the push's source -- so each one is
--               handed out once, and a later step or next month's reminder
--               is a push of its own.
-- push_warranted, re-created as 20261021130000 wrote it with one branch
--               added: 'bills' with a money_pushes row of the caller's from
--               the last five minutes (at most 30 an hour) reaches
--                 * a milestone: the goal's person, or the grown-ups when it
--                   is the household's -- and only once the goal's
--                   milestone column has reached that step;
--                 * a deposit reminder: the one person named, sent by a
--                   grown-up, for a goal of the household's.
--               The person sending is never among them (as for every kind).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create table if not exists public.money_pushes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references public.members(id) on delete cascade,
  what text not null check (what in ('milestone', 'deposit')),
  ref uuid not null,
  step smallint check (step in (25, 50, 75, 100)),
  recipient uuid references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint money_pushes_shape check (
    (what = 'milestone' and step is not null and recipient is null)
    or (what = 'deposit' and step is null and recipient is not null))
);
create index if not exists money_pushes_by_on on public.money_pushes (created_by, created_at);
alter table public.money_pushes enable row level security;
revoke all on public.money_pushes from anon, authenticated;
grant select, insert on public.money_pushes to authenticated;

drop policy if exists money_pushes_insert on public.money_pushes;
create policy money_pushes_insert on public.money_pushes for insert to authenticated
  with check (family_id = public.current_family_id() and created_by = public.current_member_id());
-- Read back by whoever wrote it (the insert returns its id), nobody else.
drop policy if exists money_pushes_select on public.money_pushes;
create policy money_pushes_select on public.money_pushes for select to authenticated
  using (created_by = public.current_member_id());

-- The household's active grown-ups, the caller included (push_warranted's
-- own list leaves the caller out).
create or replace function public.money_push_grownups(p_family uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.id), '{}') from public.members m
   where m.family_id = p_family and m.status = 'active' and m.role in ('parent', 'adult');
$$;
revoke all on function public.money_push_grownups(uuid) from public, anon, authenticated;

create or replace function public.push_warranted(p_kind text, p_source uuid, p_member_ids uuid[])
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  fam uuid := public.current_family_id();
  recent constant interval := interval '5 minutes';
  household uuid[];
  grownups uuid[];
  who uuid[];
  r record;
begin
  if me is null or fam is null or p_source is null then return '{}'; end if;
  select coalesce(array_agg(m.id), '{}'),
         coalesce(array_agg(m.id) filter (where m.role in ('parent', 'adult')), '{}')
    into household, grownups
    from public.members m
   where m.family_id = fam and m.status = 'active' and m.id <> me;

  if p_kind = 'chat' or p_kind = 'arrivals' then
    if exists (select 1 from public.family_messages f
                where f.id = p_source and f.family_id = fam and f.member_id = me
                  and f.deleted_at is null and f.created_at > now() - recent) then
      who := household;
    elsif p_kind = 'arrivals' and exists (
      select 1 from public.member_locations l
      join public.household_places p on p.id = l.place_id
      where l.member_id = me and l.place_id = p_source and p.family_id = fam
        and l.updated_at > now() - recent) then
      who := household;
    end if;
  elsif p_kind = 'journal' then
    if exists (select 1 from public.journal_entries e
                where e.id = p_source and e.family_id = fam and e.visibility = 'household'
                  and e.owner_person_id = public.current_person_id()) then
      who := household;
    end if;
  elsif p_kind = 'shopping' then
    if exists (select 1 from public.buy_items b
                where b.id = p_source and b.family_id = fam and b.created_by = me
                  and b.created_at > now() - recent) then
      who := household;
    end if;
  elsif p_kind = 'events' then
    if exists (select 1 from public.event_comments c
                where c.id = p_source and c.family_id = fam and c.member_id = me
                  and c.created_at > now() - recent) then
      who := household;
    end if;
  elsif p_kind = 'approvals' then
    if exists (select 1 from public.routine_log l
                where l.routine_id = p_source and l.family_id = fam and l.logged_by = me
                  and l.approval = 'pending' and l.logged_at > now() - recent) then
      who := grownups;
    end if;
  elsif p_kind = 'sos' then
    select a.member_id into r from public.sos_alerts a
     where a.id = p_source and a.family_id = fam
       and ((a.member_id = me and (a.created_at > now() - recent or a.resolved_at > now() - recent))
         or (a.handled_by = me and a.handled_at > now() - recent));
    if found then
      who := grownups || array_remove(array[r.member_id], me);
    end if;
  elsif p_kind = 'checkins' then
    select c.asked_by, c.member_id, c.asked_at, c.answered_at into r from public.member_checkins c
     where c.id = p_source and c.family_id = fam;
    if found then
      if r.asked_by = me and r.asked_at > now() - recent then who := array[r.member_id];
      elsif r.member_id = me and r.answered_at > now() - recent then who := array[r.asked_by];
      end if;
    end if;
  elsif p_kind = 'calls' or p_kind = 'family_calls' then
    select c.callee, c.rang_at, c.caller into r from public.push_call_rings c where c.call_id = p_source;
    if not found and p_kind = 'calls' and cardinality(p_member_ids) = 1 and p_member_ids[1] = any (household)
       and (select count(*) from public.push_call_rings c where c.caller = me and c.rang_at > now() - interval '1 hour') < 30 then
      insert into public.push_call_rings (call_id, family_id, caller, callee) values (p_source, fam, me, p_member_ids[1])
      on conflict do nothing;
      select c.callee, c.rang_at, c.caller into r from public.push_call_rings c where c.call_id = p_source;
    end if;
    if found and r.caller = me and r.rang_at > now() - interval '2 minutes' then
      who := case when p_kind = 'calls' then array[r.callee] else array_remove(grownups, r.callee) end;
    end if;
  elsif p_kind = 'bills' then
    -- A money push the caller just recorded (money_pushes, below), and not
    -- a flood of them.
    select n.what, n.ref, n.step, n.recipient into r from public.money_pushes n
     where n.id = p_source and n.family_id = fam and n.created_by = me and n.created_at > now() - recent;
    if found and (select count(*) from public.money_pushes n where n.created_by = me and n.created_at > now() - interval '1 hour') <= 30 then
      if r.what = 'milestone' then
        -- The goal's step already claimed (planner_goals.milestone): its
        -- person, or the grown-ups when it is the household's.
        select case when g.owner_member_id is null then grownups else array[g.owner_member_id] end into who
          from public.planner_goals g
         where g.id = r.ref and g.family_id = fam and g.milestone >= r.step;
      elsif r.what = 'deposit' and me = any (public.money_push_grownups(fam))
            and exists (select 1 from public.goals g where g.id = r.ref and g.family_id = fam) then
        who := array[r.recipient];
      end if;
    end if;
  end if;

  return array(select x from unnest(coalesce(who, '{}')) x where x = any (p_member_ids) and x <> me and x = any (household));
end;
$$;
revoke execute on function public.push_warranted(text, uuid, uuid[]) from public, anon, authenticated;
