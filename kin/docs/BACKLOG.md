# Backlog

What is agreed but not built yet, and what is waiting on somebody. Update
it in the same pull request that finishes or adds an item.

## Waiting on a decision

- **PayMongo / HitPay payments (GCash, Maya, cards).** Agreed for the
  future, not now. Needs merchant accounts and API keys, so it is
  Jonathan's (money and secrets). Start with the subscription checkout in
  `src/lib/billing/`; that path is watched.
- **Warm palette** (#FDFBF7 cream, #1E293B slate, #10B981 emerald). There's
  a preview; not applied yet. If it goes ahead, white text on #10B981 is only
  2.5:1 contrast, so buttons need the darker #047857 and #10B981 stays for
  icons and accents.

## Decided against, for now

- Cutting the bottom navigation down to 4–5 tabs (declined 24 September).

## Next up

- AI flyer / document scanner: photo of a school memo or invitation →
  calendar events, confirmed before saving.
- Skeleton loaders on the pages that still show a blank screen while loading
  (5 of 24 have them).
- Chore-done pop and a strike-and-slide animation when a grocery item is
  ticked (no new dependencies).
- High-contrast / large-text switch in Settings, beside text size.
- Photos attached to calendar events.
- Taglish replies in Kin AI.
- Pantry-based meal planner: suggest meals from what is already in stock.
- Proactive reminders: leave-by times, bills due, low pantry items, birthdays
  coming up.
- Apple Calendar sync (Google is done).
