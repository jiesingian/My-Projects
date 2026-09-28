# Backlog

What is agreed but not built yet, and what is waiting on somebody. Update
it in the same pull request that finishes or adds an item.

## Agreed 28 September (Jonathan's answers to the page-by-page review)

The review page: https://claude.ai/artifact/YCR7BHzEfyDsdVEoFkH87r. Each is its
own pull request; 1 and 3 are large database changes and each deserves a fresh
session (see the root CLAUDE.md on session cost).

1. **Done: every person owns their account; a household links them.** Each
   account has a personal space (profile, own journal, own goals, private
   notes) that belongs to the person, not the household. A married son or
   daughter starts their own household (wife and children) and takes their
   personal space with them; the parents' household keeps its shared history;
   the family tree links the two so the feed still reaches them. Design and
   what moves: docs/PERSONAL_SPACE.md (#298 data model, #306 moving, #318
   goals fix). Private notes have their table (`personal_notes`) but no
   screen yet; the journal's Mine tab (item 3) is where personal entries get
   written.
2. **Done: household name from both surnames, as an editable suggestion:** the
   wife's maiden surname and the husband's surname, the Filipino way
   ("Santos-Reyes Household"). Never forced (single parents, grandparents
   raising grandchildren, blended families).
3. **Yes: journal in three layers.** Tabs Mine / Household / Family feed (+
   Gallery). A personal entry can be added to the household journal and shared
   to the family feed. A milestone becomes a ★ mark on an entry, with a filter
   chip; existing milestones move over. Feed is photo-first with reactions and
   comments; the "link a household" panel shrinks to one line.
4. **Done: Planner → Goals tab** -- money (existing goals), water, steps,
   weight, gym, custom -- progress rings fed by data Kin already has. **Plus
   (Jonathan): a goal can carry a reward**, set when the goal is created, by the
   person for themselves or by someone for another member; **the reward is
   subject to approval by a parent or another household member** (the same
   approval idea chores already use).
5. **Done: fold daily chores** into one "N chores" line per day on the Planner
   agenda, with a "Show chores" switch.
6. **Done: profiles that feel like a person** (cover, photo, recent moments,
   Message / Call; details under About; Remove in a "⋯" menu). **Plus
   (Jonathan): a person's profile opens from the family tree too** -- a
   second tap on someone picked in the tree, or their name in its panel.
7. **Yes: birthday and anniversary moments** in the family feed.
8. **Done: a Sunday "week ahead" push** (with its own switch).
9. **Yes: streaks for kids' chores** (bonus star at 7 and 30 days, one freeze a week).
7. **Done: birthday and anniversary moments** in the family feed.
8. **Yes: a Sunday "week ahead" push** (with its own switch).
9. **Done: streaks for kids' chores** (bonus star at 7 and 30 days, one freeze a week).
10. **No Filipino interface.** Kin AI keeps understanding and answering
    Filipino / Taglish, as it already does.

Also agreed the same day and done: **Today as one list** (see Done).

## Waiting on a decision

- **PayMongo / HitPay payments (GCash, Maya, cards).** Options, fees and a
  recommendation for Jonathan in docs/PAYMENTS_OPTIONS.md. Agreed for the
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

Added 26 September (Janine's list):

14. **Done: Family tree full screen:** a button beside the zoom buttons opens
    the tree over the whole screen; the same button or Escape closes it.
15. **Done: Links no longer mentions passwords:** they are only in the Vault.
16. **Done: Smart home shortcuts in Links:** Xiaomi Home and LG ThinQ open
    their own app (Android) or App Store page (iPhone). A real connection
    was declined: Xiaomi has no official way in without the account password.
17. **Done: Planner rows line up:** an event's title is the link to its
    invitation; the preview card moved to the event's own screen.
18. **Done: App icon:** sharp at every size, a polished drawing, and the home
    page's 3D house to match.
19. **Done: Voice and video calls in Chat:** the phone and camera buttons at
    the top of the chat ring a household member with a login, on any page
    of Kin (and by notification when Kin is closed). Direct phone to phone;
    set-up travels on a private per-household channel.
    **Still to do (Jonathan):** a TURN relay so calls also connect on
    mobile data -- add `TURN_URLS`, `TURN_USERNAME` and `TURN_CREDENTIAL` in
    Vercel (Cloudflare Calls or Metered both have a free tier).
20. **Done: Apple Health through an iPhone Shortcut:** Settings, Connected
    apps, Apple Health makes a private link per person; a daily Shortcut
    sends steps, weight, resting heart rate and sleep to it, and they chart
    on that person's Health page (Vitals). The Shortcut steps are written
    against iOS 17/18 but were not tried on an iPhone from here.

Added 26 September, second list:

21. **Done: No page zoom with two fingers.** Text size in Settings is the
    way to larger text; photos and the family tree keep their own pinch.
22. **Done: Travel is an event like any other:** one row per trip (date,
    title linking to the invitation, TRAVEL tag), no separate "Add travel"
    (Add event, Type: Travel), and the trip's spend logged from its own
    screen.
23. **Home-screen icon showed a "K":** the shortcut was saved before the
    icon existed and iPhones never refresh one. Remove it and add Kin to
    the Home Screen again; `/apple-touch-icon.png` now also answers at the
    root for older iPhones.
24. **Done: Health tab, all six approved:** medicines with a tick per dose
    (late and missed ones flagged), a "This week" summary on Family, Health,
    an emergency card per person (share as text, print), WHO growth charts
    for children under five, notes and photos on each visit, and an illness
    log with a temperature chart. A push at each dose time is in the
    reminders (Next up), and starts once the reminder secret is set.

Decided against in the same review: revising Journal (item 6) and Planner
(item 7). Done already: no hub numbers and no "five ledgers" motto (item 9,
#209).

## Done

- The week ahead (agreed 28 September, item 8): Sundays from 19:00
  Manila, the grown-ups get one push -- "Lia's recital Wed, Meralco due
  Thu, Lola Rosa's birthday Sun" -- naming up to five of the coming
  Monday-to-Sunday's one-off plans, unpaid bills, dated events and yearly
  birthdays and anniversaries, then "+N more". Chores are left out; an
  empty week sends nothing. due_week_ahead_reminders() on the existing
  reminder job and ledger; its own "The week ahead" switch in Settings ->
  Notifications (grown-ups only).
- Birthday and anniversary moments on the family feed (agreed 28 September,
  item 7): on the day, Journal -> Family feed opens with "Lola Rosa turns 72
  today 🎂" for her household and every household linked with it (unless
  that household's "share with relatives" is off), from the yearly events
  Kin already keeps. Relatives send a greeting under it; the birthday
  household reads every greeting, each other household its own. One
  self-contained card (OccasionCard) so the journal restructure can move it.
- Goal rewards belong to the giver (Jonathan, 28 September, on #297): a
  reward is a promise, so it names who gives it -- a parent, another adult
  or a child (a hug, a massage, ₱500) -- and only the giver answers it. They
  can reword it as they say yes ("₱300, not ₱500"); a giver setting it
  themselves is promised at once; the giver marks it given. Nobody gives
  themselves one. Goals can be edited now; with a reward waiting or
  promised, a new target, period or date goes to the giver as a request
  they can agree to or refuse (decide_goal_change), and the giver's own
  edit applies at once. Checked with supabase/tests/rls_goal_reward_giver.sql
  (31 cases, dev, rolled back).

- Streaks for kids' chores (agreed 28 September, item 9): a child's daily
  chore shows "🔥 7 days in a row" on its card -- in kid view and on the
  parents' Today -- with how many more days to the next bonus star.
  Reaching 7 and 30 days each adds a real star to the child's stars (once
  a grown-up has approved that day, like points); one missed day a
  Monday-to-Sunday week is covered by a freeze. Computed from routine_log
  every time (lib/streaks.ts), never stored.
- Chores folded on the Planner agenda (agreed 28 September, item 5): a
  day's recurring chores (routines of kind "chore") fold into one
  "N chores" line after that day's plans, opening in place to the list.
  "Show chores" under the legend lists them in full again and is
  remembered like the legend filter; folded, they also stay out of the
  week rail's dots and behind plans in the month grid. Today is unchanged.
- Household name from both surnames (agreed 28 September, item 2): "Create
  a family" has a folded "Suggest a name from surnames" -- the wife's maiden
  surname and the husband's give "Santos-Reyes Household" on a button that
  says exactly what it will fill. Only a suggestion: the field stays
  editable, the home page's family name still pre-fills it, and the two
  surnames are never sent or stored.
- Today as one list (Jonathan, 28 September: "shouldn't they be the same and
  prioritized at the top? ... should be allowed to be marked as done or
  skip"): "Needs you today" and "Today's tasks" are one "Today" list at the
  top -- urgent first, the day in order, finished ones at the bottom with
  Undo. Chores keep their Done / Skip / note; a one-off plan's Done / Skip
  sets it completed / cancelled; a check-up's Done marks it given; a bill has
  Pay (Wealth's pay flow) / Skip; the shopping has Shop / Skip; a birthday
  or event just shows for the day, with nothing to tick. Marks live in today_marks (20260928170000). Meals stay in the
  header's "Eating today".
- Planner → Goals (approved 28 September, "Agreed 28 September" item 4, with
  Jonathan's rewards): a fourth Planner tab beside Calendar, Tasks and
  Events. Each goal has a target and a progress ring, an owner (a person or
  the whole household) and a kind: money (a savings goal on Wealth, or what
  is put by here), water (liquid_intake_log), steps and weight (vitals /
  Apple Health), gym (sessions ticked, counted per week) or anything
  countable. A goal can carry a reward, set when the goal is made; it counts
  once a parent or another adult says yes, on the goal or in Today's queue,
  and nobody approves their own (on a household goal, not whoever asked).
  The policies hold that, not the app (supabase/tests/rls_planner_goals.sql,
  32 cases, run on dev inside a rolled-back transaction). What a goal
  measures cannot change after it is made, so an approved reward's target
  cannot be lowered. Money, water, gym and custom goals are Kin Free; steps
  and weight are Plus (require_kin_plus). Rings draw in once on entry and
  sit still under reduced motion.

- Review fixes (28 September, every page rendered signed in against a local
  stand-in with an invented household): a child with their own login showed
  as "Adult" in the role editor, and Edit then Save would have made them one
  -- a child's role is now shown, not edited; roles read "child · own login"
  / "child · kept by a parent" instead of "child self"; Planner → Add's
  Date/From/To row ran 100px off a phone; "2 ItemS" on the shopping list and
  its checkout; closed list sections pointed left; icons squeezed to dots
  beside long lines (plan screen); the journal's "ADDED DIRECTLY" badge;
  a styled "Add photos or videos" button instead of the browser's bare file
  picker; a slimmer empty household photo; children's profiles no longer
  list empty Work and Government IDs. Still open: a React hydration
  mismatch on Planner → Tasks (harmless, a re-render).

- Pinch to zoom on photos (28 September): page zoom stays off everywhere
  (item 21), and the full-screen photo viewer -- journal, Gallery, profile,
  event and chat photos -- now pinches with two fingers up to 4x, tracking
  both fingers around the point between them, resisting softly past the
  limits and settling back on release; lifting one finger keeps panning.

- Download my data (approved 28 September): Settings → Account, grown-ups
  only, after typing the account password (checked server-side). A ZIP of
  CSV spreadsheets, one per section, read with the member's own session so
  it holds exactly what they can see; vault secrets, tokens, hashes and
  billing ids withheld; photos listed by name and path. No new dependency:
  src/lib/export/zip.ts writes the ZIP.

- "Why Kin" on the home page (approved 28 September): after the feature
  tour, one step with three reasons -- one app instead of five, private to
  your family (no selling, no ads, no AI training), and 14 days of Plus free
  then Free for good or ₱149 a month -- then Create or Join. The tour gets a
  "Skip, create account" for anyone ready sooner.
- "Start here" on Today (approved 28 September): for grown-ups in a family
  created from 28 September, for its first 30 days -- add this week's plans,
  invite your partner (shares the join link), add this month's bills (on
  Kin Free: give the kids a chore, since Wealth is Plus), start the grocery
  list. Each ticks itself from the family's own records; the card goes when
  all four are done or someone taps Hide (remembered per member).

- Open sign-up (approved 28 September): an account is a person first, with
  no code. Anyone can then start a family, which begins on the 14-day Kin
  Plus trial; a Kin code is optional there ("Have a Kin code?") and still
  honoured. Joining an existing family uses its invite code, after
  registration.

- Kin Free and Kin Plus (approved 28 September, 14-day trial): nobody is
  locked out any more. When a trial ends the household drops to Kin Free and
  keeps its calendar, chores, lists, chat, calls, journal (1 GB), tree,
  relatives' feed, health profiles and emergency card, and 5 Kin AI questions
  or flyer scans a month. Kin Plus (₱149/mo, ₱1,490/yr) adds Wealth, the
  vault, medicines, the illness log, vitals and Apple Health, unlimited Kin AI
  and 50 GB. The database refuses new entries in a Plus area for a Free
  household (require_kin_plus); what is already there stays readable and
  editable. New households default to a 14-day trial; the organizer gets a
  push 3 days before it ends and when it has; Today shows a banner in the last
  3 days; Settings → Your plan shows both plans. The old "trialing, no end
  date = forever" bug is gone. Also: the sign-in and onboarding screens wear
  Kin Coral, fixing the 4.01:1 button contrast on Kin Classic blue.
  Not yet: event and visit photos (photo-strip.tsx) upload straight to
  storage and are not counted against the storage size.

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
  of breaking (25 September). 200% on a 320px phone, the original iPhone SE,
  now fits too: page margins stop growing with the text, Settings rows and
  Today's tiles wrap instead of cutting to "A…", the chat title keeps its
  width, and the cash-flow months thin out instead of stacking letter by
  letter. Checked on every hub at 320, 375 and 390px, at 100%, 150% and
  200% (28 September).

- Action Button & widget: pressing the iPhone's Action Button pops up a
  small Kin menu (Open Kin, Chat with Kin, Talk to Kin by default), and a
  Home Screen widget gives one-tap Kin buttons. Settings → Action Button &
  widget picks what each holds, shows a picture of both, and walks through
  the one-time Shortcuts setup step by step. Each item opens its own fixed
  /go link, so a label never drifts from what it does. A widget that shows
  live Kin information (today's events, the list) needs a native iPhone app
  (28 September).

- Today in Kin, read aloud: one tap (widget, Action Button pop-up, or "Hey
  Siri, Today in Kin") and the iPhone says today's plan with times in its own
  voice. A private link per member, like the calendar link, that a Shortcut
  fetches and speaks. Free, and works without the AI key. Settings has a
  Hear it button to preview (28 September).
  It also says the chores that are yours today (your turn on a rota, not
  already ticked off, timed ones in the timed list) and, for grown-ups,
  what is running low and not yet on the list (28 September).

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

- **Done 26 September in code: reminders at their time** -- medicine doses,
  bills (the day before and on the day), birthdays, plans 30 minutes ahead --
  run by Supabase pg_cron every five minutes through /api/cron/reminders.
  **Still to do (Jonathan):** the secret in Vercel and Supabase Vault,
  docs/SETUP_FOR_JONATHAN.md section 1. Until then nothing is sent.

- **Done 26 September in code: the chat is on private channels**
  (20260926130000_private_chat_channels.sql). **Still to do (Janine or
  Jonathan, both allowed):** switch Realtime's "Allow public access" off on
  dev and production -- until then Supabase does not enforce it.

- **Done 26 September: dev has storage.** Dev had no buckets at all, not only
  `documents`, so no upload could be tested there.
  20260926120000_storage_buckets_where_missing.sql creates journal, documents,
  avatars (public) and recipe-photos where missing, with household-folder
  policies, and does nothing where they exist (production). Done 28
  September: production's buckets and policies were read and are now in
  20260928140000_storage_policies_as_production.sql, so dev matches
  production exactly (dev also gains trip-photos). Production gained one
  rule, a delete rule for trip-photos, and deleting a household now clears
  every bucket at every depth (event and visit photos and recipe photos were
  being left behind).

- **Done: loading placeholders.** Checked 26 September: every page in the
  app has one -- the shared hub-shaped one in (app)/loading.tsx or its own
  section's -- so none shows a blank screen. The "5 of 24" count was stale.
- **Done: tick animations.** The chore-done pop and burst and the grocery
  strike line were already in (#194). On 26 September the grocery tick
  moved from keyframes to transitions: a shopping trip ticks dozens, often a
  wrong one and straight back, and a transition turns round mid-way where a
  keyframe restarts. The row's sideways nudge is gone.
- **Done 26 September: photos on calendar events.** Several per event, from
  the event's own screen (the venue, the invitation, the day). The Planner
  row says how many. Same household-folder storage as visit photos.
- **Done 26 September: pantry meal planner.** "Cook from what you have"
  (#197) suggested tonight's dinner; now one tap plans every empty dinner
  from today to Sunday, each a different recipe the pantry nearly covers,
  and "Generate grocery list" picks up what's missing. Planned days are
  never replaced.
- **Done 28 September: running low.** Tap a pantry item (Household, Prices
  & pantry) to mark it running low: it shows on Today's Coming up, one tap
  adds everything low to the list, buying it clears it, and the grown-ups
  get one push a morning from 09:00 (their Shopping list switch) once the
  reminder secret is set. A true leave-by time still needs travel times
  from a maps service, which is a key and a bill.
- **Done 26 September: call notifications.** Calls have their own switch
  (muting the chat no longer silences them); the ring is sent urgent, stays
  on screen, expires after a minute, and turns into "Missed call from ..."
  when nobody answers. Grown-ups can be told when anyone in the family calls
  someone else ("Family calls", grown-ups only, own switch). On an iPhone the
  ring only arrives when Kin is on the Home Screen with notifications
  allowed -- Apple's rule for web apps.
- **Apple Calendar two-way: decided against building (26 September).**
  Apple has no calendar API; the only way in is iCloud CalDAV with an
  app-specific password, which also opens that iCloud's mail and contacts --
  not something Kin should hold. Instead: Kin's Apple Calendar link (one
  way, done) for seeing the plans, and for two-way on an iPhone, add the
  Google account in iPhone Settings, Calendar, Accounts -- Kin already syncs
  both ways with Google Calendar.
