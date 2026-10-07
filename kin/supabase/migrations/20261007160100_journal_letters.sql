-- Letters move into the journal (Janine, 7 October). There is no Letters
-- page any more: a letter belongs to a special day -- a person and a date,
-- with a name for the occasion ("18th birthday", "Graduation") -- and on that
-- day it shows in the journal, under that person's own entry for the day if
-- they wrote one, or on its own under the day's name if they didn't. Letters
-- from different people for the same day are kept together.
--
-- What this adds to 20261007090000 and 20261007160050:
-- * occasion: the special day's name. A letter left without a date opens on
--   the 18th birthday and is named so.
-- * The household's own day: letters open by the household's time zone
--   (20261007110000), no longer Manila's for everyone.
-- * my_sealed_letters(): the person a letter is for can see that one is
--   waiting -- who it is from, the day it opens and the occasion -- but never
--   a word of it before that day. Part of what made letters special was
--   knowing one was coming. The table's own read rule is unchanged: only the
--   writer reads a sealed letter.
-- * due_letter_notifications(): on the morning a letter opens (8am in the
--   household's zone, or the first cron tick after), its recipient's devices
--   are told once. Several letters for the same day make one notification.

alter table public.time_capsules
  add column if not exists occasion text not null default '' check (char_length(occasion) <= 80);
alter table public.time_capsules
  add column if not exists notified_at timestamptz;

create index if not exists time_capsules_recipient_opens_idx on public.time_capsules (recipient_member_id, opens_on);

-- Today in the caller's household zone.
create or replace function public.time_capsule_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select f.time_zone from public.families f where f.id = public.current_family_id()),
    'Asia/Manila'))::date;
$$;

revoke execute on function public.time_capsule_today() from public, anon;
grant execute on function public.time_capsule_today() to authenticated;

create or replace function public.time_capsules_fill()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_dob date;
begin
  if tg_op = 'INSERT' then
    new.family_id := (select public.current_family_id());
    new.writer_member_id := (select public.current_member_id());
    new.writer_name := coalesce((select m.full_name from public.members m where m.id = new.writer_member_id), '');
    new.created_at := now();
    new.notified_at := null;
    if new.opens_on is null then
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
    -- who may otherwise update a letter is its writer.
  end if;
  new.occasion := btrim(coalesce(new.occasion, ''));
  return new;
end;
$$;

-- Envelopes waiting for the caller: no title, no body.
create or replace function public.my_sealed_letters()
returns table (id uuid, writer_name text, opens_on date, occasion text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.writer_name, t.opens_on, t.occasion
  from public.time_capsules t
  where t.recipient_member_id = public.current_member_id()
    and t.opens_on > public.time_capsule_today()
  order by t.opens_on, t.created_at;
$$;

revoke execute on function public.my_sealed_letters() from public, anon;
grant execute on function public.my_sealed_letters() to authenticated;

-- Called by the reminders cron with the cron secret, like the others.
create or replace function public.due_letter_notifications(p_secret text, p_now timestamptz default now())
returns table (key text, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  expected text := public.kin_vault_secret('kin_cron_secret');
begin
  if expected is null or length(expected) < 32 or p_secret is distinct from expected then
    return;
  end if;

  return query
  with due as (
    update public.time_capsules t
    set notified_at = p_now
    from public.members r
    join public.families f on f.id = r.family_id
    where t.notified_at is null
      and r.id = t.recipient_member_id
      and r.status = 'active'
      -- Its day, or the day before if the morning's ticks were missed;
      -- never a letter that opened long ago.
      and t.opens_on between (p_now at time zone f.time_zone)::date - 1 and (p_now at time zone f.time_zone)::date
      and (t.opens_on < (p_now at time zone f.time_zone)::date or extract(hour from p_now at time zone f.time_zone) >= 8)
    returning t.recipient_member_id, t.opens_on, t.writer_name, t.occasion
  ),
  grouped as (
    select d.recipient_member_id, d.opens_on, count(*)::int as n,
           min(split_part(d.writer_name, ' ', 1)) as writer, max(d.occasion) as occasion
    from due d
    group by d.recipient_member_id, d.opens_on
  )
  select 'letters:' || g.recipient_member_id || ':' || g.opens_on,
         s.endpoint, s.p256dh, s.auth,
         case when g.n = 1 then 'A letter opens today' else g.n || ' letters open today' end,
         case
           when g.n = 1 then 'From ' || coalesce(nullif(g.writer, ''), 'someone in your family')
           else 'From your family'
         end || case when g.occasion <> '' then ' · ' || g.occasion else '' end,
         '/journal#letters-' || g.recipient_member_id || '-' || g.opens_on
  from grouped g
  join public.push_subscriptions s on s.member_id = g.recipient_member_id;
end;
$$;

-- The secret is the gate, as for due_scheduled_messages: the cron route
-- calls with the public key, never the service-role key.
revoke all on function public.due_letter_notifications(text, timestamptz) from public;
grant execute on function public.due_letter_notifications(text, timestamptz) to anon, authenticated;
