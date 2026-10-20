-- Monito-monita: after the draw, the exchange day can move later, never
-- earlier.
--
-- gift_draw_revealed() opens every pick to everyone in the draw once the
-- exchange day has come with "reveal on the day" on. The organizer
-- household's grown-ups may still update the draw after it is drawn (the
-- policy allows it, and gift_draws_fixed froze only who avoids whom), so one
-- of them could set the day to today, turn reveal on, read every giver and
-- receiver -- their own giver included -- and put the day back. That breaks
-- 20261019233200's promise that nobody, the organizer included, reads more
-- than their own pick before the day.
--
-- Postponing the party stays possible; bringing the day forward after the
-- draw does not (draw again to do that). Reveal on the day can still be
-- switched either way: it only ever opens on the day that was set.

create or replace function public.gift_draws_fixed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.family_id is distinct from old.family_id or new.created_by is distinct from old.created_by then
    raise exception 'A draw stays with its household.';
  end if;
  -- Only draw_gift_draw sets or clears drawn_at (it says so in kin.drawing).
  if new.drawn_at is distinct from old.drawn_at and coalesce(current_setting('kin.drawing', true), '') <> 'yes' then
    new.drawn_at := old.drawn_at;
  end if;
  -- After the draw, who avoids whom is settled.
  if old.drawn_at is not null and new.not_own_household is distinct from old.not_own_household then
    raise exception 'The draw is done; draw again to change that.';
  end if;
  -- After the draw, the day can only move later: an earlier day would open
  -- everyone's picks now.
  if old.drawn_at is not null and new.drawn_at is not null and new.exchange_date < old.exchange_date then
    raise exception 'The names are drawn; the exchange day can move later, not earlier.';
  end if;
  return new;
end;
$$;
