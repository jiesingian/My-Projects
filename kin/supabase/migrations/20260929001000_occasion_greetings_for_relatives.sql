-- Birthday greetings are seen by everyone who can see the birthday, and a
-- birthday can be marked a milestone (Jonathan, 28 September, on item 7).
--
-- 1. WHO SEES A GREETING
--
-- 20260928203000_feed_occasions let the birthday household read every
-- greeting and every other household read only its own. That was the wrong
-- way round for what a greeting is for: who remembered matters, to everyone
-- who shares the day, and thanking people properly means seeing all of them.
-- A greeting is now readable by whoever can see the occasion itself -- the
-- birthday household, and each household linked with it while its "share
-- with relatives" switch is on (the same rule feed_occasions_today() uses) --
-- plus the household that wrote it, so nobody loses sight of their own words
-- if a link is later undone. Writing and deleting are unchanged.
--
-- 2. A BIRTHDAY AS A MILESTONE
--
-- Not every birthday is a milestone; a household decides which are. Marking
-- one writes an ordinary milestone (so it lives on the Milestones tab and
-- anywhere milestones go next), carrying the event it came from. event_id is
-- how the feed knows the milestone and the birthday card are the same moment
-- and shows a ★ on the card instead of a second item. Removing the event
-- leaves the milestone, as a memory, and forgets the link.

-- ── 1. greetings readable by everyone who can see the occasion ─────────────

-- Whether the caller may see a given household's occasions: their own, or a
-- linked household's while it shares with relatives. A definer function
-- because the policy cannot read another household's families row itself
-- (row-level security on families is the household's own), which is exactly
-- the row the "share with relatives" switch lives on. It answers yes or no
-- about the caller only, so it tells nobody anything about anyone else.
create or replace function public.can_see_occasions_of(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_family_id = current_family_id()
    or (
      families_are_linked(p_family_id, current_family_id())
      and exists (select 1 from families f where f.id = p_family_id and f.share_with_relatives)
    );
$$;

revoke execute on function public.can_see_occasions_of(uuid) from public, anon;
grant execute on function public.can_see_occasions_of(uuid) to authenticated;

drop policy if exists occasion_greetings_select on public.occasion_greetings;
create policy occasion_greetings_select on public.occasion_greetings
  for select to authenticated using (
    family_id = (select current_family_id())
    or public.can_see_occasions_of(event_family_id)
  );

-- ── 2. milestones that come from a birthday or anniversary ────────────────

alter table public.milestones
  add column if not exists event_id uuid references public.events(id) on delete set null;

-- One milestone per occasion per day: marking twice is a no-op, not a copy.
create unique index if not exists milestones_event_day_idx
  on public.milestones (event_id, milestone_date) where event_id is not null;
