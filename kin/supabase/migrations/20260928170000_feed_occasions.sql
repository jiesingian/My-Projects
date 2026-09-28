-- Birthday and anniversary moments on the family feed (agreed 28 September,
-- item 7). On the day, Journal -> Family feed opens with "Lola Rosa turns 72
-- today", for her own household and for every household linked with it, and
-- relatives can leave a greeting under it.
--
-- WHERE THE DATES COME FROM
--
-- The birthdays Kin already has: events with recurs_yearly, of kind
-- 'birthday' or 'anniversary'. Nothing new is typed in. A linked household
-- cannot read another household's events (their RLS is the household's own),
-- so feed_occasions_today() reads them as definer and returns only today's
-- occasions -- the title, the kind and the number of years, never the rest of
-- the calendar -- for the caller's household and the households linked with
-- it. The same share_with_relatives switch that stops new memories crossing
-- (20260925110000) stops occasions crossing too.
--
-- GREETINGS
--
-- occasion_greetings holds one line per greeting. Who wrote it travels with
-- it as a name (author_name, household_name), set by the trigger from the
-- caller's own identity, the way family_link_messages does -- the other
-- household cannot read this household's members. Reading is narrower than
-- the card: the birthday household sees every greeting it was sent, and each
-- household sees its own. A greeting from one set of relatives is not shown
-- to another set that happens to be linked to the same household.
--
-- A greeting can only be written on the day, to an occasion the caller could
-- see on the feed; the trigger resolves that from the event and leaves the
-- row unwritable (a null the column refuses) otherwise -- the same answer
-- whether the event does not exist or is simply not the caller's to see.

-- ── today's occasions ─────────────────────────────────────────────────────

create or replace function public.feed_occasions_today()
returns table (event_id uuid, family_id uuid, household_name text, title text, kind text, years int, is_ours boolean)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select current_family_id() as fid, (now() at time zone 'Asia/Manila')::date as today
  ),
  households as (
    select m.fid as family_id from me m where m.fid is not null
    union
    select case when l.requester_family_id = m.fid then l.addressee_family_id else l.requester_family_id end
    from family_links l cross join me m
    where l.status = 'accepted' and m.fid in (l.requester_family_id, l.addressee_family_id)
  )
  select e.id,
         e.family_id,
         f.name,
         e.title,
         e.kind,
         -- The years only when the stored year is a real one before this year.
         case when extract(year from e.event_date) between 1900 and extract(year from m.today) - 1
              then (extract(year from m.today) - extract(year from e.event_date))::int end,
         e.family_id = m.fid
  from events e
  join households h on h.family_id = e.family_id
  join families f on f.id = e.family_id
  cross join me m
  where e.recurs_yearly
    and e.kind in ('birthday', 'anniversary')
    and (e.family_id = m.fid or f.share_with_relatives)
    and (
      to_char(e.event_date, 'MM-DD') = to_char(m.today, 'MM-DD')
      -- A 29 February birthday is kept on the 28th in a year without one.
      or (to_char(e.event_date, 'MM-DD') = '02-29' and to_char(m.today, 'MM-DD') = '02-28'
          and to_char(m.today + 1, 'MM-DD') = '03-01')
    )
  order by e.family_id = m.fid desc, e.title;
$$;

-- Signed-in members only: without a household it returns nothing anyway,
-- but anon has no reason to call it.
revoke execute on function public.feed_occasions_today() from public, anon;
grant execute on function public.feed_occasions_today() to authenticated;

-- ── greetings ─────────────────────────────────────────────────────────────

create table if not exists public.occasion_greetings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- The birthday household, resolved by the trigger; read by the policies.
  event_family_id uuid not null references public.families(id) on delete cascade,
  occasion_date date not null,
  -- The household and person the greeting is from.
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  author_name text not null default '',
  household_name text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  constraint occasion_greetings_body_length check (char_length(btrim(body)) between 1 and 500)
);

create index if not exists occasion_greetings_event_idx on public.occasion_greetings (event_id, occasion_date, created_at);
create index if not exists occasion_greetings_event_family_idx on public.occasion_greetings (event_family_id);
create index if not exists occasion_greetings_family_idx on public.occasion_greetings (family_id);
create index if not exists occasion_greetings_member_idx on public.occasion_greetings (member_id);

-- Fills in everything but the words, from the caller and the event. It only
-- assigns and never raises: an event the caller may not greet leaves
-- event_family_id null, and the not-null constraint refuses the row with the
-- same error whether the event exists or not.
create or replace function public.occasion_greeting_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cf uuid := current_family_id();
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  new.occasion_date := today;
  new.family_id := cf;
  new.member_id := current_member_id();
  new.author_name := coalesce((select full_name from members where id = new.member_id), '');
  new.household_name := coalesce((select name from families where id = cf), '');
  new.event_family_id := (
    select o.family_id from feed_occasions_today() o where o.event_id = new.event_id
  );
  return new;
end;
$$;

revoke execute on function public.occasion_greeting_fill() from public, anon, authenticated;

drop trigger if exists occasion_greetings_fill on public.occasion_greetings;
create trigger occasion_greetings_fill
  before insert on public.occasion_greetings
  for each row execute function public.occasion_greeting_fill();

alter table public.occasion_greetings enable row level security;
revoke all on public.occasion_greetings from anon;

-- Read: the birthday household sees every greeting; each household its own.
drop policy if exists occasion_greetings_select on public.occasion_greetings;
create policy occasion_greetings_select on public.occasion_greetings
  for select to authenticated using (
    event_family_id = (select current_family_id())
    or family_id = (select current_family_id())
  );

-- Write: as yourself, from your own household (the trigger sets both, so
-- this holds for any insert that reaches it with a resolved occasion).
drop policy if exists occasion_greetings_insert on public.occasion_greetings;
create policy occasion_greetings_insert on public.occasion_greetings
  for insert to authenticated with check (
    family_id = (select current_family_id())
    and member_id = (select current_member_id())
  );

-- Take back your own greeting. Nobody else's.
drop policy if exists occasion_greetings_delete on public.occasion_greetings;
create policy occasion_greetings_delete on public.occasion_greetings
  for delete to authenticated using (member_id = (select current_member_id()));
