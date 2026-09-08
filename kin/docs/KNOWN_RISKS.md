# Known risks

Things found while bug-hunting that are **not** demonstrated bugs, and were
therefore deliberately not fixed. Each was looked into far enough to say what
would have to be true for it to bite, and measured where measuring was
possible. They are here so the next person does not spend the afternoon
rediscovering them.

Nothing in this file is a feature request. `docs/FUTURE_FEATURES.md` is the
place for those.

---

## Writes whose error is never captured (46 sites, was 67)

`src/lib/actions/*.ts` contains writes of the shape

    await supabase.from("x").update({ ... }).eq("id", id);

with no `const { error }`. If the write is refused — by RLS, by a constraint,
by the network — the action carries on and reports success.

**21 were fixed on 8 September**, chosen by one test: would a silent failure
lose data or money, in a way the person could not see? The rest were left,
because touching a call site to guard against a failure nobody has observed
is how you break something that works.

The worst shape, and the reason these were picked first, is **delete then
insert**:

    await supabase.from("activity_members").delete().eq("activity_id", id);
    await supabase.from("activity_members").insert(who.map(...));

Only the delete is certain to have happened. If the insert is refused, the
record is left marked for *nobody* — and from the outside that is
indistinguishable from a save that worked. It appeared five times: activity
members, event members, trip travellers, routine members, recipe
ingredients. A routine for nobody never appears again.

Fixed, by area:

| Area | Sites | What a silent failure lost |
|---|---|---|
| `planner.ts` | 8 | who an activity, event or trip is for; a journal entry made from a plan |
| `wealth.ts` | 6 | a bill left unpaid after paying it, or paid after deleting the payment; a budget; a savings target; a goal total |
| `household.ts` | 5 | a meal's ingredients, so the grocery list is built without them; the grocery list itself; a recipe's ingredients |
| `journal.ts` | 2 | who an entry is about; a photo uploaded and attached to nothing |
| `routines.ts` | 2 | who a routine is for |

Three of these were silent at the *interface* as well as in the action —
**ADD TO JOURNAL**, **SET BUDGET**/**SET TARGET**, and **GENERATE GROCERY
LIST** all called their action and ignored what came back. The grocery button
navigated to the shopping list either way, so a list that failed to write
looked exactly like a week with nothing planned. Those three now show what
went wrong, and the grocery one only navigates if there is something to see.

**One was left logging rather than telling anyone,** on purpose:
`apply_code_grant_to_family` in `family.ts`. It runs after the household has
been created, so returning an error would strand a new member on a signup
form for an account that already exists. A lost grant is the difference
between free-for-good and a trial that will ask for payment, and it surfaces
weeks later as a paywall nobody can trace back — so it is logged with the
household name, and deliberately not the code, which is a credential.

**Not fixed, and why.** `toggleBuyItemAction` and `clearCheckedAction` fail
visibly: the list re-renders from the database and the tick comes back. The
storage `.remove()` calls (avatars, journal media, documents, recipe photos)
leak an orphaned file rather than losing anything the family can see.
`calendar-sync.ts` holds 17 and is its own problem — every one of them is a
best-effort mirror to Google, where failing loudly would be worse than the
drift.

**What would change that.** Any report of "I did that and it did not save"
in one of the remaining paths.

**Where it would hurt most,** if it ever does: `applySettlement` and
`deleteTransactionAction` used to adjust `goals.current_amount` by hand, and
a swallowed failure there left a savings goal permanently out of step with
the ledger. Both now call `recalc_goal_total` and capture its error, and a
recomputed total self-corrects on the next touch — so that one has stopped
compounding.

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

## wealth_targets is still writable by the household — until the migration runs

**Confirmed bug, half fixed.** `wealth_targets` is private to read
(`member_id = current_member_id()`) and open to write (both write policies
check only the family). Any member could set or overwrite any other member's
revenue target, and could not then see what they had done.

Reproduced 8 September against the throwaway household: `POST` of another
member's target returned **201**. Row confirmed as theirs, then removed. The
Singian household was never touched.

**Done:** `setWealthTargetAction` now takes the member and the household from
the session rather than from its arguments, so the app cannot be used to do
it. `setJointBudgetAction` and `toggleOmronAction` were given the same
treatment for the same reason.

**Still open:** the policies themselves.
`migrations/2026-09-08-a-target-is-your-own.sql` is written and *not applied*.
Until it runs, anyone in a household can still do this by talking to PostgREST
directly — the anon key is public by design, so the app-layer fix is a closed
door beside an open window. `e2e/authorization.spec.ts` carries the check as
`fixme`; take it off when the migration lands.

**A note worth keeping.** The first probe of this returned 403 and nearly had
it recorded as safe. That request carried `Prefer: return=representation`, and
the SELECT policy refuses to hand back another member's row — so the insert
had succeeded and the *read-back* failed, with an error naming the insert. A
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

## Another member's target always reads as zero

Noticed while fixing the above, not fixed. The Wealth hub renders
`${whosePossessive} target this month` when viewing someone else's pane, but
`getWealthPane` reads `wealth_targets` through the RLS client and the SELECT
policy restricts it to your own row — so the meter shows 0 for everyone else,
labelled as though it were their real figure.

Harmless and long-standing, and the honest options differ: either stop
claiming to show it, or decide targets are household-visible and widen the
SELECT policy. That is a product decision, not a bug fix.

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
