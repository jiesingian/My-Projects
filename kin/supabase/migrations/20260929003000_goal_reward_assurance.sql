-- A promised reward is kept: locked, due in a day, and chased until received
-- ==========================================================================
--
-- Jonathan, 28 September: "the app should resolve or should ensure that the
-- reward shall be given". Three assurances, and a disclosure of them at the
-- moment anyone promises:
--
--  1. Locked. What a reward is never changes once it is asked for -- not by
--     the giver as they say yes (the "Change it" of 20260928220500 is gone),
--     not afterwards. A different reward is a different request. A promised
--     reward cannot be taken back by the one who promised it, and they cannot
--     delete the goal out from under it.
--  2. A day. When the goal is reached, the one receiving it claims it, and the
--     giver has one day to give it.
--  3. Chased. After that day, Kin pushes the giver every five minutes, from
--     09:00 to 21:00 Manila (never at night -- Jonathan, same day), until it
--     is marked given. Given only pauses the chase: the one receiving it
--     confirms, or says "not yet" and the chase starts again at once; left
--     unconfirmed for a day, it resumes. Children are held to the same rule.
--     Today carries a banner the giver cannot dismiss while it is overdue.
--
-- Also: changing what a goal measures while a reward is in play now needs the
-- OTHER party's yes, whichever side asks. Before, the giver's own edit applied
-- at once -- which let the one who promised raise the bar after promising.
--
-- Every step of a reward goes through goal_reward_act() below, which checks
-- who is acting and from what state; the direct update policy is dropped. The
-- trigger functions start from 20260928232000_moving_keeps_planner_goals.sql,
-- the live versions, and change only what is described here.
--
-- Production held no goals or rewards when this was written.

-- 1. The states ------------------------------------------------------------------
--
--   pending   asked, waiting for the giver
--   approved  promised
--   refused   the giver said not this one
--   claimed   the goal is reached; the giver has until due_at to give it
--   given     the giver says it is given; waiting for the receiver to confirm
--   received  confirmed. Done.

alter table public.planner_goal_rewards
  add column if not exists claimed_at timestamptz;
alter table public.planner_goal_rewards
  add column if not exists due_at timestamptz;
alter table public.planner_goal_rewards
  add column if not exists confirmed_at timestamptz;

alter table public.planner_goal_rewards drop constraint if exists planner_goal_rewards_status_check;
alter table public.planner_goal_rewards
  add constraint planner_goal_rewards_status_check
  check (status in ('pending', 'approved', 'refused', 'claimed', 'given', 'received'));

-- The reminder job's question: which promises are overdue now.
create index if not exists planner_goal_rewards_due_idx
  on public.planner_goal_rewards (due_at) where status in ('claimed', 'given');

-- 2. Nobody moves a reward except through goal_reward_act() ---------------------

drop policy if exists planner_goal_rewards_update on public.planner_goal_rewards;

-- Asking or offering, as before, now with nothing of the later states: a new
-- reward is pending, or promised by the giver writing it.
drop policy if exists planner_goal_rewards_insert on public.planner_goal_rewards;
create policy planner_goal_rewards_insert on public.planner_goal_rewards
  for insert to authenticated
  with check (
    family_id = (select public.current_family_id())
    and proposed_by = (select public.current_member_id())
    and giver_member_id is not null
    and exists (
      select 1 from public.members m
      where m.id = giver_member_id and m.family_id = (select public.current_family_id())
    )
    and exists (
      select 1 from public.planner_goals g
      where g.id = goal_id
        and g.family_id = (select public.current_family_id())
        and g.owner_member_id is distinct from giver_member_id
    )
    and given_at is null and claimed_at is null and due_at is null and confirmed_at is null
    and (
      (status = 'pending' and decided_by is null and decided_at is null)
      or (status = 'approved' and giver_member_id = (select public.current_member_id()) and decided_by = giver_member_id)
    )
  );

-- Taking a reward back. While it is only asked: whoever asked, or the giver.
-- Once promised, never the giver -- a promise is not withdrawn by the one who
-- made it. The one receiving it may always release it: the goal's owner, or on
-- a household goal anyone but the giver.
drop policy if exists planner_goal_rewards_delete on public.planner_goal_rewards;
create policy planner_goal_rewards_delete on public.planner_goal_rewards
  for delete to authenticated
  using (
    family_id = (select public.current_family_id())
    and (
      (status = 'pending' and (proposed_by = (select public.current_member_id()) or giver_member_id = (select public.current_member_id())))
      or exists (
        select 1 from public.planner_goals g
        where g.id = goal_id
          and (
            g.owner_member_id = (select public.current_member_id())
            or (g.owner_member_id is null and giver_member_id is distinct from (select public.current_member_id()))
          )
      )
    )
  );

-- 3. What a reward is never changes ----------------------------------------------
--
-- 20260928232000's version, with the title added to what is fixed.

create or replace function public.planner_goal_rewards_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_moving text := coalesce(current_setting('kin.moving_person', true), '');
begin
  -- Mid-move, the household (and only that) follows the goal's owner.
  if v_moving <> ''
     and new.family_id is distinct from old.family_id
     and new.goal_id is not distinct from old.goal_id
     and new.proposed_by is not distinct from old.proposed_by
     and new.giver_member_id is not distinct from old.giver_member_id
     and new.title is not distinct from old.title
     and (select m.person_id from planner_goals pg join members m on m.id = pg.owner_member_id where pg.id = new.goal_id)::text = v_moving then
    return new;
  end if;
  if new.goal_id is distinct from old.goal_id
     or new.family_id is distinct from old.family_id
     or new.proposed_by is distinct from old.proposed_by
     or new.giver_member_id is distinct from old.giver_member_id
     or new.title is distinct from old.title then
    raise exception 'A reward keeps what it is, who asked and who gives it. Take it back and ask again.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goal_rewards_fixed() from public, anon, authenticated;

-- 4. A goal with a reward in play changes only with the other party's yes -------
--
-- 20260928232000's version, except that the giver's own edit no longer
-- applies at once: with a reward in play, every change to what the goal
-- measures goes through decide_goal_change().

create or replace function public.planner_goals_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_moving text := coalesce(current_setting('kin.moving_person', true), '');
begin
  -- The one change allowed to owner and household: the same person moving,
  -- named by members_bring_personal_space(). Nothing else about the goal
  -- may change in the same update, except dropping a savings goal that
  -- stayed behind.
  if v_moving <> ''
     and old.owner_member_id is not null and new.owner_member_id is not null
     and (select person_id from members where id = old.owner_member_id)::text = v_moving
     and (select person_id from members where id = new.owner_member_id)::text = v_moving
     and new.kind is not distinct from old.kind
     and new.target is not distinct from old.target
     and new.period is not distinct from old.period
     and new.due_date is not distinct from old.due_date
     and new.start_value is not distinct from old.start_value
     and (new.savings_goal_id is null or new.savings_goal_id is not distinct from old.savings_goal_id) then
    return new;
  end if;
  if new.owner_member_id is distinct from old.owner_member_id
     or new.kind is distinct from old.kind
     or new.family_id is distinct from old.family_id then
    raise exception 'A goal keeps its owner and its kind. Make a new goal instead.'
      using errcode = 'P0001';
  end if;
  if new.target is distinct from old.target
     or new.period is distinct from old.period
     or new.due_date is distinct from old.due_date
     or new.start_value is distinct from old.start_value
     or (new.savings_goal_id is distinct from old.savings_goal_id and new.savings_goal_id is not null) then
    if coalesce(current_setting('kin.goal_change', true), 'off') = 'on' then
      return new;
    end if;
    if exists (
      select 1 from public.planner_goal_rewards r
      where r.goal_id = new.id and r.status in ('pending', 'approved', 'claimed', 'given')
    ) then
      raise exception 'goal_change_needs_giver: this goal has a reward, so a change to it needs a yes from the other side of the promise.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_goals_fixed() from public, anon, authenticated;

-- Deleting the goal would delete the promise with it. The one who promised may
-- not; anyone else may (the receiver letting it go). Only a direct delete is
-- checked -- a household or member being removed cascades past this.
create or replace function public.planner_goals_keep_promises()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return old;
  end if;
  if exists (
    select 1 from public.planner_goal_rewards r
    where r.goal_id = old.id
      and r.status in ('approved', 'claimed', 'given')
      and r.giver_member_id = public.current_member_id()
  ) then
    raise exception 'goal_promised: you promised a reward on this goal, so it stays until it is given or the other side lets it go.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke execute on function public.planner_goals_keep_promises() from public, anon, authenticated;

drop trigger if exists planner_goals_keep_promises on public.planner_goals;
create trigger planner_goals_keep_promises
  before delete on public.planner_goals
  for each row execute function public.planner_goals_keep_promises();

-- 5. Answering a change: the other side of the promise ---------------------------
--
-- With a reward in play: a change the giver asks for is answered by the one
-- receiving it (the owner, or on a household goal anyone but the giver); any
-- other change is answered by the giver. With none in play, anyone but the one
-- who asked. Otherwise 20260928223000's version.

create or replace function public.decide_goal_change(p_change uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_member_id();
  v_family uuid := public.current_family_id();
  c public.planner_goal_changes%rowtype;
  v_giver uuid;
  v_owner uuid;
begin
  if v_me is null or v_family is null then
    raise exception 'not a member of a household' using errcode = '42501';
  end if;

  select * into c from public.planner_goal_changes
  where id = p_change and family_id = v_family
  for update;
  if not found then
    raise exception 'That change is no longer here.' using errcode = 'P0002';
  end if;
  if c.status <> 'pending' then
    raise exception 'That change has already been answered.' using errcode = 'P0001';
  end if;
  select g.owner_member_id into v_owner from public.planner_goals g where g.id = c.goal_id and g.family_id = v_family;
  if not found then
    raise exception 'That goal is no longer in this household.' using errcode = 'P0002';
  end if;

  select r.giver_member_id into v_giver
  from public.planner_goal_rewards r
  where r.goal_id = c.goal_id and r.status in ('pending', 'approved', 'claimed', 'given');
  if found then
    if c.proposed_by is not distinct from v_giver then
      -- The giver asked: the receiving side answers.
      if v_me = v_giver or (v_owner is not null and v_me <> v_owner) then
        raise exception 'Only whoever receives the reward can answer this.' using errcode = '42501';
      end if;
    elsif v_giver is distinct from v_me then
      raise exception 'Only whoever gives the reward can answer this.' using errcode = '42501';
    end if;
  elsif c.proposed_by is not distinct from v_me then
    raise exception 'Someone else answers a change you asked for.' using errcode = '42501';
  end if;

  if p_approve then
    perform set_config('kin.goal_change', 'on', true);
    update public.planner_goals g set
      title = coalesce(c.title, g.title),
      target = coalesce(c.target, g.target),
      -- Weight is always measured over its whole course.
      period = case when g.kind = 'weight' then g.period else coalesce(c.period, g.period) end,
      unit = coalesce(c.unit, g.unit),
      due_date = case when c.change_due_date then c.due_date else g.due_date end
    where g.id = c.goal_id and g.family_id = v_family;
    perform set_config('kin.goal_change', 'off', true);
  end if;

  update public.planner_goal_changes
  set status = case when p_approve then 'approved' else 'refused' end,
      decided_by = v_me,
      decided_at = now()
  where id = c.id;
end;
$$;

revoke execute on function public.decide_goal_change(uuid, boolean) from public, anon;
grant execute on function public.decide_goal_change(uuid, boolean) to authenticated;

-- 6. Every step of a reward ------------------------------------------------------
--
--   promise   the giver, from pending
--   refuse    the giver, from pending
--   claim     the receiver, from approved: the goal is reached; a day starts
--   give      the giver, from claimed: a day to confirm starts
--   confirm   the receiver, from given: done
--   dispute   the receiver, from given: "not yet" -- back to claimed, overdue now
--
-- The receiver is the goal's owner, or on a household goal anyone in it but
-- the giver. Whether the goal is actually reached is the ring's to show and
-- the giver's to see; the claim says it out loud and starts the clock.

create or replace function public.goal_reward_act(p_goal uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_member_id();
  v_family uuid := public.current_family_id();
  r public.planner_goal_rewards%rowtype;
  v_owner uuid;
  v_is_giver boolean;
  v_is_receiver boolean;
begin
  if v_me is null or v_family is null then
    raise exception 'not a member of a household' using errcode = '42501';
  end if;

  select * into r from public.planner_goal_rewards
  where goal_id = p_goal and family_id = v_family
  for update;
  if not found then
    raise exception 'That reward is no longer here.' using errcode = 'P0002';
  end if;
  select g.owner_member_id into v_owner from public.planner_goals g where g.id = p_goal;

  v_is_giver := r.giver_member_id = v_me;
  v_is_receiver := not v_is_giver and (v_owner = v_me or (v_owner is null and exists (
    select 1 from public.members m where m.id = v_me and m.family_id = v_family and m.status = 'active'
  )));

  if p_action = 'promise' and v_is_giver and r.status = 'pending' then
    update public.planner_goal_rewards set status = 'approved', decided_by = v_me, decided_at = now() where goal_id = p_goal;
  elsif p_action = 'refuse' and v_is_giver and r.status = 'pending' then
    update public.planner_goal_rewards set status = 'refused', decided_by = v_me, decided_at = now() where goal_id = p_goal;
  elsif p_action = 'claim' and v_is_receiver and r.status = 'approved' then
    update public.planner_goal_rewards set status = 'claimed', claimed_at = now(), due_at = now() + interval '1 day' where goal_id = p_goal;
  elsif p_action = 'give' and v_is_giver and r.status = 'claimed' then
    update public.planner_goal_rewards set status = 'given', given_at = now(), due_at = now() + interval '1 day' where goal_id = p_goal;
  elsif p_action = 'confirm' and v_is_receiver and r.status = 'given' then
    update public.planner_goal_rewards set status = 'received', confirmed_at = now(), due_at = null where goal_id = p_goal;
  elsif p_action = 'dispute' and v_is_receiver and r.status = 'given' then
    update public.planner_goal_rewards set status = 'claimed', given_at = null, due_at = now() where goal_id = p_goal;
  else
    raise exception 'goal_reward_not_yours: that step is not yours to take on this reward right now.'
      using errcode = '42501';
  end if;

  return (select status from public.planner_goal_rewards where goal_id = p_goal);
end;
$$;

revoke execute on function public.goal_reward_act(uuid, text) from public, anon;
grant execute on function public.goal_reward_act(uuid, text) to authenticated;

-- 7. The chase -------------------------------------------------------------------
--
-- On the five-minute reminder job (20260926140000_reminders.sql), as a
-- function of its own like due_week_ahead_reminders: the same tick, shared
-- secret and once-only ledger. Three kinds, 09:00 to 21:00 Manila only:
--
--   * once, to the giver, when a reward is claimed: a day starts
--   * once, to the receiver(s), when it is marked given: please confirm
--   * every five minutes, to the giver, while a claimed reward is past due or
--     a given one has gone a day unconfirmed. Keyed by the five-minute slot,
--     so each slot sends once and the next slot sends again.
--
-- It does not consult notification preferences: the chase is the penalty the
-- giver agreed to, disclosed when they promised.

create or replace function public.due_goal_reward_reminders(p_secret text, p_now timestamptz default now())
returns table (key text, member_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  expected text := kin_vault_secret('kin_cron_secret');
  local_now timestamp := p_now at time zone 'Asia/Manila';
  slot bigint := floor(extract(epoch from p_now) / 300)::bigint;
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;
  if local_now::time < time '09:00' or local_now::time >= time '21:00' then
    return;
  end if;

  return query
  with rewards as (
    select r.goal_id, r.title as reward, r.status, r.giver_member_id, r.claimed_at, r.given_at, r.due_at,
           g.title as goal, g.family_id, g.owner_member_id,
           coalesce(split_part(o.full_name, ' ', 1), 'Everyone') as receiver
    from planner_goal_rewards r
    join planner_goals g on g.id = r.goal_id
    left join members o on o.id = g.owner_member_id
    where r.status in ('claimed', 'given')
  ),
  candidates as (
    -- The claim: a day starts.
    select 'goalreward:claimed:' || w.goal_id || ':' || floor(extract(epoch from w.claimed_at))::bigint as key,
           array[w.giver_member_id] as recipients,
           w.receiver || ' reached "' || left(w.goal, 60) || '"' as title,
           'You promised ' || left(w.reward, 80) || '. You have a day to give it, then Kin reminds you every 5 minutes.' as body,
           '/planner?seg=goals' as url
    from rewards w
    where w.status = 'claimed' and w.claimed_at is not null
    union all
    -- Given: the receiver confirms.
    select 'goalreward:given:' || w.goal_id || ':' || floor(extract(epoch from w.given_at))::bigint,
           case when w.owner_member_id is not null then array[w.owner_member_id]
                else array(select m.id from members m where m.family_id = w.family_id and m.status = 'active' and m.id <> w.giver_member_id) end,
           'Did you get ' || left(w.reward, 60) || '?',
           'Confirm it on Today, or say not yet.',
           '/today'
    from rewards w
    where w.status = 'given' and w.given_at is not null
    union all
    -- Overdue: every five minutes until it is settled.
    select 'goalreward:due:' || w.goal_id || ':' || slot,
           array[w.giver_member_id],
           case when w.status = 'claimed' then 'You still owe ' || left(w.reward, 60)
                else left(w.reward, 60) || ' is not confirmed yet' end,
           case when w.status = 'claimed' then w.receiver || ' reached "' || left(w.goal, 60) || '". Give it, then mark it given on Today.'
                else 'Ask ' || w.receiver || ' to confirm they got it. Kin keeps reminding you until they do.' end,
           '/today'
    from rewards w
    where w.due_at is not null and w.due_at <= p_now
  ),
  fresh as (
    insert into reminder_sends (key)
    select c.key from candidates c
    on conflict do nothing
    returning reminder_sends.key
  )
  select c.key, s.member_id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url
  from candidates c
  join fresh fr on fr.key = c.key
  join push_subscriptions s on s.member_id = any(c.recipients);
end;
$$;

-- EXECUTE stays granted to anon, as with every due_* function: the cron route
-- calls with the anon key and the shared secret is the lock.
revoke all on function public.due_goal_reward_reminders(text, timestamptz) from public;
grant execute on function public.due_goal_reward_reminders(text, timestamptz) to anon, authenticated;
