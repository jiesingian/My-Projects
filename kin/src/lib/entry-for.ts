/** What a ledger entry was for, as Edit entry offers to change it (Jonathan,
 * 26 October). `forKey` is "liabilities:<id>", "assets:<id>", "goals:<id>"
 * or "" for nothing in particular; null when it cannot change there, with
 * `forLocked` saying why: it settled a bill or came from another hub, or
 * it bought or added to an asset (its item is on the asset). Pure, and
 * not in a client module, so the server pages that build the lists call it. */
export function entryFor(t: { source_table: string | null; source_id: string | null; goal_id: string | null; capital: boolean }): { forKey: string | null; forLocked: string | null } {
  if (t.capital) return { forKey: null, forLocked: "Bought or added to an asset: its item is on the asset. Remove and re-enter to change that." };
  if (!t.source_table) return { forKey: "", forLocked: null };
  if (t.source_table === "goals" || t.source_table === "assets" || t.source_table === "liabilities") return { forKey: `${t.source_table}:${t.source_id ?? t.goal_id ?? ""}`, forLocked: null };
  if (t.source_table === "bills") return { forKey: null, forLocked: "Settled a bill, so it stays the bill's." };
  if (t.source_table === "income_schedules") return { forKey: null, forLocked: "Received an expected income, so it stays that income's." };
  return { forKey: null, forLocked: "Posted from another hub, so it stays what that hub recorded." };
}
