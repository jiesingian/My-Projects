# Known risks

Things found while bug-hunting that are **not** demonstrated bugs, and were
therefore deliberately not fixed. Each was looked into far enough to say what
would have to be true for it to bite, and measured where measuring was
possible. They are here so the next person does not spend the afternoon
rediscovering them.

Nothing in this file is a feature request. `docs/FUTURE_FEATURES.md` is the
place for those.

---

## Writes whose error was never captured — CLOSED 8 September, 67 of 67

`src/lib/actions/*.ts` and `src/lib/*.ts` contained 67 writes of the shape

    await supabase.from("x").update({ ... }).eq("id", id);

with no `const { error }`. If the write was refused — by RLS, by a constraint,
by the network — the action carried on and reported success. **There are none
left.**

They were not one problem. Sorted by what a silent failure actually cost:

**Lost something.** Delete-then-insert, five times over (activity members,
event members, trip travellers, routine members, recipe ingredients): only the
delete is certain, so a refused insert left the record marked for *nobody* —
indistinguishable from a save that worked. A photo uploaded, stored and
attached to nothing. A bill left unpaid after paying it, or paid after
deleting the payment. A meal's ingredients, so the grocery list was built
without them.

**Destroyed something.** The Drive photo migration copied a file to Drive,
updated the row to point at Drive, then deleted the original from storage — in
that order, with the middle step's error discarded. A failed update meant the
row still pointed at storage, the original was deleted, and the Drive copy was
unreferenced: **a family photo reachable by nobody.** The original is now kept
whenever the record does not follow, and the household is told which.

**Made a duplicate, forever.** A Google event created but not linked would
never be updated or removed, and the next *pull* read it as somebody's own
event and made an activity from it — every sync. Same shape in Drive: a folder
created but not recorded means another folder of the same name next run.

**Reported success while failing.** `syncGoogleCalendarAction` returned
`error: null` even when the backfill threw or a whole member's calendar could
not be read — and both UIs already rendered `result.error`. **ADD TO
JOURNAL**, **SET BUDGET**/**SET TARGET** and **GENERATE GROCERY LIST** each
called their action and ignored what came back; the grocery button navigated
to the shopping list either way, so a list that failed to write looked exactly
like a week with nothing planned.

**Saved a preference that did not save.** Theme set a cookie whether or not
the row wrote, so it appeared to change here and reverted on the member's other
devices. Text size and notification switches the same. This is the shape of the
bug that started all of it: `week_start` and `date_format` saved cleanly, said
so, and changed nothing.

**Leaked a file, or a login.** Storage `remove()` calls left orphans; the
compensating `deleteUser` after a failed child creation left an address
claimed by a login belonging to nobody, so a second attempt with the same
address would fail.

Three are deliberately logged rather than shown, each for a stated reason:
`apply_code_grant_to_family` (the household already exists, so an error would
strand a new member on a signup form), `resetPasswordForEmail` (answering
differently would tell a stranger which addresses have accounts), and the
sign-out after a password reset (they have just proved who they are and are on
their way in). All three are the kind of failure that must not be invisible to
*us*, which is what the logs are for.

---

## goals.current_amount is stored, not derived — CLOSED 8 September

*Kept for the reconciliation query at the foot, which is still the way to
check this, and because the shape of the bug is worth remembering.*

Account balances are computed on every read as
`opening_balance + sum(transactions)`, so a missed write self-corrects.
Savings goals were the opposite: `current_amount` was a running total mutated
by `+delta` at two sites and never reconciled against the ledger.

Two consequences, both now gone:

- **Lost update.** Both sites read the total, added to it, and wrote it back.
  Two people confirming a contribution to the same goal at the same moment
  each wrote `read + their own delta`, and one contribution vanished.
- **Double count.** Not a race at all, and so the likelier of the two:
  `confirmTransactionAction` never checked whether the entry was already
  confirmed, so a second click credited the goal again for one movement of
  money.

**Fixed** by `recalc_goal_total` (migration
`2026-09-08-goal-totals-from-the-ledger.sql`), which recomputes from the
ledger under a row lock taken before the sum is read. It writes a
destination rather than a distance, so the double count is impossible rather
than guarded against, and drift already in a row corrects itself the next
time anything touches that goal. `e2e/goal-totals.spec.ts` pins it.

**Not covered:** the contribute flow still has no browser test, so the two
call sites are verified by the type checker and the function's own tests
rather than by driving the app.

**Measured, 8 September.** Before: every goal in both households reconciled
except one — "Emergency fund", ₱210,000 against no transactions, in the
throwaway QA household, seeded by hand when the fixture was built. The
function corrected it on its first call. After: nothing in either household
differs from its ledger.

The reconciliation query is worth keeping:

```sql
select g.title, g.current_amount as stored,
       coalesce(sum(case when t.direction = 'out' then t.amount else -t.amount end), 0) as from_ledger
from public.goals g
left join public.wealth_transactions t on t.goal_id = g.id and t.status = 'confirmed'
group by g.id, g.title, g.current_amount
having g.current_amount <> coalesce(sum(case when t.direction = 'out' then t.amount else -t.amount end), 0);
```

Empty is correct.

---

## wealth_targets was writable by the whole household — CLOSED 8 September

`wealth_targets` was private to read (`member_id = current_member_id()`) and
open to write: both write policies checked only the family. Any member could
set or overwrite any other member's revenue target — and because the read
policy is the strict one, could not then see what they had done, while the
person whose target it is had no way to tell where the number came from.

Reproduced against the throwaway household: `POST` of another member's target
returned **201**. Row confirmed as theirs, then removed. The Singian household
was never touched.

**Closed on both sides.** `setWealthTargetAction` takes the member and the
household from the session rather than from its arguments (as do
`setJointBudgetAction` and `toggleOmronAction`), and
`migrations/2026-09-08-a-target-is-your-own.sql` is **applied**: all four verbs
now name `member_id`. Verified by re-running the reproduction both ways —
another member's target `403` where it was `201`, own target still `201`,
another member's row not deletable with the row confirmed surviving, own row
still deletable.

**The DELETE policy was missed on the first pass** and applied in a second
run. Four policies were on the table, three were considered. That is the kind
of gap that survives a fix precisely because the fix looks like it covered the
area, and it is written into the migration file rather than tidied away.

**A note worth keeping.** The first probe returned 403 and nearly had this
recorded as safe. That request carried `Prefer: return=representation`, and the
SELECT policy refuses to hand back another member's row — so the insert had
succeeded and the *read-back* failed, with an error naming the insert. A
refusal on a write that asks for its row back may be the read being refused.

---

## Native time inputs still render in the browser's locale — left alone

The date half of this was fixed on 8 September: every `type="date"` input now
writes the date out beneath itself, spelled, because a native picker draws
itself in the *browser's* locale and the page cannot say otherwise. Chrome set
to US shows `2026-09-07` as `09/07/2026`, which reads here as 9 July.

The four `type="time"` inputs were deliberately not touched. `08:30 PM` is
already unambiguous — there is no digit order to misread — so an echo would
be clutter buying nothing. It does mean the Planner list says `20:30` while
its edit form says `08:30 PM`, which is an inconsistency rather than a
hazard.

Replacing the native pickers outright was considered and rejected: on a phone
they are much better than anything we would build, and they are what the
household already knows.

---

## Another member's target read as zero — FIXED 8 September

The Wealth hub rendered `EARNED OF TARGET` against `${whosePossessive} target
this month` when viewing someone else's pane. But `wealth_targets` is private
by row-level policy — deliberately, and tightened further this morning — so
that number always read back as **0**. The page was stating a figure it had
never been allowed to see, and calling it theirs.

Fixed without touching the policy, because the policy is right: viewing
somebody else now shows `EARNED THIS MONTH` with no cap and the note "their
target is theirs to see". `Meter` takes `cap: number | null`, where null means
there is no target to measure against — not a target of nothing.

---

## A failed calendar sync used to lose the change for good — FIXED 8 September

Recorded because the shape is worth remembering: this looked like seventeen
dropped errors and was really one design fault.

`pullMemberCalendar` applied each change Google reported, discarding whatever
went wrong, and then saved the new sync token **unconditionally**. A Google
sync token means *"you have seen everything up to here"* — so a change that
failed to write into Kin was never sent again. Not delayed: gone. Something a
family member did on their phone would simply never arrive, and nothing
anywhere would say so.

**What changed**

- `applyIncomingEvent` reports failure instead of swallowing it; all 17 writes
  in the file capture their error.
- The token is only advanced when nothing in the batch is still being retried
  (`syncLinkPatch`, pure and tested).
- The create path undoes a half-made activity, since a failure now guarantees a
  retry and the retry must not find no link and make a second copy.
- Two orphan paths closed: a Google event created but not linked is deleted
  again (unlinked it would never be updated or removed, and the next *pull*
  would read it as somebody's own event and make a duplicate activity from it,
  every sync); a link that could not be cleared is logged.
- `syncGoogleCalendarAction` returns a real error. It used to return
  `error: null` even when the backfill threw or a whole member's calendar
  failed to read — and both UIs already rendered `result.error`.

**The cost that came with it, and what removes it.** An event that can *never*
apply would hold the token still for good, blocking every later change from
that member. `QUARANTINE_AFTER = 3` sets such an event aside: three separate
syncs is not a passing fault, and anything that survives them is structural.
The attempt count lives in `calendar_sync_failures`
(`migrations/2026-09-08-quarantine-unappliable-calendar-events.sql`), and the
count of set-aside items is reported to whoever pressed Sync now.

**The migration is written and NOT APPLIED.** Until it runs, the query for
prior attempts returns nothing, every failure looks like a first attempt, and
the behaviour is the pre-quarantine one: hold the token indefinitely. That is
where it has been all day and it is safe — just not self-clearing.

**Nothing has ever been observed failing.** This was built ahead of the problem
because it was asked for, not because anything is broken.

---

## The Planner asked the browser what day it is — FIXED 8 September

Kept because of *how* it was found, which is the useful part.

`calendar-nav` and `routine-controls` are client components and read `new
Date()` for "today". The server renders in `Asia/Manila`. Whenever the two
zones are on different dates — every day from 16:00 UTC — React reported a
hydration mismatch on `/planner`, and `TodayButton` rendered a different
`href` from the one the server sent. `routine-controls` had it too: "N days
behind" changed depending on where the person reading it was.

It never showed for the Singian household, whose browsers sit in Manila
alongside the server. It showed for anyone travelling, anyone whose device is
on another zone, and the test container for eight hours a day.

**Fixed** with `familyDay()` — pure `Intl` with an explicit zone, so it works
in a browser exactly as on the server — and `daysBetween`, which counts days
from two plain dates and consults no clock at all.

**The suite was catching it by accident.** It only noticed because the
container happened to be in UTC, so the same code passed all morning and
failed all evening; a green run said nothing about whether this class held.
The chromium project now pins `timezoneId: "America/New_York"` — a zone that
never agrees with the household — so hydration mismatches fail on every run
rather than by the clock. Pinning it immediately caught the same bug inside a
test: `preferences.spec` computed "today" from the browser to check
`date_format`, and so compared the server's 9th against the browser's 8th and
called the app wrong.

**A standing skip worth knowing about.** The two `date_format` tests skip
themselves when the day and the month are the same number — on 09/09, `08/09`
and `09/08` are one string and the test cannot tell right from wrong. It says
so and stands down rather than passing for the wrong reason, so a run on those
days reports 2 skipped and that is correct.

---

## The Google Calendar paths: covered in part, and where the line is

*Was: "exercised by nothing." That is no longer true, but what is now covered
is worth stating precisely, because the gap that remains is the interesting
one.*

**Covered, 8 September** — 24 tests in `e2e/*.logic.spec.ts`, no browser, no
server, ~1 second:

- what we send: all-day dates and Google's exclusive end, multi-day trips,
  timed events and the one-hour default, reminders (an absent one must not
  override the member's own defaults), recurrence
- what we make of the reply: an all-day date kept whatever zone the process is
  in, an early-morning event filed on the household's day rather than UTC's,
  malformed dates refused
- the requests themselves, against a stubbed `fetch`: URL and method, the
  bearer token, calendar ids escaped, "already gone" (404/410) counting as
  deleted, pagination, an expired sync token handled rather than thrown

**Not covered, and cannot be here.** A real OAuth round trip needs credentials
the suite does not have, and giving CI a live Google account is a decision
with a bill attached. So none of the above proves Google *accepts* what we
send — only that we send what we meant to. If Google changes a field name or
tightens a rule, these tests stay green and the family's phones go quiet.

**Why it was untestable before**, which is the part worth remembering: the
shaping lived inside a `"use server"` module and one that reaches for the
service key, so nothing outside a request could call it. It was not that
nobody had got round to it. Moving the pure half into
`src/lib/calendar-shape.ts` is what made the tests possible at all.

**The tests run in UTC while production runs in Asia/Manila, deliberately.**
Every calendar bug so far has been correct in the environment it was written
in. Anything that depends on the process clock rather than the household's
stated zone now fails in CI and passes on the server, which is the alarm
worth having.

---

## All-day items reaching Google through the process clock — CLOSED 8 September

*Kept as a record: the shape of this is worth recognising again.*

Found while writing the calendar coverage. Every all-day sync built its
instant as

    startAt: new Date(`${date}T00:00:00`)

which is midnight in whatever zone the *process* is in, and was then read back
through `familyDay`, pinned to `FAMILY_TZ`. Two answers to "where does this
household live", agreeing only because `instrumentation.ts` sets `TZ` to the
same zone. Measured on one 9 September all-day event:

| process TZ | lands on |
|---|---|
| Asia/Manila | 2026-09-09 |
| UTC | 2026-09-09 |
| America/New_York | 2026-09-09 |
| **Asia/Tokyo** | **2026-09-08** |
| **Pacific/Auckland** | **2026-09-08** |

Anywhere east of the household, every birthday, bill, trip and meal lands a
day early — one `KIN_TZ` away, and it would look exactly like the 8 September
fix coming undone by itself.

**Fixed on both sides, 21 call sites.**

- Pull: `eventStartEnd` carries Google's own date string through as `day`
  rather than round-tripping it, and the seven update sites use that.
- Push: `allDayEvent(title, day, { endDay })` builds the input from plain
  dates, so no caller constructs the instant. Applied across
  `calendar-sync.ts` (7), `planner.ts` (4), `assistant/tools.ts` (5),
  `household.ts` (2), `wealth.ts` (2), `documents.ts` (1).
- `familyMidnight` in `lib/time.ts` states the zone by name for the one place
  an instant is still genuinely needed.
- `syncRowToCalendars` now takes `CalendarEventInput | null` and treats null
  as "nothing to sync", so an unreadable date syncs nothing rather than
  needing a guard at each of fourteen call sites. From a form or a `date`
  column null cannot happen; from the assistant, whose arguments a model
  writes, it can.

There is no `new Date(\`${x}T00:00:00\`)` left in any calendar path.

**Still there, and a different question:** `household.ts` computes the grocery
week that way, and `assistant/tools.ts` builds a query window that way. Those
are date ranges rather than things put on a calendar, and they were left
alone — the failure mode is a week boundary landing wrong for a server outside
the household's zone, not an item on the wrong day.

---|---|
| Asia/Manila | 2026-09-09 |
| UTC | 2026-09-09 |
| America/New_York | 2026-09-09 |
| **Asia/Tokyo** | **2026-09-08** |
| **Pacific/Auckland** | **2026-09-08** |

Anywhere east of the household, every birthday, bill, trip and meal is back to
landing a day early — and `KIN_TZ` is the documented way to move the
deployment, so it is one environment variable away, and it would look exactly
like the 8 September fix coming undone on its own.

**Fixed on the pull side.** `eventStartEnd` carries Google's plain date
through untouched rather than round-tripping it, and `familyMidnight` in
`lib/time.ts` states the zone instead of inheriting it.

**Not fixed on the push side.** Roughly a dozen callers across `planner.ts`,
`wealth.ts`, `household.ts`, `documents.ts` and `assistant/tools.ts` still
build `startAt: new Date(`${date}T00:00:00`)` for `allDay: true` syncs. They
are correct today for the same reason the pull side was — production is in
Asia/Manila — and the sweep is mechanical now that `familyMidnight` exists.
It was left out of the coverage change on purpose rather than overlooked:
twelve call sites across five files is a change of its own, and one of them is
the assistant.

---

## The Planner groups its calendar in the process's clock, not the household's

Noticed while closing the all-day date bugs, and **left alone deliberately**.

`src/lib/queries/planner.ts` builds each item's `date` with
`new Date(`${column}T00:00:00`)` and then groups by `getFullYear()`,
`getMonth()`, `getDate()` — local getters. Construction and reading use the
same clock, so the module is internally consistent and correct in production,
where `instrumentation.ts` puts the process in `Asia/Manila`. The two page
anchors in `planner/page.tsx` and `household/page.tsx` are the same.

It is left because a partial change would be worse than none: swapping the
construction to `familyMidnight` without also moving every getter would break
the calendar grid outright. Doing it properly is a refactor of the whole
display module, with real regression risk, to buy robustness against a
`KIN_TZ` that nobody has moved.

The everything-else of this class *is* closed: no calendar path, query bound
or all-day sync builds a date from the process clock any more, and `addDays`
and `weekdayOf` in `lib/time.ts` do day arithmetic with no clock involved at
all.

---

## Swept and found clean — 8 September

Recorded so nobody repeats the afternoon. Each was checked against the thing
itself, not against an assumption.

| Area | How it was checked | Result |
| --- | --- | --- |
| UTC date slicing | grep across `src/` for `toISOString().slice(0, 10)` and raw timestamp slicing | 11 fixed; **none remain** |
| Nullish vs empty (`??`) | every env read; all 18 form reads carrying a non-empty default | 3 fixed; the rest are selects or hidden inputs, which cannot submit empty |
| Whole-row clobber on edit | all 16 update actions diffed against the fields their forms populate | 1 fixed (routine duration); the other 15 complete |
| PGRST201 ambiguous embeds | the 14 tables carrying two FKs to `members`, against every embed | clean — all disambiguate by FK column |
| Goal totals vs the ledger | every goal in both households reconciled against confirmed transactions | clean — the one outlier is a hand-seeded QA fixture |
| Routine expansion | `expandRoutine` probed directly: daily/weekly/monthly, intervals, month-end clamping, `end_date` boundary, mid-range starts | clean — including 31st→28 Feb, and `end_date` inclusive |
| RLS coverage | every table: is RLS on, and does each family-scoped table have a scoping policy | clean — the two deny-all tables are deliberate |
| Permissive policies | every policy on a family-scoped table, for a scoping expression | clean — none permissive |
| Delete scoping | all 24 destructive actions; the 9 relying on RLS alone checked against their DELETE policies | clean — join tables scope through their parent |

One caution learned in the doing: the throwaway script written to probe
routine expansion made the very UTC-slice mistake it was helping to sweep
for, and printed every occurrence a day early. It read as a catastrophic
regression for about a minute. When the subject is dates, the check needs the
household's zone as much as the code does.
