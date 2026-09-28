-- Profiles that feel like a person (approved by Jonathan, 28 September,
-- BACKLOG item 6): a cover above the photo, the way Facebook has one.
--
-- The cover is one of the person's own album photos (member_avatars), stored
-- as that photo's id -- never as a URL. A URL anyone in the household could
-- set would put an arbitrary image, from anywhere, in front of everybody who
-- opens the profile; an id can only ever be a photo already in their album.
-- A trigger holds that line: the photo must be this member's. Removing the
-- photo from the album clears the cover (on delete set null), and with no
-- cover the profile shows a wash of their colour behind their photo.
--
-- Who may change it is whoever may already edit the row: the person, the
-- organizer, a grown-up for a managed profile. No policy change.
--
-- A cover is part of the person's profile, so it comes along when they move
-- household (20260928214500_start_own_household.sql): the album is copied
-- there, and the cover is pointed at the same photo in the copy.

alter table public.members
  add column if not exists cover_avatar_id uuid references public.member_avatars(id) on delete set null;

create index if not exists members_cover_avatar_id_idx on public.members (cover_avatar_id);

comment on column public.members.cover_avatar_id is
  'The album photo shown as the cover on their profile. Must be one of their own (members_cover_is_theirs). Null: a wash of their colour.';

create or replace function public.members_cover_is_theirs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cover_avatar_id is not null and not exists (
    select 1 from public.member_avatars a where a.id = new.cover_avatar_id and a.member_id = new.id
  ) then
    raise exception 'A cover has to be one of their own photos.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.members_cover_is_theirs() from public, anon, authenticated;

drop trigger if exists members_cover_is_theirs on public.members;
create trigger members_cover_is_theirs
  before insert or update of cover_avatar_id on public.members
  for each row execute function public.members_cover_is_theirs();

-- The move brings the cover too. The same function as in
-- 20260928232000_moving_keeps_planner_goals.sql, with one step added.
create or replace function public.members_bring_personal_space()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from uuid;
begin
  if new.status <> 'active' or new.auth_user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  update public.journal_entries
     set family_id = new.family_id
   where owner_person_id = new.person_id and visibility = 'personal' and family_id <> new.family_id;

  update public.journal_media
     set family_id = new.family_id
   where owner_person_id = new.person_id and visibility = 'personal' and family_id <> new.family_id;

  -- A personal goal's saved total stays as it was. Its ledger lines are the
  -- old household's money and stay there; the account it drew from is theirs
  -- too, so the link to it is dropped.
  update public.goals
     set family_id = new.family_id, owner_member_id = new.id, linked_account_id = null
   where owner_person_id = new.person_id and not is_joint and family_id <> new.family_id;

  -- Their own Planner goals (water, steps, weight, gym, custom, money --
  -- 20260928180000_planner_goals.sql), with what was logged against them and
  -- its rewards and change requests. A household goal (no owner) stays.
  -- planner_goals_fixed() and planner_goal_rewards_fixed() refuse a change of
  -- owner or household, except for this: the same person, moved by this
  -- function, named in kin.moving_person for exactly these four updates. A
  -- money goal's link to a savings goal is kept only if that savings goal
  -- came along too.
  perform set_config('kin.moving_person', new.person_id::text, true);
  update public.planner_goals g
     set family_id = new.family_id,
         owner_member_id = new.id,
         savings_goal_id = case
           when exists (select 1 from public.goals s where s.id = g.savings_goal_id and s.family_id = new.family_id)
           then g.savings_goal_id end
   where g.family_id <> new.family_id
     and g.owner_member_id in (select m.id from public.members m where m.person_id = new.person_id and m.id <> new.id);

  update public.planner_goal_entries e
     set family_id = new.family_id
    from public.planner_goals g
   where g.id = e.goal_id and g.owner_member_id = new.id and e.family_id <> new.family_id;

  -- A reward keeps its giver and its status (planner_goal_rewards_fixed()
  -- allows only the household to change, and only mid-move). A giver who
  -- stays in the old household can no longer see it from there: an open
  -- question for the goals work, written up in kin/docs/PERSONAL_SPACE.md.
  update public.planner_goal_rewards r
     set family_id = new.family_id
    from public.planner_goals g
   where g.id = r.goal_id and g.owner_member_id = new.id and r.family_id <> new.family_id;

  update public.planner_goal_changes c
     set family_id = new.family_id
    from public.planner_goals g
   where g.id = c.goal_id and g.owner_member_id = new.id and c.family_id <> new.family_id;
  perform set_config('kin.moving_person', '', true);

  -- Their photo album. Files in the avatars bucket are publicly readable, so
  -- the same path works from the new household. Drive-held photos belong to
  -- the old household's Drive and are left there.
  insert into public.member_avatars (member_id, family_id, storage_path, created_at)
  select new.id, new.family_id, a.storage_path, a.created_at
    from public.member_avatars a
    join public.members m on m.id = a.member_id
   where m.person_id = new.person_id and m.id <> new.id and a.storage_path is not null
     and not exists (
       select 1 from public.member_avatars x where x.member_id = new.id and x.storage_path = a.storage_path
     );

  -- An approved move into someone else's household: ask the household they
  -- came from to link, unless the two already are (or are being asked).
  -- Their cover, if they had chosen one: the copy of the same photo in the
  -- album that just came along (20260928235700_member_cover.sql).
  update public.members
     set cover_avatar_id = (
       select x.id
         from public.member_avatars x
         join public.member_avatars c on c.storage_path = x.storage_path
        where x.member_id = new.id
          and c.id = (
            select m.cover_avatar_id from public.members m
             where m.person_id = new.person_id and m.id <> new.id and m.cover_avatar_id is not null
             order by m.moved_at desc nulls last
             limit 1)
        limit 1)
   where id = new.id and cover_avatar_id is null;

  if tg_op = 'UPDATE' and old.status = 'pending' then
    select m.family_id into v_from
      from public.members m
     where m.person_id = new.person_id and m.status = 'moved' and m.family_id <> new.family_id
     order by m.moved_at desc nulls last
     limit 1;
    if v_from is not null and not exists (
      select 1 from public.family_links l
       where l.status in ('pending', 'accepted')
         and ((l.requester_family_id = v_from and l.addressee_family_id = new.family_id)
           or (l.requester_family_id = new.family_id and l.addressee_family_id = v_from))
    ) then
      insert into public.family_links (requester_family_id, addressee_family_id, requested_by)
      values (new.family_id, v_from, new.id);
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.members_bring_personal_space() from public, anon, authenticated;
