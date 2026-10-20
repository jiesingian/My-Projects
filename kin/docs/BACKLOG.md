# Backlog

What is agreed but not built yet, and what is waiting on somebody. Update
it in the same pull request that finishes or adds an item.

## Stabilisation pass, 19–20 October (bugs only, no features)

After ~35 PRs merged 14–19 October from eight sessions (#618–#720).

**Checked:** Vercel production errors since 14 October (one group only:
Node's `url.parse()` deprecation warning from a dependency; Hobby keeps
logs for one hour, so older detail is gone). Supabase advisors and
Postgres logs on dev and production (the "column does not exist" errors
were app-before-migration windows on the 19th; the steady "permission
denied" on the token tables is `check-schema.mjs` proving they're locked).
Dev and production have the same migrations. pg_cron ran on both, and
production's reminders tick answered 200 every time. The weekly suite ran
on `main` (1025 passed, 1 test bug); `test:rls` and every
`*.logic.spec.ts` ran locally. A code review of the week's diffs covered
visibility, time zones, reminders, offline, money, and merge collisions.
22 screens were loaded at 320px and 390px, Simple Kin off and on, as the
sample household: no sideways scroll and no console errors.

**Fixed:**
- **Visibility:**
  - #728: a monito-monita organizer could open every pick early.
  - #730: a child could read or delete a parents-only medicine's
    prescription file.
- **Pushes:**
  - #727: one failing kind lost every other push, Undas included.
  - #732: a malformed medicine time broke reminders for every household.
  - #735: "In 30 minutes" for a plan already done; refills every 40 days;
    doses in a DST gap.
  - #736: the money recap used up a grown-up's month before they had a
    device.
- **Lost data and wrong numbers:**
  - #737: the baon was paid twice.
  - #738: an offline chore answered twice kept the first answer.
  - #742: paluwagan dates after the 15th.
  - #743: the recap and the import stopped at 1000 movements.
  - #744: a wish list was emptied by a failed save.
- **Broken flows:**
  - #733: Simple Kin lost "Nakarating", "Are you okay?" and approvals.
  - #740: the call effects race.
  - #745: Today's date for households abroad.
  - #746: a crash on a bad recipe link.
- **Layout and tests:**
  - #747: the recap at 320px with Simple Kin.
  - #739: the weekly suite's Simple Kin spec.
  - This PR: an Undas probe for a non-Manila household.

**Still unverified or left as is:**
- **Undas end to end.** No push left a server for it. Dev's Vault has no
  `kin_cron_url`/`kin_cron_secret`, so dev's tick never calls the app (by
  design, but it means a push can't be tried on dev). The function is
  covered by PGlite for Manila and Los Angeles, and production's tick is
  answering. The first real one is 29 October (see "Needs a real phone").
- **Design questions, not fixed:**
  - ~~A helper sees medicine names on To-Buy refill lines.~~ Done 20
    October (kin/helper-refill-lines, 20261020160000): the line the job adds
    carries the medicine's id (buy_items.medicine_id), and helper_buy_items()
    reads it as "Medicine refill", with the store the family names
    ("Medicine refill · Mercury Drug"); the family's own list still names
    it. A grown-up chooses per medicine, on the card's "Helper's list" line
    (only shown while a helper sees the list), to show the name after all
    (health_medicine_supply.show_name_to_helper, off to begin with). Probe
    helper-refill-lines.mjs. Not checked: on a helper's real phone.
  - Vault emergency access shows parents-only documents to the trusted
    relative.
  - `tree_story_push_targets` / `helper_push_targets` hand device
    subscriptions to the signed-in sender. This is the same pattern as
    `push_targets`, needed because the app sends pushes without a
    service-role key.
- **Minor, left:**
  - Deleting a note, question or gift row that's already gone reports
    success.
  - `/api/list-add` reads the body before its size check.
  - Deleting a household leaves another member's private prescription
    file behind (#730).
  - A Today "Done" and a Planner chore answer for the same day, both
    offline, go through separate paths.

## Approved 20 October: four CI and upkeep changes (Jonathan)

Each its own pull request. New gates warn on existing debt and fail only on
new debt, compared with `main`, so no other session's PR goes red for it.

- **Done: no new table without an RLS probe.** `ci.yml` runs
  `kin/scripts/check-rls-probes.mjs` after `test:rls`: a table, view or
  security-definer function first created by a migration on the branch, and
  mentioned by no probe under `supabase/tests/pglite/probes/`, fails the
  check. What existed on 20 October is grandfathered in
  `supabase/tests/pglite/no-probe-yet.txt` (136 entries: 23 tables, 113
  definer functions); each line is a probe still to write. The gate for
  #728 and #730.
- **A bundle-size budget in CI:** per-route first-load JS against a stored
  baseline; fail when a route grows by more than 10% or 25 KB.
- **Phone-width screenshots compared with main:** Today, Chat, Planner,
  To-Buy, Wealth at 390px, Simple Kin off and on; warn-only for a week.
- **Safe dependency updates:** patch and minor only, lockfile by npm, the
  `url.parse()` warning gone from production's log.

## Decided 20 October: Kin AI on Haiku, and four things it can do (Jonathan)

Each its own pull request, in this order, built without the key
(`ANTHROPIC_API_KEY` is not on Vercel; Jonathan adds it himself): every
screen is visible and says *Kin AI isn't switched on yet*. Every Kin AI
call -- Ask Kin, the flyer scan, and the three below -- goes to **Claude
Haiku 4.5**, the model named once in `src/lib/kin-ai.ts`, with the prompts
written for it. The three new features are **Kin Plus only**: a Free
household sees the entry point and what Plus unlocks, and spends none of
its five flyer scans. Every screen that sends family records to the model
says so in one line, with "never trains AI". Kid view is refused everywhere.

- **Done:** Haiku switch and "Answer the 2 a.m. question" (#699): a new
  Ask Kin tool, `get_health`, for grown-ups only, returns one member's
  allergies, blood type, medicines being taken now with doses and times,
  conditions, HMO/insurance, PhilHealth, usual doctor, who to call (the
  emergency card's list), health checks due, recent readings, recent
  illness, lab results, a child's vaccines and the saved doctor's-visit
  questions -- read as the asker, so a parents-only or private record of
  someone else's is not in the answer, as on the Health screens. Counts as
  an assistant question, as today. The Ask Kin panel carries the privacy
  line. Logic spec e2e/kin-ai.logic.spec.ts holds every call to Haiku 4.5
  with nothing Haiku rejects (no `effort`, no `fallbacks`). Not checked
  against the real model (no key): the answers' wording, and whether Haiku
  picks `get_health` over `search` for "allergy ni Lia".
- **Done:** Snap a receipt or e-wallet screenshot (Wealth → Cash Flow →
  "Snap a receipt or GCash screenshot", and a line on Move money; Kin
  Plus): a photo of a store receipt, a screenshot of a GCash / Maya /
  InstaPay / bank confirmation, or a Meralco or water bill → Kin AI reads
  amount, date, payee, category, a reference and a guess at the account (a
  single clear match or nothing) → one review card, every field editable,
  "Paid already" or "A bill to pay" → recordMovementAction (money out,
  confirmed) or addBillAction (once), the same rows Move money and Bills
  write. A Free household sees the card and what Plus unlocks; nothing is
  sent or counted. **GCash's PDF history (#679):** the import page takes
  the PDF, opens it on the phone with pdf.js (new dependency pdfjs-dist
  4.10.38, loaded only when a PDF is picked; the password from GCash's
  email is typed there and never sent), and sends only the text lines to
  Kin AI, which maps them to rows; the rows join the ordinary review step
  and import_wealth_transactions(), duplicates skipped the same way.
  Logic specs e2e/receipt-scan.logic.spec.ts and
  e2e/statement-ai.logic.spec.ts. Not checked against the real model (no
  key): whether Haiku reads a crumpled thermal receipt's total right, and
  the GCash PDF's actual layout (the mapping prompt describes it from
  memory of the export; the review step is where a wrong column shows).
  Not checked: pdf.js on a real phone (the worker is served from
  public/pdfjs/, copied at build like MediaPipe's engine).
- "What did I miss?" in chat (Plus): at about 30 unread messages, one tap
  gives a short Taglish summary, never stored, shown once.
- Send it to Kin (Plus): an iPhone Shortcut in the share sheet or an in-app
  "Paste a screenshot" button; a school circular or a Viber/Messenger
  screenshot → dates, places, tasks → the flyer-scan review → plans.

## Approved 19 October: four for the season, Kin Free (Jonathan)

Each its own pull request, in date order: Undas first (1-2 November), then
the potluck, the monito-monita draw, and the Christmas gift list.

- **Done:** Undas and babang-luksa reminders: a "Date of passing" on a
  tree-only relative (Family -> Tree, Manage people), never in the future
  or before their birth. Today lists "Undas · remembering ..." on 1 and 2
  November, and "Remembering <name>" on their 40th day (the day of passing
  counted as the first), the first year ("babang-luksa") and every
  anniversary after (a 29 February one on the 28th in other years); Coming
  up has Undas and those days a week ahead ("candles and flowers?"). The
  grown-ups with a phone get one push from 09:00 their time on 29 October
  and on each day, respecting "Events and schedules". A lit candle sits on
  their tree tile on 1-2 November. Settings -> Household -> "Remember
  relatives who have passed" turns all of it off (the organizer's, like
  sharing). Migration 20261019233000_remembrance_undas.sql. Not checked: the
  push on a real phone; a relative who is also a Kin member (their tree
  entry follows their profile, so it takes no date of passing).
- **Done:** Potluck: who brings what, on an event (Kin Free). On a one-off
  event's screen, under Who's coming and above the thread: the household
  (not a child in kid view) lists what is needed in one box ("Pancit x2",
  up to 50 of a thing, 60 things); anyone who sees it taps "I'll bring it"
  and + / - for how many, never past what is wanted (the database locks the
  item, so two people can't take the last tray). A grown-up ticks "Ask
  linked households too": linked households then see the list and the
  event's name, date and host only (potluck_event), from a card on their
  Planner's Events and a Coming up line the week of it, and claim in their
  own name (names travel on the claim). Closed once the event is over;
  yearly events take none. The host's grown-ups may take a claim off.
  Migration 20261019233100_event_potluck.sql. No push yet: a claim tells
  nobody (the thread does that job). Not checked: two households on real
  phones.
- **Done:** Monito-monita draw (Kin Free): Planner -> Events -> Monito-monita
  (/planner/monito). A grown-up starts a draw: a name, a price cap, the
  exchange day (24 December to begin with), "Nobody picks someone from
  their own household" and "On the day, show everyone who picked whom"
  (both on to begin with). They ask linked households in; each household
  puts in its own people (a grown-up anyone, managed children too; a teen
  only themselves). The organizer household's grown-up draws, in the
  database (draw_gift_draw): one loop through everyone, so nobody picks
  themselves and no pick says anything about another; households kept
  apart whenever none is more than half. Each person reads only their own
  pick (a grown-up also their managed child's) behind a "Show my pick" tap,
  with that person's wish list; wish lists are read by their owner and
  whoever drew them, no one else, the organizer included. Draw again
  before the day; call it off. Migration 20261019233200_gift_draw.sql. No
  push yet. Not checked: three households on real phones.
- **Done:** Christmas gift and aguinaldo list (Kin Free, grown-ups only):
  Planner -> Events -> Christmas gifts and aguinaldo (/planner/gifts), a
  list per year. Add a person (someone at home, a relative, or an
  inaanak) with a budget; ideas in one box ("Lego set 1,200", "Aguinaldo
  500" is cash), ticked when bought; each card says bought of planned and
  what is left of (or over) the budget, and the top says the year's
  bought, planned, budget, people done and the aguinaldo set aside. A
  bought idea can be recorded in Wealth like other expenses ("Record",
  category Gifts, a new category), and the entry says "Christmas gift" or
  "Aguinaldo", never a name. Children never see the list; anyone on it
  never sees their own row or its ideas, a grown-up included. Migration
  20261019233300_gift_list.sql (also adds gift_list_items to
  wealth_transactions' source_table check). Not checked: a real phone.

## Approved 19 October: four for money and health (Jonathan)

Each its own pull request, in this order. No new Kin Plus gate and no paid
service or AI key: each lives where its area already is (Wealth is Kin
Plus at the database, so items 1 and 3 are for households that have it).

- **Done:** Sinking funds (Wealth -> Assets & liabilities -> Savings goals).
  A savings goal can be "Every year" (goals.repeats_yearly), with quick
  picks for tuition, car registration, an insurance premium and Christmas.
  Each dated goal says what to set aside a payday (kinsenas: the 15th and
  the month's last day) and a month to have it by the date, and whether it
  is on track: by each payday a steady saver has that many shares of the
  target (lib/sinking-fund.ts). Contributions are the same "Put money in"
  ledger movements as any goal. "Paid it" (from a month before the date)
  takes the money back out of the goal into the paying account and records
  the payment there in its category, so the account ends where it was and
  the month's spending shows it; a yearly fund then moves a year on (and
  its calendar event with it). A yearly fund whose date passes unpaid says
  so rather than moving on. Migration 20261019235700_sinking_funds.sql
  (one column, no policy change); logic e2e/sinking-fund.logic.spec.ts.
  Chosen: kinsenas rather than a per-goal pay rhythm, since income
  schedules carry no payday frequency.

- **Done:** Shared costs between linked households (Family -> Shared
  costs, /family/shared-costs): siblings sharing a parent's costs, Lola's
  medicines and check-ups. A grown-up starts a pot with households theirs
  is linked to (every pair in the pot must be linked; up to eight). Each
  household records what it paid ("We paid a cost") and payments it made
  to another ("We paid them back"); shares are equal or weighted in parts;
  Kin shows each one's share, who owes whom and the fewest payments that
  settle it (lib/shared-costs.ts, centavo-exact). Only the grown-ups of the
  households in a pot see it, and only while theirs is still linked with
  every other in it: revoking a link hides it at once. Names travel on the
  rows; create_shared_pot() and set_shared_pot_share() are definer
  functions that re-check the caller. Each household takes back only its
  own entries; the household that started a pot can delete it until
  another has recorded in it. A record only: Kin moves no money. No push
  to the other household yet. Migration 20261019153000_shared_costs.sql;
  probe shared-costs.mjs; logic e2e/shared-costs.logic.spec.ts.

- **Done:** Monthly money recap (Wealth -> Cash flow -> Monthly recap,
  /wealth/recap?month=YYYY-MM; grown-ups). Rule-based, no AI
  (lib/money-recap.ts): spent against budget by category (over flagged),
  the biggest changes from the month before (at least P500 and a fifth,
  three at most), bills that fell due (on time, late, not paid), what went
  into each savings goal, and net worth from the viewer's own monthly
  snapshots (shown only when both months have one). Transfers are not
  spending; money into a goal is savings; a sinking fund's payment is
  spending. Read in the viewer's own session: only accounts they can see,
  their own private ones left out if they chose that for All; bills paid
  from an account they cannot see are left out. On the 1st from 08:00
  (household zone) each grown-up of a household with Wealth that recorded
  money that month gets a push naming the month only -- no amounts, since
  the sender reads every account -- that opens the page; Settings ->
  Notifications -> Monthly money recap turns it off. Migration
  20261020001000_money_recap_push.sql (due_money_recap_reminders); probe
  money-recap-push.mjs; logic e2e/money-recap.logic.spec.ts; render
  e2e/money-recap.spec.ts.

- **Done:** Doctor-visit sheet (a person's Health -> Doctor-visit sheet,
  /family/members/<id>/visit-sheet). One page for a check-up: allergies
  (always, "None recorded" if empty), blood type, usual doctor, medicines
  being taken now with dose and times, ongoing conditions, the latest of
  each reading in 90 days with two before it (steps left off), illness log
  entries from 60 days, lab results from 6 months, and for a child under 18
  the vaccines given and due now (lib/vaccine-schedule.ts). The family's
  questions to ask are kept per person (health_visit_questions): add, edit,
  tick once asked, remove; an unasked one waits for the next visit. Share
  sends it as text, Print prints it (controls and ticked questions left
  off). Every row is read as the viewer, so a parents-only or private
  record is on it only for someone allowed to see it. Grown-ups and the
  person themself; another child is shown "For grown-ups"; kid view never
  reaches it. Kin Free (medicines, readings and illness are Kin Plus data,
  so on Free those sections are empty). Migration
  20261020002000_visit_questions.sql; probe visit-questions.mjs; logic
  e2e/visit-sheet.logic.spec.ts; render e2e/visit-sheet.spec.ts.

## Approved 19 October: three from the 14 October "What's Left" review (Jonathan)

Each its own pull request, in this order.

- **Done:** Year book for Christmas (Journal, Kin Plus): /journal/year-book,
  from the Year book chip beside Milestones. Pick the year; every ★ milestone
  is ticked, then the 40 photo entries with the most reactions (then the
  most photos); untick anything. Preview draws the pages; Make the PDF draws
  them at A4, 200 dpi, one JPEG a page, and hands the file to the share sheet
  or saves it. Cover (the first milestone's photo), a page per month, one
  page per entry (date, title, ★, up to four photos, the words, who was
  there), an end page. Household-journal entries only, read with the
  viewer's own client, so nothing they can't open goes in; "Just me" entries
  stay out. Made on the phone, never stored, so no storage is used. No
  library: lib/year-book.ts writes the PDF. No print partner. Kin Free sees
  the Plus note instead. Not checked: a 60-page book on an older iPhone
  (memory), a Drive-backed household's photos.
- **Done:** Import or export a tree file (GEDCOM 5.5.1, Family -> Tree,
  Kin Plus, grown-ups): /family/tree-file, linked under the tree. Export:
  the household's tree and the linked branches it already reads (joined
  once, as "Show their side" does). Anyone who may be alive (no death
  recorded; born in the last 110 years, or birth unknown) goes out as a
  name and a birth year only, Kin's rule for what leaves the household.
  Import: the file is read in the browser and everyone in it is shown;
  who is already on the tree is found by the "Is this the same Stella?"
  rule (same name, and the same full birth date or the same four parents'
  names), then their parents and spouse with the same names (as
  matchBranch), so a file imported twice adds nobody. "Not the same
  person" and unticking change it; nothing is written until "Add". People
  already on the tree only gain a parent or spouse they had none of. Loose
  dates ("ABT 1920"), places and deaths go into notes, since dob is a
  date. Up to 1,000 people a file. No migration (lib/gedcom.ts,
  lib/actions/gedcom.ts). Not checked: a real MyHeritage, FamilySearch or
  Ancestry export, or an ANSEL-encoded (old) file, which reads with its
  accents garbled.
- **Done:** Shareable check-up result image (Kin Free): "Share your
  result" on the check-up's results page draws a 1080x1350 card on the
  phone in the page's own colours: the score and its category (ticked to
  begin with), the family profile and tagline only if ticked (Janine took
  the profile off the page itself on 19 October), Kin's name and the
  /?start=quiz link. None of the answers. The preview is the picture
  itself; "Share the picture" sends a PNG to the share sheet with a line
  and the link, or downloads it. Nothing is sent by Kin
  (lib/check-up-share.ts, components/welcome/share-result.tsx). Not
  checked: Facebook's in-app browser's share sheet on a real phone.

## Agreed 14 October: the top 10 from the review (Jonathan)

Jonathan picked the free items of the review's top 10
(https://claude.ai/artifact/NP1D1E7BMNpfAty9BnSRMM). Each is its own pull
request, stacked in this order. "Who's coming" and the event thread were
already built by Janine (#618, #621), and so was saving a recipe from a
link (#630); Ask Kin's 2 a.m. answer and receipt
scanning wait for the AI key.

- **Done:** Missed-dose alert to a family member (Medfriend): a grown-up
  names one grown-up with a login and a delay (30 min / 1 h / 2 h) on a
  medicine. One push per untaken dose, from the reminders job, in the
  household's zone and respecting the Health switch. Doses before it was
  turned on are never reported. The card says who is told. Plus area.
  Migration 20261014200000_missed_dose_alerts.sql.

- **Done:** Pills left and refill: optional on-hand count, unit and per-dose
  amount on a medicine. On hand = count minus doses ticked Taken since it
  was counted, never counted down. The card shows days left. At 7 days or
  fewer, the reminders job adds it to the To-Buy list (Personal Care,
  "<medicine> · for <name>, refill") unless an open item is there, and tells
  the grown-ups once per supply cycle. Refilled takes a new count or adds a
  box. Plus area. Migration 20261014201000_medicine_supply.sql.

- **Done:** Prescription photos on a medicine (15 October, Janine): on a
  medicine's card, "Add the prescription" opens Scan (the phone's camera)
  and Upload. Up to 6 photos per medicine, seen by whoever can see the
  medicine, in its own household only. Kin Plus, like medicines. Migration
  20261015130000_medicine_prescription_photos.sql.

- **Done:** Kid's vaccine schedule (15 October, Janine): a Vaccines
  segment on a child's Health page (child role, birthday, under 18). The
  DOH EPI schedule plus the usual PPS extras are data in
  lib/vaccine-schedule.ts with their sources; done / due / past due / later
  against the vaccinations recorded under Conditions (any of a vaccine's
  usual names, doses in date order). "Mark as given" adds an entry the way
  the Add form's Vaccination does. The next dose shows in the Health tab's
  "This week" for 90 days from its age. Says it is a guide, not medical
  advice. No migration. Not checked: the PPS ages against this year's
  printed schedule.

- **Done:** Hey Siri, add to the list (14 Oct): "Add to Kin" iPhone Shortcut
  posts spoken words to a private per-member add-to-list link (separate from
  the brief link, hashed in list_add_tokens); add_to_list_by_link() adds up
  to 20 items to the owner's household; words split on
  commas/and/at/saka/tsaka via lib/list-add.ts + quick-line readShopping;
  setup steps in Settings -> Action Button & widget. Branch kin/siri-add-to-
  list, migration 20261014202000_list_add_link.sql.

- **Done:** Stories on the tree (14 October, kin/tree-stories,
  20261014204000_tree_person_stories): photos, scanned papers and recorded
  stories (with on-device transcript) on anyone on the tree, at
  /family/stories/<person>, with a count on the tile and a Stories row in
  the panel and on a member's profile. Household only, Kin Free, files under
  <household>/stories/ counting toward storage. Grown-ups and teens
  (child_self, not kid view) add; the author edits; author or a grown-up
  deletes. Removing a person cascades their stories; children cannot remove
  someone who has stories. Open: testing a long recording on a real iPhone.
  Since 19 October (kin/tree-stories-shared, 20261019211500): a per-story
  "Share with linked households" switch, off by default, set by whoever
  added it. A shared story shows, read only, on the stories page of a
  linked household that has matched the person on its own tree
  (linked_tree_stories / linked_tree_story_files; one storage policy for
  that story's files); unticking, withdrawing the match or revoking the
  link closes it at once. A push ("journal" switch) to the rest of the
  household when a story is added, and to the matched households when one
  is shared, each opened at their own person.

- **Done:** Family recipes on the tree (19 October, kin/recipes-on-the-tree,
  20261019152700_recipe_tree_person): a recipe in the Meals book can say
  whose it is ("Whose recipe", anyone on the tree, a relative who has passed
  included), shown as "Lola Remedios's recipe" on it, and listed as "Lola's
  recipes" on their panel on the tree, their profile and their stories page,
  each opening the book at that recipe (/household?seg=meals&recipe=<id>).
  Taking the person off the tree keeps the recipe without the name. Kin
  Free; household only, on family_recipes' existing policies.

- **Done:** Vault emergency access (14 Oct): a household names up to 2
  trusted grown-ups from linked households (Settings -> Privacy & lock),
  with a 1/3/7-day wait. The trusted person asks with a reason; grown-ups
  get an urgent push at once and daily, and can Deny or Allow now. If nobody
  denies, access opens read-only for 30 days or until revoked; every item
  opened is logged for the household. Kin-stored documents only; Drive is
  excluded. Migration 20261015120000_vault_emergency_access.sql; probe
  vault-emergency-access.mjs. On dev, the card is checked weekly
  (e2e/this-week.spec.ts); naming someone and asking need a linked
  household, so they are under "Needs a real phone".

- **Done:** Helper access (14 Oct, kin/helper-access): grown-ups add a
  kasambahay/yaya/driver in Settings -> Household with three switches (To-
  Buy list, meals, children's plans) and a one-time 7-day helper link + QR.
  Helper signs up through the normal account screens, accepts at
  /helper/accept and uses /helper (outside the app layout): tick/untick/add
  on the open list, today's and tomorrow's meals, children's plans for those
  two days. Not a member; household_helpers + security-definer functions
  only (20261015121000). Removal ends access at once. Kin Free.
  Follow-ups done 19 October (kin/helper-followups, 20261019212500): the
  helper's plans come from lib/activity-repeat.ts, as the Planner's do; the
  To-Buy list is live on both the family's and the helper's screen (an
  empty nudge on the private Realtime topic buy-list:<household>, sent by a
  statement trigger on buy_items, heard by members and helpers who can see
  the list); and "Tell me when the family adds to the list" on /helper, the
  helper's own opt-in per phone (helper_push_subscriptions), pushed when a
  member adds a line by hand, as the family's own "Added to the list" is.
  Since 19 October (Jonathan: "both for plans") the plans switch shows the
  whole family's plans too -- "Whole family" ticked, or tagged to nobody --
  beside the children's; a grown-up's own stay hidden (helper_family_plans,
  20261019090000).

## Agreed 19 October: from the 14 October "What's Left" review (Jonathan)

Four free items, each its own pull request.

- **Done:** To buy from a chat message: a message's Make it row offers "To
  buy" beside Task, Event and Expense. "pabili ng gatas at itlog" reads as
  gatas and itlog (new lines, commas, "at", "and", "&"; "pabili (po) ng",
  "bili", "buy" and a pasted list's bullets dropped; "rice 2kg" read the
  way quick add reads it, lib/list-add.ts readWrittenList). A sheet shows
  the lines for a quick edit before anything is added. Replaces the old
  one-tap "Buy list" chip, which added unseen.

- **Done:** "Nakarating na ako": a button on Today and in Kid view, and an
  Action Button menu item (/go/arrived), reads the position once at the tap
  and posts "Lia is at School, 7:12 AM" to the household chat with an
  arrival push: the saved place it is inside (Who's where's rule), else a
  map link. Nothing is stored but the message (no member_locations write),
  so it works without sharing on and leaves no trail (lib/arrived.ts).

- **Done:** My notes (`personal_notes`): /notes lists the person's own
  notes with write, search, edit and delete; Today's quick add has "Note"
  (/notes?new=1) and Kid view "My notes". Author-only was already the
  table's policy (no migration); probes/personal-notes.mjs proves a parent,
  child, linked household and stranger see and change nothing of another's.

- **Done:** Password health in the Vault: after unlocking, grown-ups see
  which passwords are reused, easy to guess, or in known breaches, each
  with "Change it" (opens its edit form). Breach check on the phone via the
  Have I Been Pwned range API: SHA-1, only the first 5 hex characters sent
  (padded), nothing stored. Door and gate codes are only flagged when
  reused or plainly guessable, never sent (lib/password-health.ts). Not
  yet tried on a phone against the live API.

- **Done:** The Planner groups its days in the household's zone (19
  October, kin/planner-household-zone): the calendar's week rail, month run,
  year counts, headings and "today" are household days (lib/planner-days.ts),
  never the server's clock; familyInstant keeps a wall-clock time across a
  daylight-saving change. Tested under four process zones
  (e2e/planner-days.logic.spec.ts). See KNOWN_RISKS "The Planner groups its
  calendar in the household's zone".

## Agreed 19 October: easier to use, faster, and offline (Jonathan)

Four free items, each its own pull request, in this order.

- **Done:** Simple Kin, for grown-ups over 60: Settings -> Appearance ->
  Simple Kin, a per-person switch (members.simple_mode, 20261019235700).
  On, it raises their text size to at least 130%, makes buttons, icon
  buttons, chips and fields bigger across the app (.kin-simple), and Today
  becomes four things: their own medicines to tick with big ticks, today's
  plans (no bills or the shopping row), Message the family plus Call and
  Video for each person with a Kin to ring, and a large SOS. Kid view wins
  where both are on. iOS Dynamic Type: on an iPhone set to a larger text
  size than Kin's slider, Kin follows the phone (only ever larger), layout
  switches included (lib/text-scale dynamicTypeScale). Set by the person
  themself; a grown-up cannot switch it on for someone else yet.

- **Done:** Accessibility sweep (#707): 44px tap areas on touch, a focus
  ring every theme can see, and every colour theme passing axe as its member
  sees it. Details under Done below.

- **Done:** Speed pass for a mid-range Android on 4G (#710): the shell every
  page loads 247 -> 176 KB, Today 280 -> 208 KB. Details under Done below.

- **Done:** Offline ticks for medicine doses and chore done/approve (#709),
  Simple Kin's big dose ticks included. Details under Done below.

## Agreed 19 October: leaders' features for a Filipino family (Jonathan)

From the 14 October "What's Left" review. Three items, each its own pull
request, in this order.

- **Done:** Allowance and alkansya, in pesos (Kids, Kin Free). A grown-up
  sets a child's weekly baon and its day, a split into gastos / ipon /
  bigay (default 70/20/10), what a chore point is worth in pesos, and an
  interest rate on ipon. The baon pays itself on its day (written by
  alkansya_pay_allowances() before the jars are read, up to twelve weeks
  caught up, never back pay before the plan existed or while paused).
  "Change points" turns points into pesos split the same way; those points
  are spent like a reward. Grown-ups add money, record spending (gastos or
  ipon) and giving (bigay), add interest, and take a line off; a jar never
  goes below nothing. A child sees their own alkansya (kid view's Today and
  /planner/alkansya/<them>) and no sibling's, and writes nothing. Says on
  screen that it is a record of cash at home and moves no real money.
  Migration 20261019100000_alkansya.sql; probe alkansya.mjs; logic
  e2e/alkansya.logic.spec.ts.

- **Done:** Utang and paluwagan (Wealth, Kin Plus), at /wealth/utang.
  Utang: money lent to or borrowed from a relative, with partial payments
  (never more than the amount), a due date, a note; owed-to-us and we-owe
  totals. Paluwagan: name, hulog per member, weekly / twice a month
  (kinsenas) / monthly, first round, members in turn order with the
  household's own slot; each round shows its date, whose pot it is, and a
  tick per member's hulog (/wealth/paluwagan/<id>). Each entry is
  "Household grown-ups" or "Just me" (the recorder only; only the recorder
  can switch it); children never see either. Reminders are opt-in per
  entry: Kin writes a polite Taglish message (lib/utang.ts) for the
  grown-up to Share or Copy themselves -- for money lent and still owed, and
  for a due hulog not in yet -- and never contacts anyone. Migration
  20261019110000_utang_paluwagan.sql; probe utang-paluwagan.mjs; logic
  e2e/utang.logic.spec.ts.

- **Done:** Import a statement (Wealth, Kin Plus): "Import a statement
  (CSV)" on an account (/wealth/accounts/<id>/import), for whoever may
  write to it (grown-ups on a joint account, the owner on a personal one).
  Pick BPI, BDO, UnionBank, GCash or another bank and a CSV; it is read on
  the device (lib/statement-import.ts) and never uploaded or kept. The
  columns are guessed from the header (preamble lines skipped; debit and
  credit, or one signed amount; month-first, day-first or ISO dates) and
  can be corrected with a preview; the review screen lists every line,
  unticks those already in the account (same day, direction, amount and
  description, counted) and says why an unreadable line is left out. Only
  the ticked lines are sent, to import_wealth_transactions(), which checks
  the account, skips duplicates the same way and saves them in one go.
  Migration 20261019120000_statement_import.sql; probe
  statement-import.mjs; logic e2e/statement-import.logic.spec.ts.
  Waiting on the AI key: GCash only exports its history as a
  password-protected PDF, and reading PDFs needs Kin AI; a PDF picked now
  is told so. Not checked: the presets against a real download from each
  bank this month (the mapping step covers a changed export).

## Agreed 13 October: first open (Jonathan)

Why: not everyone who opens Kin came by referral or is sure they want it.
Today's home page asks them to set up their family from the first tap ("I
feel like I'm already committing ... I will stop the set-up and delete the
app"), and people are wary of automatic subscription payments. The new
order: a family check-up first, a graded result, a few slides, a plan, the
least setup possible, then a guided tour. It will be advertised on Facebook,
so it has to work inside Facebook's in-app browser. Shared state lives in
`src/lib/first-open.ts` (browser only, never sent: answer 9A).

**Group A: the public check-up (signed-out `/`).** Replaces today's
name / who / wants / tour / why steps (answer 13).
- First screen (typed-in visitors): the 3D house, "Take the 1-minute family
  check-up", "I have an invite code", Sign in. `/?start=quiz` (the link ads
  will use) opens straight at question 1. People with an invite link never
  see the check-up.
- Nine questions, one per screen, progress bar, Back, can't-answer-wrong:
  1. Who's at home? (many) Partner, Kids under 13, Teens, Lolo/Lola,
     Kasambahay/yaya, Someone working abroad, Just me for now.
  2. How many apps does your family use to stay organised? 1, 2-3, 4 or
     more, We don't really.
  3. Your top 3, in order (tap order is the rank): Health & medicines,
     Documents, Emergency info, Kids' safety & location, Plans & schedules,
     Groceries & meals, Money & bills, Family memories.
  4. If someone got sick at 2 a.m., how fast could you find their
     allergies, medicines, blood type and HMO card? Under a minute, I'd
     have to look, I'd have to ask someone, I couldn't.
  5. Where are the PSA certificates, passports and insurance policies? One
     folder at home, Photos on someone's phone, In the cloud, All over the
     place.
  6. When the kids are out, how do you know they're okay? (skipped when Q1
     has no kids or teens) They message me, I keep calling, We use a
     location app, Honestly, I worry.
  7. What takes the most back-and-forth at home? (up to 3) Groceries &
     meals, Chores, School & schedules, Bills & budget, Savings goals.
  8. What would your family actually use in a family chat? (many) Photo
     albums, Polls, Voice/video calls, A shared journal of events, An AI
     helper that knows your family's info.
  9. How do you feel about AI helping your family? Ready to try, Curious
     but privacy first, Not for me.
- Grading (answer 3A): a Family Readiness score out of 100 with a label
  (0-39 Getting started, 40-69 On the way, 70-100 Well connected) and five
  bars: Health & safety (Q4 + emergency), Documents (Q5), Kids & location
  (Q6), Running the home (Q2, Q7), Staying close (Q8). The top 3 weigh
  most. Fixed rules in the browser, no AI, unit-tested. Every line is "the
  easy win", never "you're failing".
- Results page: score and label, the five bars, for each of the top 3 "You
  said X -> in Kin, Y" naming the real feature, "One app instead of N" from
  Q2, and the privacy line when Q9 is "privacy first" ("Private to your
  family. Nothing is sold, and your records never train AI."). Then "See how
  it works". (A shareable result image: built 19 October, see above.)
- Showcase (answer 5): three slides from the top 3 plus one "one app,
  private to your family", each a real phone screenshot of the sample
  household (QA_HOUSEHOLDS.md), swipeable, skippable.
- Plan step (answer 6A): "Start with Plus free" (highlighted) or "Just Kin
  Free". Both start the same 7-day trial; under them, plainly: no card, no
  automatic payment ever unless you subscribe yourself, a reminder on the
  last day, do nothing and you move to Kin Free and keep everything. Prices
  from plans.ts: ₱149/mo or ₱1,490/yr. The choice goes into first-open and on
  to sign-up. Then "Create your account".

**Group B: the least setup (watched account screens).**
- Sign-up: email and password on one screen, then a 6-digit code typed on
  the same screen (Supabase email OTP, `verifyOtp` type `signup`) instead of
  the link, which opens outside Facebook's browser and loses the session.
  Changing the email template on dev and production is Jonathan's or
  Janine's step: the PR body gives the exact dashboard links (ask-a-person).
  Until the template carries the code, the link must keep working.
- One setup screen: your name and family name, Country folded away
  (Philippines by default), the Kin code tucked away as now. Then Today.
  Birthday, mobile, the surname suggestion and the members screen leave the
  path (adding kids and inviting a partner are Start here steps); the
  surname suggestion moves to Settings beside the household name.
- The plan chosen is saved on the household (`families.chosen_plan`, set by
  the create function, readable like the rest of the family row) and only
  changes the trial card's and reminders' wording.
- No "Sign in with Google": Google refuses it inside Facebook's browser.

**Group C: inside the app (Today, Settings).**
- Guided tour (answer 8A): 4-5 spotlight steps on the real Today (Today,
  Planner, Chat, Family/Health, Ask Kin), skippable, shown once per member,
  "Show me around" in Settings replays it. Built in-house, no new library.
  Built 13 October (guided-tour.tsx, e2e/guided-tour.spec.ts): shown by
  itself to members who joined from that day; "seen" is kept on the phone
  per member, since no per-member setting on the server fits it.
- Start here follows the top 3: health first adds "Add allergies and blood
  type", kids "Turn on location sharing", emergency "Fill in the emergency
  card", documents "Add one PSA certificate" (vault: Plus, which the trial
  has). Invite partner and add the kids stay. Built 13 October: the top 3
  never leaves the phone, so the server sends every step and the card picks
  and orders them (a step moves up with its priority's rank).
- Trial bonus (answer 6, revised by Jonathan the same day): 7 days, and a
  household that tries every part of Kin in its first 5 days gets 7 more,
  once (14 in all). Eight actions, one per page, the same for everyone and
  ordered by the top 3: a plan, the grocery list, a family chat message, a
  journal entry, a medicine or reading (Plus), a vault document (Plus), a
  bill or account (Plus), a Kin AI question (Plus). Half are Plus so the
  family's own records are in Plus areas when the trial ends. Checked from
  the records by security-definer functions; inviting a partner and adding
  the kids stay on the card under "Also" but don't count. Kin's own offers
  wait while the checklist is open, and the Plus trial card stays hidden
  then (its three are among the eight). Built 13 October: 20261013160000,
  then 20261013180000; probes/start-here-bonus.mjs.

**Not now: the ad stage (answers 10 and 12).** Set up once the app is
done: the Meta pixel and Conversions API on the public pages only, after a
consent banner; anonymous per-screen drop-off counting; a privacy notice
section naming Meta; campaigns (Philippines broad, a separate OFW one,
quiz/pain/OFW creatives in Taglish and English). Kin no longer promises "no
ads" (answer 10: running costs may need some revenue); as few ads inside
the app as possible. The copy promising none was removed 13 October.

## Agreed 30 September: chat competitive with Telegram

Jonathan approved ten chat features, each its own pull request, in this
order. Already in Kin before this list: replies, reactions, edit, withdraw,
one pin, "seen by", typing and @mentions in the household chat; replies,
reactions and "Seen" (one to one) in the family room, one to one and groups;
search across every chat.

1. **Done: reply and forward.** A quote in the family room, one to one and
   groups now jumps to the message it quotes, as the household's always did.
   Forward sends any message (words, photos, videos, voice notes; not polls)
   to up to five conversations at once, labelled "Forwarded from Mama".
   Files are copied into the forwarder's own chat folder, so deleting the
   original never empties a forward.
2. **Done: reactions on every message.** The six (👍 ❤️ 😂 😮 😢 🙏) were
   already the journal's and every chat's; the conversation between two
   linked households now has them too (tap a message).
3. **Done: edit and unsend in every conversation.** Tap your own message in
   the family room, one to one or a group: Edit (shows "edited") or Unsend
   (everyone sees "Message removed"; its photos go too). The household chat
   already had both; its "withdrawn" now reads "removed" and its Delete
   reads Unsend. No time limit, as in the household chat. A group admin's
   Delete on someone else's message is unchanged.
4. **Done: pin a message in every conversation.** Tap a message in the family
   room, one to one or a group: Pin. The most recently pinned shows at the
   top ("pinned by Ben"); tap it to jump there, Unpin to clear it. Anyone who
   can read the message may pin it; in an announcement channel, admins only.
   The household chat keeps its one pin.
5. **Done: "seen by" and typing in every conversation.** Groups now show
   "Seen by Mama, Lola" under your newest message anyone has read (one to one
   already showed "Seen"; the household chat already had seen-by). "Mama is
   typing…" shows in the family room, one to one and groups, as a broadcast on
   the private channel -- nothing is stored. (It was presence until 12
   October; Realtime closes a channel after five presence updates in thirty
   seconds, which a few quick messages reached, and every live update in the
   room stopped until a reload. chat-live.spec.ts found it.) The family room keeps no seen-by
   (too many households for it to mean anything), and its typing line shows
   your own household only, because each household has its own channel.
6. **Done: @mentions that notify, in every conversation.** Type @ in the
   family room or a group to name someone who writes there (or any group
   member); a message naming you is highlighted. The person named gets
   "Mama mentioned you" as its own notification instead of the plain one --
   in the household chat too, where mentions used to notify nobody specially.
   A muted conversation or chat notifications turned off stay silent for
   mentions as well. One to one has no mentions (it is only the two of you).
7. **Done: search inside a conversation and across chats.** The family
   room, one to one and groups get the household chat's Search (words and
   voice-note transcripts of what is loaded; tap a result to jump there).
   Search across every chat (/chat/search) already existed; its results now
   open the conversation at that message instead of at the bottom.
8. **Done: Saved messages.** A note-to-self conversation in the chat list,
   under home and Family: words, photos and videos only you can see (not
   your household, not a parent). Forward anything from another chat to
   "Saved messages" to keep it; forward from it to share later. It belongs to
   the person, so it goes with them to a household of their own.
9. **Done: polls in any group.** The poll button beside the camera in a group
   (in an announcement channel, admins): a question, 2 to 10 answers, one or
   several choices. Everyone in the group votes (channel members too), sees
   the count and who chose what, and can change or take back a vote. The
   household chat keeps its own polls. The family room and one to one have
   none (the family room reaches too many households; one to one is two
   people).
10. **Done: scheduled messages.** Type a message, tap "Send later", pick a
    day and time: it waits (listed above the message box, with Cancel) and
    is posted as you within five minutes of that time, in any conversation,
    with the usual notification. It rides the reminders pipeline (pg_cron
    every five minutes -> /api/cron/reminders), so it needs the same
    kin_cron_url / kin_cron_secret as reminders -- already set wherever
    reminders work. If by then you may no longer post there (left the
    group, connection removed), it is not sent.

**Live on the other screen: checked in CI (12 October).** `e2e/chat-live.spec.ts`
opens one group chat as two people in two browsers (the QA account and its
partner) and checks typing, a new message, an edit, a pin, an unsend, a poll
vote and a reaction each reach the other screen without a refresh. It runs in
e2e.yml on every pull request, because an agent sandbox cannot open
WebSockets. A read is pushed live too (a broadcast once it is written), so
"Seen" and "Seen by" appear while the other person is looking -- checked by
the same spec.

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
   goals fix). Private notes have their screen, My notes (/notes, 19
   October); the journal's Mine tab (item 3) is where personal entries get
   written.
2. **Done: household name from both surnames, as an editable suggestion:** the
   wife's maiden surname and the husband's surname, the Filipino way
   ("Santos-Reyes Household"). Never forced (single parents, grandparents
   raising grandchildren, blended families).
3. **Done: journal in three layers.** Tabs Mine / Household / Family feed (+
   Gallery). A personal entry can be added to the household journal and shared
   to the family feed. A milestone becomes a ★ mark on an entry, with a filter
   chip; existing milestones move over. Feed is photo-first with reactions and
   comments; the "link a household" panel shrinks to one line. (#335 layers,
   #341 milestones as ★ entries, and the feed; docs/PERSONAL_SPACE.md.)
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
7. **Done: birthday and anniversary moments** in the family feed. **Plus
   (Jonathan):** every relative who sees the card sees every greeting, under
   the greeter's full name (who remembered is the point; which household does
   not matter), and the family whose day it is can mark it a ★ milestone --
   never automatic, since some birthdays are celebrated more than others.
   A greeter's name opens their profile -- in your own household, their full
   one; in a linked household, a read-only relative's page (name, photo,
   cover, "Show in the tree" when they are in a joined branch, Message to
   their household, and what they have already shared; nothing from About,
   no health, documents or money).
8. **Done: a Sunday "week ahead" push** (with its own switch).
9. **Done: streaks for kids' chores** (bonus star at 7 and 30 days, one freeze a week).
10. **No Filipino interface.** Kin AI keeps understanding and answering
    Filipino / Taglish, as it already does.

Also agreed the same day and done: **Today as one list** (see Done).

## Agreed 30 September (Jonathan)

One pull request each, in this order.

1. **Done: Philippine public holidays** on the Planner (calendar and agenda,
   with its own "Holidays" switch in the legend) and on Today ("Monday is a
   holiday — Bonifacio Day"). From Nager.Date, free and keyless, cached for a
   day; the fixed-date holidays stand in if it is down. No Done or Skip, like
   birthdays. Kin adds a late Palace proclamation by hand in
   `KIN_SPECIAL_DAYS` (src/lib/holidays.ts), and a grown-up adds the
   household's own (a late proclamation, the town fiesta) in Settings →
   Household (household_special_days, 20260930171000).
2. **Done: invite by QR code**, wherever the household's invite code is shown
   (Settings → Household, and adding members while setting up). Drawn in the
   browser by qrcode-generator (no dependencies), so the invite never goes to
   a third party. Save image shares a PNG where the phone has a share sheet
   and downloads it where it does not. The family tree's invite-a-relative
   button is left to the family tree work.
3. **Done: address search**: type-ahead on the Planner's task and routine
   location fields and the family address form (a pick fills street,
   barangay, city, province, zip and country). From OpenStreetMap's Nominatim
   through Kin's own route, /api/places: members only, one request a second
   per server, each answer cached for a day, leaning to the Philippines.
   Typing freely still works. Events and trips have no location field, so
   they have no search.
4. **Done: weekly family digest** at /today/week, opened from "Your
   family's week" on Today (Saturday to Monday): the week's household photos
   and journal (★ milestones first), chores kept up (streaks of three days
   or more), goals, and next week's plans. Only household entries, never a
   "just me" one; goals as getGoals already shows them to that reader; next
   week by Today's rule (own, whole family's, and a grown-up sees the
   children's); in kid view no money goals and no bills. The Sunday
   week-ahead push (#307) opens it (20261006100000).

## Final stage: everything that costs money, done together

Jonathan, 29 September: every paid switch waits for the final stage and is
done in one go. All the code is built; each is a key or an account. Steps in
docs/SETUP_FOR_JONATHAN.md.

- **Kin AI and flyer scanning: `ANTHROPIC_API_KEY`** (SETUP section 4).
  Until it is set, Ask Kin says it isn't configured and scanning is off.
  Pay-as-you-go with a monthly spend limit in the Claude Console.
- **Payments: PayMongo or HitPay (GCash, Maya, cards)** (SETUP section 5,
  docs/PAYMENTS_OPTIONS.md). Merchant account and keys. Start with the
  subscription checkout in `src/lib/billing/`; that path is watched.
- **Business registration for the legal pages** (DTI business name, BIR),
  which the payment providers also ask for. The details go in
  `src/lib/legal.ts`; until then the pages say "Being registered".
- **Done (20 October):** Kin AI switched from Opus to Haiku 4.5, the model
  named once in `src/lib/kin-ai.ts`; the monthly spend cap is a Console
  setting for Jonathan when the key is added (SETUP section 4).

## Native app stage

- **Home-screen and lock-screen widgets for shared lists and Today** (needs a
  native app; approved 30 September).

## Design finalization

Held until the design is final (Jonathan, 29 September).

- **GIFs in the chat (GIPHY).** Built (#354); needs a free GIPHY key, steps
  in docs/SETUP_FOR_JONATHAN.md section 6. Until then the GIFs tab says
  "coming soon" and stickers work as they are.

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
    mobile data -- docs/SETUP_FOR_JONATHAN.md section 2.
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
    reminders (Next up), which run every five minutes.

Decided against in the same review: revising Journal (item 6) and Planner
(item 7). Done already: no hub numbers and no "five ledgers" motto (item 9,
#209).

## Done

- Vercel builds only what the app is built from (#716, 19 October): docs,
  tests, migrations, any .md and everything outside kin/ skip the preview
  build (kin/scripts/vercel-ignore.sh), so the Hobby plan's 100 deployments a
  day go to app changes; production on main still builds whenever app files
  change, and anything the script can't compare builds. A branch's first
  deployment compares with where it left main, fetched from the public
  repository when Vercel's clone has no origin to fetch from (#720 found
  that path always built). What GitHub shows for a skipped build is checked
  on the first docs-only branch after #720.

- Also merged 14-19 October, without a line of their own above: suki and
  loyalty cards at checkout on the Buy list (#641,
  20261015090000_loyalty_cards.sql); cook mode and servings (#645) and
  planning a meal for N people (#654); repeating tasks on each day they fall
  on Today (#653), with the reminder pushes following them (#655,
  20261019090001_reminders_follow_repeating_tasks.sql); "Add to journal" on a
  past activity always keeps the entry (#652); the check-up result's
  Digital Blueprint, tagline and savings tip (#627, #629, #651, #658, #663);
  the three foreign keys from this week's tables indexed after Supabase's
  advisors were run on dev and production (#688,
  20261019140000_this_weeks_fk_indexes.sql); this week's new screens in the
  per-PR smoke tier (#687) and used once each as the sample household in the
  weekly check (e2e/this-week.spec.ts).

- Offline ticks for medicines and chores (Jonathan, 19 October; item 4 of
  "easier to use, faster, and offline"). Three more changes wait on the
  phone with no signal and replay on reconnect through app/api/offline/replay:
  a medicine dose ticked or unticked (Health), a chore marked done or skipped
  on the Planner for any day, and a grown-up's yes or no to a chore waiting
  for approval. Each shows "waiting to send" until then. Same rules as
  before (lib/offline/rules.ts): the later tick wins, an answer someone
  already gave stands, a second tick on the same dose replaces the first in
  the queue. The offline line on the Planner and a member's page says chores
  and medicine ticks wait. e2e/offline-ticks.logic.spec.ts; the Planner case
  end to end in e2e/offline.spec.ts.

- Speed pass for a mid-range Android on 4G (Jonathan, 19 October; item 3 of
  "easier to use, faster, and offline"). The JavaScript every page loads
  first went from 247 to 176 KB (gzipped); Today's from 280 to 208 KB.
  supabase-js left that first load: the call provider's realtime channel and
  the offline queue's photo upload now import it when they use it, as do
  the call video effects and the Ask Kin sheet. Held by
  e2e/bundle-budget.logic.spec.ts (the build, no server); timed under 4x CPU
  and Fast 4G by e2e/speed.spec.ts. Chat's thread was already mostly
  supabase-js, which it needs for live messages, so it barely moved.

- Accessibility sweep (Jonathan, 19 October; item 2 of "easier to use,
  faster, and offline"). On a touch screen every button, and every chip that
  does something, answers a finger 44px across through an invisible hit area
  (globals.css, "Tap targets"); nothing is drawn bigger. The keyboard focus
  ring is accent-700, not the accent (under 3:1 on ten dark themes). Every
  colour theme passes axe as a member on it sees Today (and Chat on Coral and
  Classic), in light and dark: five link colours moved a step, the overdue
  orange is 55% money colour, the SOS word and a late dose take the red into
  the text colour. Jump-to scrolls follow Reduce Motion. Held by
  e2e/palettes.logic.spec.ts, e2e/tap-targets.logic.spec.ts (the compiled
  stylesheet, no server) and e2e/a11y.spec.ts (seven pages plus a theme pass).

- Event and visit photos count against the storage allowance (6 October,
  #453): the photo strip on a calendar event or a doctor's visit asks
  /api/uploads/session like the journal and chat, so Kin Free's 1 GB and
  Kin Plus's 50 GB hold for them too.
- Tests for "Are you okay?" check-ins (6 October, #461): ask -> answer and
  who may see, ask and answer, in PGlite (probes/member-checkins.mjs), and
  the push each way in member-card.logic.spec.

- Videos from an entry's photos (Jonathan, 30 September): "Make a video" on
  an entry, or ticked when writing one, makes a wedding-style same-day edit
  on the phone -- a title card, each photo with a slow zoom and drift,
  crossfades cut on the beat, an end card, at most a minute, 720p, wide or
  tall. Three looks (Warm, Classic, Lively) and three tunes written for Kin
  in code and dedicated CC0, or none. Choose and reorder the photos, watch
  it before making it, cancel while it records. Kept as the entry's cover:
  it plays muted inline in Mine, Household, Public and the Family feed while
  on screen (not with reduced motion or Data Saver) and with sound when
  tapped; anyone who can see the entry can save it to their phone, and a
  household entry can be sent to the Family feed from it. Made in the
  browser with MediaRecorder (MP4 on iPhone and recent Chrome, WebM
  otherwise); nothing goes to a video service. Stored in Kin's journal
  storage under the household's (or, for Just me, the person's) folder,
  counted against the Free and Plus allowances; visible exactly where its
  entry is (20261006100500_journal_entry_videos.sql). **Needs a real
  iPhone to confirm** recording and the share sheet's Save Video.
- Family tree, redone after Jonathan's review (30 September; first pass
  #393 invented households from surnames and hashed their colours). One tile
  per person; only households that exist on Kin get a region: yours in the
  accent colour, a linked household in its own once it has confirmed a
  person. Relatives who are only a name have no colour and a dashed ring,
  and a legend says what each colour is. Parents never recorded as married
  sit together as co-parents (dashed line); a child with another partner
  hangs from the two parents they share ("Half-brother"). Opens on relatives
  to the second degree, with "Everyone" for the rest. A relative both
  households typed in is drawn once when "Show their side" is open. Answers
  to his questions (merging trees, big trees, fake trees, linked households
  not on the tree): docs/FAMILY_TREE.md. Since 6 October a relative who is
  not on Kin has a QR code beside "Invite to Kin" (the invite QR from #391,
  #455), and suggested matches ask "Is this the same Stella?", linking only
  once both households say yes (docs/FAMILY_TREE.md, step 3). Since 11
  October: at most 15 offers waiting on a household and 40 a day; a grown-up
  can block a household's offers (and undo it); a linked household's
  differing record of a shared person's parents is said under the legend, not
  drawn over yours; and a linked relative with a Kin account is filled in,
  one who is only a name there is a dashed ring. A look with real photos is
  under "Needs a real phone".
- Member card and Emergency SOS on Today (approved 30 September, #394).
  Tapping someone's initials opens their card: their local time and zone
  ("8:00 am in Dubai · 4 h behind you"; the zone is reported by their own
  phone into `members.timezone`), location and weather only while they share
  a location, their day and goals, spending this month (grown-ups only; their
  budget only on their own card, since `wealth_targets` is private), medicines
  due today (grown-ups, as Health allows), last active, and Call / Message /
  "Are you okay?" (one tap to ask, one tap to answer, a push each way). Your
  own card previews what grown-ups and children see. SOS: a pill on Today and
  kid view; hold 3 s, then a 5 s countdown with Cancel; an urgent push to every
  grown-up with the location if the phone allows; logged in `sos_alerts`;
  `/today/sos/<id>` has the map link, time, call buttons, "I'm on it" and
  "I'm safe now". 20260930100000; RLS verified on dev, rolled back. Since 6
  October the card's budget is the spending budget a grown-up sets in
  Wealth (member_budgets), not the private income target. **Decided
  (Jonathan, 11 October):** the card shows that budget only to the person
  themself; other grown-ups, and the "Grown-ups see" preview, see the
  spending without it. Wealth's "Spending by person" is unchanged.
- Offline mode (Jonathan, 30 September). With no signal Kin opens on a saved
  copy (app/offline): Today, the shopping list, this week's Planner, the last
  50 messages of the household chat and up to three other recent
  conversations, and every emergency card. Saved per signed-in user in
  IndexedDB, wiped on the sign-in screen and whenever someone else signs in;
  the vault, Documents and Wealth are never in it. Four changes queue while
  offline -- tick/untick, add to the list, mark a Today item or chore done,
  send to the household chat -- and replay in order on reconnect, once each
  (the phone's id becomes the row's id), with the conflict rules written in
  app/api/offline/replay. Rendered pages are no longer cached by the service
  worker. Since 6 October the live Today, shopping list and household chat
  queue the same four changes into the same queue when the signal drops
  (#460; words only in the chat, no files). The iPhone check is under
  "Needs a real phone".
- A promised goal reward is kept (Jonathan, 28 September). Locked: what a
  reward is never changes once asked for, the giver cannot take a promise
  back or delete the goal under it. A day: the one receiving it claims it
  when the goal is reached, and the giver has one day. Chased: past that,
  Kin pushes the giver every 5 minutes, 09:00-21:00 Manila, until the
  receiver confirms; "not yet" restarts it, and a given reward left
  unconfirmed for a day resumes it. Same rule for children. Today shows a
  banner that cannot be dismissed while a promise is due. The terms are
  shown wherever a reward is set, asked for or agreed to. A change to a goal
  with a reward in play needs the other side's yes, whichever side asks.
  20260929003000; supabase/tests/rls_goal_reward_assurance.sql (32 cases on
  dev, rolled back).
- Kin's own offers (approved 28 September): now and then Today offers a
  grown-up one small task for something the household hasn't used yet --
  finish your profile, the emergency card, a second grown-up, water three
  days, Google Calendar, a first goal, Kin AI, the vault (Plus households
  only) -- for 1-3 days of Kin Plus. One at a time, at most one new a day,
  none in the first week; take it (7 days to do it) or skip it (back in 30
  days). Kin checks completion from the data. Feature offers earn each once
  and at most 30 days a year. Inviting another family: 7 days when they
  name this family's code (their first 14 days, on Today), 30 more when
  they subscribe; outside the cap. Kin Free gets a taste of Plus; Plus with
  an end date is extended; paying or comped households bank the days
  (families.plus_credit_days) for when billing can use them.
  20260929020000; supabase/tests/rls_kin_offers.sql (dev, rolled back).

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

- Goals logged by hand (Jonathan, 13 October, item 1 of 3): every goal's
  card takes a hand entry, dated today or up to six days back. Each kind
  writes where Kin already keeps that number, so nothing counts twice: a
  glass (+ / −) is the same per-person daily count Today used; steps and
  weight are 'manual' readings in health_vitals beside Apple Health's.
  Steps are a day's total -- a second hand entry for the day replaces the
  first, and the day counts the higher of hand and Apple Health, never the
  sum (stepsForDay, e2e/goal-log.logic.spec.ts). Weight: the latest reading
  counts, whoever sent it. Undo takes back the latest hand entry of the
  week and never touches Apple Health's. Steps and weight logging stay Plus.
  The water tracker left Household → Meals (Jonathan, 13 October).
- Goals "Whole household" / "Just me" (Jonathan, 13 October): a personal
  goal's owner chooses, like a personal Wealth account; only a grown-up may
  hide one, a household goal never is, and someone setting a goal for
  another person cannot. Weight starts as "Just me", the rest as the
  household's. Private hides the goal, its entries, reward and change
  requests from everyone but the owner and the reward's giver -- held by
  the policies, so Today, the digest, Kin AI and the export cannot show it.
  Readings logged on a private goal are "Just me" in Health. A shared
  steps/weight goal fills through planner_goal_readings() even when the
  readings are private in Health: sharing a goal shares its numbers.
  20261013170000; probes/goal-visibility.mjs (25 cases, PGlite).
- Renewable goals earn points (Jonathan, 13 October): a daily, weekly or
  monthly goal can be worth points each time it is met, set by a grown-up
  on someone's goal (never a household or one-off goal). The owner claims
  the period once the ring is full ("Done today +5"); a grown-up's claim
  counts at once, a child's waits on Today's queue like a chore. Points go
  into the same balance (loadPoints, kind "goal") and a daily goal's run of
  claims earns the household's 7- and 30-day streak bonus; the card shows
  "🔥 5 days in a row". What a claim is worth is copied from the goal when
  made. 20261013171000; probes/goal-points.mjs (19 cases, PGlite).
- Where a goal fills from (Jonathan, 13 October, item 2 of 3): each card
  says it -- steps and weight from Apple Health ("last sent 2 h ago"),
  with "Connect Apple Health" to Settings → Connected when the owner
  hasn't; money from its savings goal on Wealth; water, gym and custom say
  plainly that no app sends them (goalSource). No new integrations.
- Daily goals on Today (Jonathan, 13 October, item 3 of 3): "Today's
  goals", after the Today list -- the viewer's own and the household's
  goals that move day to day (isEverydayGoal: daily goals but money, weekly
  gym and counts, one's own weight), each with its ring, the same hand
  entry as Planner (+ / − glass, the day's steps, a session, Undo) and the
  claim once met. Not yet met first; nothing to show, no heading.

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
  list empty Work and Government IDs. The React hydration mismatch on
  Planner → Tasks no longer happens: on 19 October a production build
  loaded every Planner tab (Calendar, Tasks with and without done ones,
  Events, Goals) as the QA household, browser in New York, with no console
  error at all.

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
  Event and visit photos count against the storage size too (#453).

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
- Remittance log for OFW families (Jonathan, 30 September). Wealth, Cash
  Flow, Income, "Remittances from abroad": what was sent and in which
  currency, the European Central Bank's peso value that day (Frankfurter,
  cached on the server; the Gulf currencies through their fixed dollar peg,
  the Kuwaiti dinar has none), the pesos that actually arrived, who sent it,
  who got it, how (bank, GCash, Maya, a remittance centre), and what it went
  to. A monthly total. When it landed in an account, the money-in appears
  there too, and removing the remittance removes it. Grown-ups only, and
  "Just me" keeps one to whoever logged it (it can then land only in their
  own account). RLS: npm run test:rls (probes/remittances.mjs) and
  supabase/tests/rls_remittances.sql on dev. The same migration let the
  ledger accept money recorded against an asset or an event, which both
  databases had been refusing.
- Wealth charts (Jonathan, 30 September; preview approved the same day with
  "yes" to all three of its questions:
  https://claude.ai/artifact/1Qg7T8E3XFBYLf9rJ21WFn). Drawn with visx (about
  17 KB on the page, against Recharts' 118 and ECharts' 198, measured). Cash
  Flow: money in and out against a budget band (each month's household
  budget, or the person's own under the Who picker), overspend hatched and
  stated; spending by category as a donut; spending by person against a
  budget any grown-up sets and the household can see (member_budgets). A&L:
  net worth over time, kept per viewer per month in net_worth_snapshots from
  now on, so nobody's line holds anything they could not see.
  getSpendingByMember / getMemberBudgets in lib/queries/wealth are the shared
  helper for Today's member card, which uses it since 6 October. RLS: npm run test:rls (probes/wealth-charts.mjs) and
  supabase/tests/rls_wealth_charts.sql on dev.

## Decided against, for now

- An English / Taglish language switch (first-open Group D): not needed now
  (Jonathan, 13 October).

- Cutting the bottom navigation down to 4–5 tabs (declined 24 September).

## Needs a real phone

What only Jonathan can check, on his iPhone with Kin on the Home Screen:

- **Journal video:** make a video from an entry's photos, watch it record,
  then Save Video from the share sheet and find it in Photos.
- **Offline mode:** with Kin open, turn on Airplane Mode; tick the list,
  mark something Done on Today, send a chat message; turn it off and see
  "Back online · N changes saved". Then open Kin from cold in Airplane Mode
  and see the saved copy.
- **The tree with real photos:** open Family -> Tree with relatives who have
  profile photos; tiles, regions and the panel should read well.
- **Apple Health via Shortcut:** Settings -> Connected apps -> Apple Health,
  set up the Shortcut as written, run it, and see steps and weight on Health.
- **Dynamic Type:** in iPhone Settings -> Accessibility -> Display & Text
  Size -> Larger Text, pick a larger size; open Kin and the text should be
  larger to match (only checked in a desktop browser, which has no Dynamic
  Type).
- **The "K" home-screen icon:** remove the old Kin icon and add Kin to the
  Home Screen again; it should show the house icon.
- **This week's features (14-19 October), the parts a browser on dev cannot
  reach.** `e2e/this-week.spec.ts` uses each one as the sample household every
  week; these need the phone, a second person, or both:
  - **Helper link, accepted:** Settings -> Household -> Helpers, make a link
    and send it with the share sheet; on a phone that has no Kin account,
    open it, sign up, Accept, and see only the To-Buy list (and Meals or
    Family plans if they were ticked). Tick something there and see it ticked
    on your own list.
  - **Vault emergency access:** needs a relative in a household linked with
    yours. Name them under Settings -> Privacy -> Emergency access; on their
    phone, Request access; see the request on yours; Allow now; see their
    read-only vault open, then Revoke.
  - **Check-up "share as a picture":** finish the check-up on the welcome
    page, share the result; the share sheet offers the picture, and it saves
    to Photos and sends in Messenger.
  - **Year book:** Journal -> Year book -> print; Safari's print sheet makes a
    PDF that reads well (photos, page breaks).
  - **Tree file:** Family -> Tree file, export lands in Files; import a .ged
    picked from Files.
  - **Statement import:** a CSV downloaded from BPI's or GCash's app, picked
    from Files on the import screen.
  - **Stories on the tree:** record a story with the microphone (Kin asks for
    it once) and play it back.
  - **Utang and paluwagan reminders:** with "Prepare a gentle reminder I can
    send myself" ticked, the polite message Kin writes shares to Messenger or
    SMS from the share sheet (Kin never sends it itself).
  - **Password health's breach check:** a password seen in breaches is
    flagged on the phone (it asks Have I Been Pwned with five characters of
    a hash; nothing else leaves the phone).
  - **Alkansya on a child's phone:** in kid view, the child sees their jars and
    the next baon, and cannot change either.
- **Needs a real phone (Friday check), from the 19–20 October stabilisation
  pass:**
  - **Undas push, Thursday 29 October from 09:00 Manila.** Beforehand:
    1. Your household has "Remember the departed" on (Settings).
    2. Someone on the tree has a date of passing.
    3. Kin notifications are allowed on the iPhone.

    Between 09:00 and 09:05 one push should arrive: "Undas is on Sunday",
    naming the first three remembered. Tapping it opens Today. There
    should be no second push that day, and nothing on a child's phone.
  - **Simple Kin "Nakarating na ako" (#733):**
    1. Turn on Simple Kin for yourself (Settings -> Appearance).
    2. Set the Action Button to Kin's "Nakarating na ako".
    3. Press it.

    Today opens and sends the check-in. The household sees where you are.
  - **Simple Kin approvals (#733):** with a child's chore waiting for
    approval, open Today in Simple Kin. "Waiting on you" is at the bottom,
    and Approve works.
  - **Offline chore, answered twice (#738):**
    1. In Airplane Mode, on the Planner, mark a chore's upcoming day Done.
       That day leaves the choices.
    2. Turn Airplane Mode off.

    The chore shows Done once.
  - **Call effects (#740):**
    1. On a slow connection, start a video call.
    2. Tap a filter and a face quickly, then hang up straight away.
    3. Call again.

    The other phone sees your live camera, not a frozen picture.
  - **Money recap at the largest text (#747):** iPhone Larger Text at its
    biggest, Simple Kin on, Wealth -> recap. Nothing breaks mid-word.

## Next up

- **Done: reminders at their time** -- medicine doses, bills (the day
  before and on the day), birthdays, plans 30 minutes ahead -- run by
  Supabase pg_cron every five minutes through /api/cron/reminders. The
  secret is set in Vercel and Supabase Vault (docs/SETUP_FOR_JONATHAN.md
  section 1) and the pg_cron job `kin-reminders` runs.

- **Done: the chat is on private channels**
  (20260926130000_private_chat_channels.sql), and Realtime's "Allow public
  access" has been off on dev and production since 29 September, so
  Supabase enforces them.

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
  get one push a morning from 09:00 (their Shopping list switch). A true
  leave-by time still needs travel times
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
