-- A card everyone signs (Janine, 7 October). Letters for the same person and
-- day already open together in the journal; this makes that a card the
-- household signs. Once a grown-up has written for someone's special day,
-- everyone else in the household with a login -- children included -- can
-- see that the card exists and who has signed it, and add their own note.
--
-- What each person can see is unchanged:
-- * a signer reads only their own note before the day;
-- * the person the card is for sees only envelopes (my_sealed_letters);
-- * open_cards() tells the rest of the household the card exists -- whose
--   day, the date, the occasion and who has signed -- never a word of a note,
--   and never to the person it is for.
--
-- Who may write:
-- * a grown-up may start a card (write the first letter for a day), as before;
-- * a child with their own login may sign a card a grown-up started -- the
--   same person and the same day -- but not start one, and not one for
--   themselves.

-- A letter can stay private (open_to_sign = false): the writer's alone, no
-- card around it, nobody told. It still opens for its recipient on the day,
-- alongside any card for that day. Only letters open to signing make a card.
alter table public.time_capsules
  add column if not exists open_to_sign boolean not null default true;

-- Is there a card still sealed for this person and day in the caller's
-- household? Security definer: the caller can't read others' letters.
create or replace function public.time_capsule_card_open(p_recipient uuid, p_opens date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.time_capsules t
    where t.family_id = public.current_family_id()
      and t.recipient_member_id = p_recipient
      and t.opens_on = p_opens
      and t.opens_on > public.time_capsule_today()
      and t.open_to_sign
  );
$$;

revoke execute on function public.time_capsule_card_open(uuid, date) from public, anon;
grant execute on function public.time_capsule_card_open(uuid, date) to authenticated;

drop policy if exists time_capsules_insert on public.time_capsules;
create policy time_capsules_insert on public.time_capsules
  for insert to authenticated with check (
    family_id = (select public.current_family_id())
    and writer_member_id = (select public.current_member_id())
    and opens_on > (select public.time_capsule_today())
    and exists (
      select 1 from public.members m
      where m.id = time_capsules.recipient_member_id and m.family_id = time_capsules.family_id
    )
    and (
      (select public.current_member_role()) in ('parent', 'adult')
      or (
        (select public.current_member_role()) = 'child_self'
        and open_to_sign
        and recipient_member_id <> (select public.current_member_id())
        and public.time_capsule_card_open(recipient_member_id, opens_on)
      )
    )
  );

-- Cards being signed in the caller's household, for anyone but the caller.
create or replace function public.open_cards()
returns table (recipient_member_id uuid, recipient_name text, opens_on date, occasion text, signers text[], signed_by_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.recipient_member_id,
         min(r.full_name),
         t.opens_on,
         coalesce(max(nullif(t.occasion, '')), ''),
         array_agg(distinct split_part(t.writer_name, ' ', 1)) filter (where t.writer_name <> ''),
         bool_or(t.writer_member_id = public.current_member_id())
  from public.time_capsules t
  join public.members r on r.id = t.recipient_member_id
  where t.family_id = public.current_family_id()
    and t.recipient_member_id <> public.current_member_id()
    and t.opens_on > public.time_capsule_today()
    and t.open_to_sign
  group by t.recipient_member_id, t.opens_on
  order by t.opens_on;
$$;

revoke execute on function public.open_cards() from public, anon;
grant execute on function public.open_cards() to authenticated;

-- "Ana started a card for Lola -- sign it": who is told when a card is
-- started. Asked by the app right after the first letter for a day is
-- written; it answers only to that letter's writer, only while theirs is
-- still the card's only letter, and only in the first ten minutes, so
-- nobody can use it to announce a card twice or someone else's. Told:
-- everyone else in the household who could sign it -- grown-ups and
-- children with their own login -- never the person the card is for.
-- notification_prefs.letters (default on) is each person's switch.
create or replace function public.card_started_push_targets(p_recipient uuid, p_opens date)
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.members m on m.id = s.member_id
  where m.family_id = public.current_family_id()
    and m.status = 'active'
    and m.id <> public.current_member_id()
    and m.id <> p_recipient
    and m.role in ('parent', 'adult', 'child_self')
    and coalesce((m.notification_prefs ->> 'letters')::boolean, true)
    and (
      select count(*) = 1
         and bool_and(t.writer_member_id = public.current_member_id())
         and bool_and(t.created_at > now() - interval '10 minutes')
      from public.time_capsules t
      where t.family_id = public.current_family_id()
        and t.recipient_member_id = p_recipient
        and t.opens_on = p_opens
        and t.opens_on > public.time_capsule_today()
        and t.open_to_sign
    );
$$;

revoke execute on function public.card_started_push_targets(uuid, date) from public, anon;
grant execute on function public.card_started_push_targets(uuid, date) to authenticated;
