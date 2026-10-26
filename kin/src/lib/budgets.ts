/** Category budgets for Family and each person (spending_budgets,
 * 20261026100000). A row is a budget from its month on, until a later row for
 * the same whose and category changes it; amount 0 is "removed from that
 * month". All is never set: it is the sum of the budgets the viewer can see. */

export type SpendingBudgetRow = { member_id: string | null; category: string; amount: number | string; from_month: string };

/** The key a whose is filed under: a member id, or "family". */
export const FAMILY_BUDGET = "family";
export const budgetWhose = (memberId: string | null) => memberId ?? FAMILY_BUDGET;

/** Each whose's budgets in force in `month` (YYYY-MM): the latest row per
 * category not after it, removed ones (0) left out. */
export function budgetsInForce(rows: SpendingBudgetRow[], month: string): Map<string, Map<string, number>> {
  const latest = new Map<string, SpendingBudgetRow>();
  for (const r of rows) {
    if (r.from_month.slice(0, 7) > month) continue;
    const key = `${budgetWhose(r.member_id)}\u0000${r.category}`;
    const seen = latest.get(key);
    if (!seen || seen.from_month < r.from_month) latest.set(key, r);
  }
  const out = new Map<string, Map<string, number>>();
  for (const r of latest.values()) {
    const amount = Number(r.amount);
    if (!(amount > 0)) continue;
    const whose = budgetWhose(r.member_id);
    const cats = out.get(whose) ?? new Map<string, number>();
    cats.set(r.category, amount);
    out.set(whose, cats);
  }
  return out;
}

/** One whose's budgets, or All's: every whose added up, per category. */
export function budgetsFor(inForce: Map<string, Map<string, number>>, whose: string | "all"): Map<string, number> {
  if (whose !== "all") return new Map(inForce.get(whose) ?? []);
  const sum = new Map<string, number>();
  for (const cats of inForce.values()) for (const [c, a] of cats) sum.set(c, (sum.get(c) ?? 0) + a);
  return sum;
}

export const budgetTotal = (cats: Map<string, number>) => [...cats.values()].reduce((s, a) => s + a, 0);
