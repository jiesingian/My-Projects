import { createClient } from "@/lib/supabase/server";
import { getAccounts, getArchivedAccountsForFlow, getSpendingBudgetRows } from "@/lib/queries/wealth";
import { budgetsFor, budgetsInForce } from "@/lib/budgets";
import { familyDay, familyMidnight } from "@/lib/time";
import { inTotalsScope, paidFromVisibleFilter } from "@/lib/wealth";
import { buildRecap, monthBefore, type Recap, type RecapTxn } from "@/lib/money-recap";
import { allRows } from "@/lib/queries/all-rows";

/** One month's money recap, read as the viewer: accounts row-level security
 * lets them see, the same All view as Wealth's (their own private accounts
 * left out if they chose that), bills paid from accounts they can see, and
 * their own net worth snapshots. Nothing here is read on anyone's behalf. */
export async function getMoneyRecap(me: { id: string; family_id: string; wealth_include_private: boolean | null }, month: string, today: string, tz: string): Promise<Recap> {
  const supabase = await createClient();
  const prev = monthBefore(month);
  const [y, m] = month.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const from = familyMidnight(`${prev}-01`, tz) ?? new Date(`${prev}-01T00:00:00Z`);
  const to = familyMidnight(nextMonth, tz) ?? new Date(`${nextMonth}T00:00:00Z`);

  const [accounts, archived] = await Promise.all([getAccounts(me.family_id), getArchivedAccountsForFlow(me.family_id)]);
  const leaveOut = me.wealth_include_private === false ? me.id : null;
  // Archived and deleted accounts' movements count too: they happened in the month.
  const counted = new Set([...accounts, ...archived].filter((a) => inTotalsScope(a, "all", leaveOut)).map((a) => a.id));

  const [txns, budgetRows, { data: bills }, { data: goals }, { data: snapshots }] = await Promise.all([
    // Two months of movements: one imported statement can pass 1000 rows.
    allRows((a, b) =>
      supabase
        .from("wealth_transactions")
        .select("account_id, direction, amount, category, goal_id, occurred_at")
        .eq("family_id", me.family_id)
        .eq("status", "confirmed")
        .gte("occurred_at", from.toISOString())
        .lt("occurred_at", to.toISOString())
        .order("id")
        .range(a, b),
    ),
    getSpendingBudgetRows(me.family_id),
    supabase
      .from("bills")
      .select("name, amount, due_date, status, paid_at")
      .eq("family_id", me.family_id)
      .gte("due_date", `${month}-01`)
      .lt("due_date", nextMonth)
      .or(paidFromVisibleFilter(accounts.map((a) => a.id))),
    supabase.from("goals").select("id, title, target_amount, current_amount").eq("family_id", me.family_id),
    supabase.from("net_worth_snapshots").select("month, net_worth").eq("viewer_member_id", me.id).eq("scope", "all").in("month", [`${month}-01`, `${prev}-01`]),
  ]);

  const rows = txns.filter((t) => counted.has(t.account_id));
  const recapTxns: RecapTxn[] = rows.map((t) => ({
    month: familyDay(new Date(t.occurred_at), tz).slice(0, 7),
    direction: t.direction === "in" ? "in" : "out",
    amount: Number(t.amount),
    category: t.category,
    goalId: t.goal_id,
  }));
  const snap = (mo: string) => {
    const s = (snapshots ?? []).find((r) => r.month.slice(0, 7) === mo);
    return s ? Number(s.net_worth) : null;
  };

  return buildRecap({
    month,
    today,
    txns: recapTxns,
    // All's budgets that month, as Wealth shows them: every category budget
    // the viewer can see, added up (26 October). A removed one is none.
    allocations: [...budgetsFor(budgetsInForce(budgetRows, month), "all").entries()].map(([category, amount]) => ({ category, amount })),
    bills: (bills ?? [])
      .filter((b): b is typeof b & { due_date: string } => !!b.due_date)
      .map((b) => ({ name: b.name, amount: Number(b.amount), dueDate: b.due_date, status: b.status, paidDay: b.paid_at ? familyDay(new Date(b.paid_at), tz) : null })),
    goals: (goals ?? []).map((g) => ({ id: g.id, title: g.title, target: Number(g.target_amount ?? 0), current: Number(g.current_amount) })),
    goalMoves: recapTxns.filter((t) => t.goalId).map((t) => ({ goalId: t.goalId!, month: t.month, direction: t.direction, amount: t.amount })),
    netWorth: { end: snap(month), start: snap(prev) },
  });
}
