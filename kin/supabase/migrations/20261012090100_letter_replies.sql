-- Writing back (Janine, 8 October): the person a letter was for can answer
-- it, once it has opened for them -- now, on a day they pick (a letter back
-- to Mama for her 60th), or "open when...". A reply is a letter like any
-- other, from them to the one who wrote to them, with reply_to pointing at
-- the letter it answers; in the journal it sits under that letter.
--
-- * Anyone with a login may write back to a letter written to them --
--   children included -- but only to its writer, and only once they can
--   read it (its day has come, or they opened it).
-- * A reply may open today ("now"); every other letter still needs a day
--   after today.
-- * Replies are never cards. Who reads them is the usual rule: its writer
--   always, the one it's for once it opens. The morning alert
--   (due_letter_notifications) tells them as for any letter.

alter table public.time_capsules
  add column if not exists reply_to uuid references public.time_capsules(id) on delete set null;
create index if not exists time_capsules_reply_to_idx on public.time_capsules (reply_to);

-- May the caller answer this letter, to this person? Security definer so it
-- can look at the letter whatever the caller's read rights.
create or replace function public.time_capsule_can_reply(p_letter uuid, p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.time_capsules t
    where t.id = p_letter
      and t.family_id = public.current_family_id()
      and t.recipient_member_id = public.current_member_id()
      and t.writer_member_id = p_to
      and (
        (t.opens_on is not null and t.opens_on <= public.time_capsule_today())
        or t.opened_at is not null
      )
  );
$$;

revoke execute on function public.time_capsule_can_reply(uuid, uuid) from public, anon;
grant execute on function public.time_capsule_can_reply(uuid, uuid) to authenticated;

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
    new.reply_to := old.reply_to;
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
  if new.open_when is not null or new.reply_to is not null then
    new.open_to_sign := false;
  end if;
  new.occasion := btrim(coalesce(new.occasion, ''));
  return new;
end;
$$;


drop policy if exists time_capsules_insert on public.time_capsules;
create policy time_capsules_insert on public.time_capsules
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and writer_member_id = (select public.current_member_id())
    and exists (
      select 1 from public.members m
      where m.id = time_capsules.recipient_member_id and m.family_id = time_capsules.family_id
    )
    and (
      -- A new letter or card, as before.
      (
        reply_to is null
        and (opens_on > (select public.time_capsule_today()) or (opens_on is null and open_when is not null))
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
      )
      -- Writing back: to the writer of a letter they can now read.
      or (
        reply_to is not null
        and (opens_on >= (select public.time_capsule_today()) or (opens_on is null and open_when is not null))
        and public.time_capsule_can_reply(reply_to, recipient_member_id)
      )
    )
  );
