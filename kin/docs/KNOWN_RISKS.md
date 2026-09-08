# Known risks

Things found while bug-hunting that are **not** demonstrated bugs, and were
therefore deliberately not fixed. Each was looked into far enough to say what
would have to be true for it to bite, and measured where measuring was
possible. They are here so the next person does not spend the afternoon
rediscovering them.

Nothing in this file is a feature request. `docs/FUTURE_FEATURES.md` is the
place for those.

---

## Writes whose error is never captured (58 sites)

`src/lib/actions/*.ts` contains 58 writes of the shape

    await supabase.from("x").update({ ... }).eq("id", id);

with no `const { error }`. If the write is refused — by RLS, by a constraint,
by the network — the action carries on and reports success.

**Why it was not fixed.** No instance was shown to fail. Touching 58 call
sites to guard against a failure nobody has observed is the kind of change
that breaks more than it fixes. It is a pattern, not a bug.

**What would change that.** Any single report of "I did that and it did not
save." Then the specific path gets its error captured, and this entry gets
shorter.

**Where it would hurt most,** if it ever does: `applySettlement` and
`deleteTransactionAction` both adjust `goals.current_amount` this way. A
swallowed failure there leaves a savings goal permanently out of step with
the ledger, and nothing recomputes it.

---

## goals.current_amount is stored, not derived

Account balances are computed on every read as
`opening_balance + sum(transactions)`, so a missed write self-corrects.
Savings goals are the opposite: `current_amount` is a running total mutated
by `+delta` at two sites and never reconciled against the ledger.

Two consequences:

- **Lost update.** Both sites read the total, add to it, and write it back.
  Two people confirming a contribution to the same goal at the same moment
  each write `read + their own delta`, and one contribution vanishes. Fixing
  it properly needs `current_amount = current_amount + $delta` executed
  atomically, which PostgREST cannot express — it would take an RPC, which
  is a migration, which is Jonathan's.
- **No reconciliation.** Nothing detects a divergence once it exists.

**Measured, 8 September.** Every goal in both households was reconciled
against its confirmed transactions. All match. The single apparent outlier —
"Emergency fund", ₱210,000 against no transactions — is in the throwaway QA
household and was seeded by hand when the fixture was built.

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
