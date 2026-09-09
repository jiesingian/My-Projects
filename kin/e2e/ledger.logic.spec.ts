import { test, expect } from "@playwright/test";
import { explainLedgerRefusal, signedAmount } from "@/lib/wealth";

/** The ledger's own policy refusal, and the sign of a movement.
 *
 * Background, because the message is otherwise mysterious. An account is
 * visible when it is joint, yours, OR simply not marked private. A transaction
 * on it is visible only when the account is joint or yours — there is no
 * `is_private` clause in that second rule. So a household member's own account,
 * once they share it, appears in everybody's account list and refuses every
 * entry anybody else writes into it: the insert is allowed, the RETURNING is
 * not, and a refused RETURNING takes the whole statement down.
 *
 * Nothing is written, which is the safe direction. What was not safe was the
 * transfer built on two of those inserts — the first leg took the money out
 * and stood, the second failed, and 5,000 pesos left the household and
 * arrived nowhere. Measured on 9 September in the throwaway household. That
 * half is fixed by inserting both legs in one statement and not asking for
 * them back; this file pins the half that is still a message.
 */

test("a policy refusal names the account, not the table", () => {
  const raw = 'new row violates row-level security policy for table "wealth_transactions"';
  const shown = explainLedgerRefusal(raw);
  expect(shown).not.toContain("row-level security");
  expect(shown).not.toContain("wealth_transactions");
  expect(shown).toContain("joint account");
});

test("every other failure is passed through word for word", () => {
  // Rewriting an unrelated error would hide it, which is the mistake the whole
  // of this week's sweep exists to undo.
  for (const other of [
    "duplicate key value violates unique constraint",
    "insert or update on table violates foreign key constraint",
    "",
  ]) {
    expect(explainLedgerRefusal(other)).toBe(other);
  }
});

test("a pending movement counts for nothing until it is confirmed", () => {
  // The transfer fix writes both legs with the same status, so a "via the app"
  // transfer sits at pending on both sides and moves no balance at all until
  // somebody confirms it. Worth pinning: a bug here would show up as money
  // appearing in one account before it left the other.
  expect(signedAmount({ direction: "out", amount: 5000, status: "pending" })).toBe(0);
  expect(signedAmount({ direction: "in", amount: 5000, status: "pending" })).toBe(0);
});

test("a confirmed transfer's two legs cancel out across the household", () => {
  const out = signedAmount({ direction: "out", amount: 5000, status: "confirmed" });
  const inn = signedAmount({ direction: "in", amount: 5000, status: "confirmed" });
  expect(out).toBe(-5000);
  expect(inn).toBe(5000);
  // The property the old two-insert transfer could break: one leg landing
  // without the other left the household 5,000 short.
  expect(out + inn).toBe(0);
});

test("amounts arriving as strings from the database still count", () => {
  // numeric columns come back as strings over PostgREST, which is why this
  // takes number | string at all.
  expect(signedAmount({ direction: "in", amount: "1234.56", status: "confirmed" })).toBeCloseTo(1234.56, 2);
  expect(signedAmount({ direction: "out", amount: "1234.56", status: "confirmed" })).toBeCloseTo(-1234.56, 2);
});
