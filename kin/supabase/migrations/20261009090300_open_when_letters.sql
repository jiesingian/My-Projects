-- "Open when..." letters (Janine, 7 October): instead of a date, the writer
-- names a moment -- "Open when you're sad", "Open when you miss home" -- and
-- the person it's for opens it themselves when that moment comes.
--
-- * open_when holds the moment; such a letter has no opens_on.
-- * Until it is opened, the person it's for sees only the envelope -- who
--   from and the moment (my_open_when_letters) -- and nobody else sees even
--   that.
-- * open_letter(id) is how they open it: only the person it's for, only
--   once. From then (opened_at) they can read it, as can its writer; in the
--   journal it sits on the day they opened it.
-- * It is never a card: open_to_sign is always false, nobody is told.
-- * The writer may change or take it back until it's opened, as with a
--   dated letter until its day.

alter table public.time_capsules alter column opens_on drop not null;
alter table public.time_capsules
  add column if not exists open_when text check (open_when is null or char_length(open_when) between 1 and 120);
alter table public.time_capsules
  add column if not exists opened_at timestamptz;
alter table public.time_capsules drop constraint if exists time_capsules_date_or_moment;
alter table public.time_capsules
  add constraint time_capsules_date_or_moment check ((opens_on is null) = (open_when is not null));

create or replace function public.time_capsules_fill()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_dob date;
begin
  new.open_when := nullif(btrim(coalesce(new.open_when, '')), '');
  if tg_op = 'INSERT' then
    new.family_id := (select public.current_family_id());
    new.writer_member_id := (select public.current_member_id());
    new.writer_name := coalesce((select m.full_name from public.members m where m.id = new.writer_member_id), '');
    new.created_at := now();
    new.notified_at := null;
    new.opened_at := null;
    if new.open_when is not null then
      new.opens_on := null;
    elsif new.opens_on is null then
      select m.dob into v_dob from public.members m
        where m.id = new.recipient_member_id and m.family_id = new.family_id;
      if v_dob is null then
        raise exception 'Pick the day this letter opens.' using errcode = '22023';
      end if;
      new.opens_on := (v_dob + interval '18 years')::date;
      if coalesce(new.occasion, '') = '' then
        new.occasion := '18th birthday';
      end if;
    end if;
  else
    new.family_id := old.family_id;
    new.writer_member_id := old.writer_member_id;
    new.writer_name := old.writer_name;
    new.created_at := old.created_at;
    -- notified_at is left alone: the notifier sets it, and the only person
    -- who may otherwise update a letter is its writer. opened_at is the
    -- recipient's to set (open_letter), never anyone else's.
    if new.opened_at is distinct from old.opened_at
       and old.recipient_member_id is distinct from public.current_member_id() then
      new.opened_at := old.opened_at;
    end if;
  end if;
  if new.open_when is not null then
    new.open_to_sign := false;
  end if;
  new.occasion := btrim(coalesce(new.occasion, ''));
  return new;
end;
$$;

-- Readable by its writer always; by the person it's for once its day has
-- come, or once they have opened an "open when" letter.
drop policy if exists time_capsules_select on public.time_capsules;
create policy time_capsules_select on public.time_capsules
  for select to authenticated using (
    (writer_member_id is not null and writer_member_id = (select public.current_member_id()))
    or (
      recipient_member_id = (select public.current_member_id())
      and (
        (opens_on is not null and opens_on <= (select public.time_capsule_today()))
        or opened_at is not null
      )
    )
  );

drop policy if exists time_capsules_insert on public.time_capsules;
create policy time_capsules_insert on public.time_capsules
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and writer_member_id = (select public.current_member_id())
    and (opens_on > (select public.time_capsule_today()) or (opens_on is null and open_when is not null))
    and exists (
      select 1 from public.members m
      where m.id = time_capsules.recipient_member_id and m.family_id = time_capsules.family_id
    )
    and (
      (select public.current_member_role()) in ('parent', 'adult')
      or (
        (select public.current_member_role()) = 'child_self'
        and open_to_sign
        and opens_on is not null
        and recipient_member_id <> (select public.current_member_id())
        and public.time_capsule_card_open(recipient_member_id, opens_on)
      )
    )
  );

drop policy if exists time_capsules_update on public.time_capsules;
create policy time_capsules_update on public.time_capsules
  for update to authenticated
  using (
    writer_member_id = (select public.current_member_id())
    and (opens_on > (select public.time_capsule_today()) or (opens_on is null and opened_at is null))
  )
  with check (
    writer_member_id = (select public.current_member_id())
    and (opens_on > (select public.time_capsule_today()) or (opens_on is null and opened_at is null))
    and exists (
      select 1 from public.members m
      where m.id = time_capsules.recipient_member_id and m.family_id = time_capsules.family_id
    )
  );

-- "Open when" envelopes waiting for the caller: who from and the moment,
-- never a word of it. (Dated envelopes stay in my_sealed_letters.)
create or replace function public.my_open_when_letters()
returns table (id uuid, writer_name text, open_when text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.writer_name, t.open_when
  from public.time_capsules t
  where t.recipient_member_id = public.current_member_id()
    and t.open_when is not null
    and t.opened_at is null
  order by t.created_at;
$$;

revoke execute on function public.my_open_when_letters() from public, anon;
grant execute on function public.my_open_when_letters() to authenticated;

-- The person it's for opens an "open when" letter. Once.
create or replace function public.open_letter(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.time_capsules t
  set opened_at = now()
  where t.id = p_id
    and t.recipient_member_id = public.current_member_id()
    and t.open_when is not null
    and t.opened_at is null;
  return found;
end;
$$;

revoke execute on function public.open_letter(uuid) from public, anon;
grant execute on function public.open_letter(uuid) to authenticated;
