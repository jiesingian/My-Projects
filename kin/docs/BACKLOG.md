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
2. **Done: Settings as short pages (item 8).** Kid view has its row (item 5). A home list (profile, Appearance,
   Notifications, Connected apps, Household, Kid view, Privacy & lock,
   Account), each row showing its current value. Every existing control
   moves, and nothing is removed. The documents lock stays on Family and is
   also reachable from Privacy & lock.
3. **Done: Return to Today after 30+ minutes in the background (item 2).** A fresh
   open already lands on Today. Shorter trips away come back where they were.
4. **Done: The look matches the icon (item 3).** The warm coral look becomes the
   default for *new* households, and a one-time "try the new look" card goes
   to existing people. A theme someone chose is never overridden.
5. **Done: Kid view: approved 25 September (K1 + K2 + K3).** K1: switched on
   per child, for children with a login of their own, and only a grown-up
   can turn it off. K2: four tabs (Today, Chat, Journal, Family); money,
   the vault and running the household are hidden *and* refused by the
   server. K3: a new child with their own login starts in kid view (a
   database change).
6. **Done: One locked vault for documents and passwords (item 5): approved 25
   September (V1 + V2 + V4).** V1: one Vault tab with Documents and
   Passwords. V2: a "Whose" dropdown like Wealth's. V4: Face ID first, a
   PIN number pad, a lock countdown, press-and-hold to reveal. V3 ("just
   me" passwords) was declined. Watched paths.
7. **Done: 3D family tree (item 10).** An optional "3D view" toggle. The current
   tree stays the default.
8. **Done: Public home page (items 1 + 11).** A front page with a 3D house
   preview, setup one question at a time, then a tour of the features
   before sign-up. The largest item, done last in its own sessions. Check
   the existing onboarding first. It touches watched sign-up screens.

Added 25 September, after the list above:

9. **Done: photos open full screen** the way Facebook and Instagram show
   them, never in a new tab.
10. **Done: Comments and reactions on photos** shared on a profile or in the
    journal.
11. **Done: Family feed shares on its own:** decided 25 September -- once
    two households are linked, new entries and milestones reach the other
    household automatically, photos included; one tap keeps an entry private,
    and a household switch turns it off.
12. **Done: Family tree:** each person on the tree opens their profile, and
    brothers and sisters can be added, not only a father and mother.
13. **Done: Text that fits:** tab and button labels that fit at the default text
    size, and pages that still work at a larger one.

Decided against in the same review: revising Journal (item 6) and Planner
(item 7). Done already: no hub numbers and no "five ledgers" motto (item 9,
#209).

## Done

- Family tree: a dashed "Add brother / Add sister" place beside whoever is
  selected, and parents drawn close above their own child -- a married
  child no longer drifts away from their parents when both sides of the
  family are recorded (25 September).

- Settings → Appearance shows each colour theme in the mode chosen above
  (Light, Dark or System), one sample instead of both; the Theme switch now
  changes the page and its highlight at once rather than a tap behind
  (25 September).

- Public home page: signed-out visitors get a turning 3D house, setup one
  question at a time (family name, who lives there, what would help), and a
  tour of the features with their picks first, ending at sign-up or an
  invite code; the family name carries into onboarding. Login and sign-up
  screens are unchanged (25 September).

- 3D family tree: a "3D" button under the tree tilts it into a floor with
  every card standing up from it, and ⟲ ⟳ turn it; the flat tree stays the
  default. Also fixed: clicking a person on the tree with a mouse did
  nothing (it only worked by touch) (25 September).

- Kid view: Settings → Kid view (grown-ups, one switch per child with a
  login); four tabs, a Today of their own jobs, stars, rewards and what's
  coming up; Wealth, Household, the vault, health records, the household's
  settings and Kin AI hidden and refused by the server. A child who gets a
  login starts in it, and only a grown-up can turn it off (the database
  enforces that) (25 September).

- The family vault: Family → Vault holds Documents and Passwords behind one
  unlock, with a "Whose" picker (documents by who they are for, passwords by
  who saved them), Face ID first and a number pad for the PIN, "Locks again
  in N min · Lock now", and press-and-hold to see a password (Copy never
  shows it). Passwords moved out of Links (25 September).

- Family feed: new journal entries and milestones reach linked households
  on their own, with their photos (Kin storage; Drive-kept photos stay
  home). "Share new memories with relatives" in Settings → Household turns
  it off; tapping Shared keeps one entry private. Earlier entries are
  unchanged (25 September).

- Comments and reactions on photos: under every journal photo, profile
  picture and household photo in the full-screen viewer, one reaction per
  person and a comment thread, household-only. Other people's profile
  pictures now open as an album too, read-only (25 September).

- Family tree: Brother and Sister next to Father and Mother (they share the
  recorded parents; with none recorded, the form asks for one). A relative
  can be picked from the household instead of typed, so their card opens
  their profile, and a name typed earlier can be linked to its profile
  (25 September).

- Text that fits: the Family tabs are Profile, Health, Docs, Tree and
  Links, and no label, button or name breaks mid-word at 100% on any phone.
  At 150% and 200% rows wrap and headings stop at the phone's width instead
  of breaking. Still breaking: 200% on a 320px phone, the original iPhone SE
  (25 September).

- Five more colour themes in Settings → Appearance: Pale Milk, Editorial,
  Electric Blue, Emerald Wave and Antarctic (dark only), from Janine's list,
  each passing the same readability test as the rest. Plain and outline
  buttons now use each theme's link colour, so they read in dark mode too
  (25 September).

- One full-screen photo viewer everywhere a photo opens (journal, Gallery,
  profile and household albums, chat): the whole screen, swipe or arrow
  keys for the next photo, swipe down to close, double-tap to zoom. Chat
  photos no longer open a new browser tab (25 September).

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

- **Dev has no `documents` storage bucket,** so every upload on dev fails
  with "Bucket not found". Production's bucket and its storage policies were
  made by hand before the migration pipeline and are in no migration. A
  migration that creates both, matching production's policies exactly,
  would fix dev and make production reproducible; it needs production's
  current storage policies read first.

- Skeleton loaders on the pages that still show a blank screen while loading
  (5 of 24 have them).
- Chore-done pop and a strike-and-slide animation when a grocery item is
  ticked (no new dependencies).
- Photos attached to calendar events.
- Pantry-based meal planner: suggest meals from what is already in stock.
- Proactive reminders: leave-by times, bills due, low pantry items, birthdays
  coming up.
- Apple Calendar sync (Google is done).
