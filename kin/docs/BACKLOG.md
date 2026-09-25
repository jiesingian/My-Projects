# Backlog

What is agreed but not built yet, and what is waiting on somebody. Update
it in the same pull request that finishes or adds an item.

## Waiting on a decision

- **PayMongo / HitPay payments (GCash, Maya, cards).** Agreed for the
  future, not now. Needs merchant accounts and API keys, so it is
  Jonathan's (money and secrets). Start with the subscription checkout in
  `src/lib/billing/`; that path is watched.

## Agreed 25 September (Jonathan's revision list)

Each is its own pull request, in this order. Proposals for 4 and 8, with
phone mock-ups and a map of every setting, are in the artifact
"Today & Settings Proposals"
(https://claude.ai/artifact/CCtrVkDYYGKM8a7DHvn1o9).

1. **Done: Today (item 4), A + B + C + D as one change.** A: "At a glance" tiles
   (money left this month, next calendar item, shopping list and its cost,
   what's waiting on you) replace the five hub cards, which only repeated
   the bottom bar. B: a "Quick add" row (expense, to buy, event, journal).
   C: one family strip. The header initials become tappable, the family
   list at the bottom goes, and clock and weather move into the header. D:
   "Nothing needs you today" shrinks to one line.
2. **Done: Settings as short pages (item 8).** Kid view gets its row when it is built (item 5). A home list (profile, Appearance,
   Notifications, Connected apps, Household, Kid view, Privacy & lock,
   Account), each row showing its current value. Every existing control
   moves, and nothing is removed. The documents lock stays on Family and is
   also reachable from Privacy & lock.
3. **Done: Return to Today after 30+ minutes in the background (item 2).** A fresh
   open already lands on Today. Shorter trips away come back where they were.
4. **Done: The look matches the icon (item 3).** The warm coral look becomes the
   default for *new* households, and a one-time "try the new look" card goes
   to existing people. A theme someone chose is never overridden.
5. **Kid view: design first, approval before code.** Per-child switch,
   what children see, and only a grown-up can turn it off.
6. **One locked vault for documents and passwords (item 5): design first,
   approval before code.** A per-device passcode for each person and a
   person dropdown like Wealth's, built on the existing documents lock.
   Watched paths.
7. **3D family tree (item 10).** An optional "3D view" toggle. The current
   tree stays the default.
8. **Public home page (items 1 + 11).** A front page with a 3D house
   preview, setup one question at a time, then a tour of the features
   before sign-up. The largest item, done last in its own sessions. Check
   the existing onboarding first. It touches watched sign-up screens.

Decided against in the same review: revising Journal (item 6) and Planner
(item 7). Done already: no hub numbers and no "five ledgers" motto (item 9,
#209).

## Done

- Kin Coral, the icon's look: the default for every profile created from now
  on, and offered once on Today to everyone still on Kin Classic (25
  September).

- Coming back to Kin after 30+ minutes away opens Today; a shorter trip, or a
  page with unsaved typing, comes back where it was (25 September).

- Settings as short pages: a home list with each group's current value, and
  Appearance, Notifications, Connected apps, Household, Privacy & lock and
  Account on pages of their own, with every control moved and none removed
  (25 September).

- Today: "At a glance" tiles in place of the hub cards, a "Quick add" row,
  one family strip in the header (tap initials for a person's card), and a
  one-line "all clear" (25 September).

- Bottom sheets on Vaul: drag to close, and Prices & pantry no longer stuck
  at the top of the screen on phones (#212, 25 September).

- Colour themes in Settings → Appearance: 13 palettes including the warm
  "Hearth" look from the brief and a High contrast theme (24 September).

- Scan a flyer or invitation (Planner → Add) into calendar entries you
  review first; Kin AI answers in Taglish when you write in it (24 September).

## Decided against, for now

- Cutting the bottom navigation down to 4–5 tabs (declined 24 September).

## Next up

- Skeleton loaders on the pages that still show a blank screen while loading
  (5 of 24 have them).
- Chore-done pop and a strike-and-slide animation when a grocery item is
  ticked (no new dependencies).
- Photos attached to calendar events.
- Pantry-based meal planner: suggest meals from what is already in stock.
- Proactive reminders: leave-by times, bills due, low pantry items, birthdays
  coming up.
- Apple Calendar sync (Google is done).
