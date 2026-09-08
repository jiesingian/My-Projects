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

## The Google Calendar paths have no end-to-end coverage

`syncRowToCalendars`, the pull-back reconcile, and `google-calendar.ts` are
exercised by nothing. They need OAuth credentials the suite does not have.

This matters more than it looks: the off-by-a-day fixed on 8 September lived
in exactly those files, and was found by reading rather than by a failing
test. The same class could return there and no test would notice.

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
