import { createClient } from "@/lib/supabase/server";
import { getAccounts, getArchivedAccountsForFlow } from "@/lib/queries/wealth";
import { familyMidnight } from "@/lib/time";
import { inTotalsScope } from "@/lib/wealth";
import { buildYearReview, type YearReview } from "@/lib/year-review";
import { allRows } from "@/lib/queries/all-rows";

/** One year's review, read as the viewer exactly as the monthly recap is
 * (queries/money-recap.ts): the accounts they can see, their own private
 * accounts left out if they chose that, and their own net worth snapshots
 * -- the year's first and last. */
export async function getYearReview(me: { id: string; family_id: string; wealth_include_private: boolean | null }, year: number, tz: string): Promise<YearReview> {
  const supabase = await createClient();
  const from = familyMidnight(`${year}-01-01`, tz) ?? new Date(`${year}-01-01T00:00:00Z`);
  const to = familyMidnight(`${year + 1}-01-01`, tz) ?? new Date(`${year + 1}-01-01T00:00:00Z`);
  const [accounts, archived] = await Promise.all([getAccounts(me.family_id), getArchivedAccountsForFlow(me.family_id)]);
  const leaveOut = me.wealth_include_private === false ? me.id : null;
  const counted = new Set([...accounts, ...archived].filter((a) => inTotalsScope(a, "all", leaveOut)).map((a) => a.id));
  const [txns, { data: snapshots }] = await Promise.all([
    allRows((a, b) =>
      supabase
        .from("wealth_transactions")
        .select("account_id, direction, amount, category, goal_id, source_table, principal_amount, capital")
        .eq("family_id", me.family_id)
        .eq("status", "confirmed")
        .gte("occurred_at", from.toISOString())
        .lt("occurred_at", to.toISOString())
        .order("id")
        .range(a, b),
    ),
    supabase.from("net_worth_snapshots").select("day, net_worth").eq("viewer_member_id", me.id).eq("scope", "all").gte("day", `${year}-01-01`).lt("day", `${year + 1}-01-01`).order("day", { ascending: true }),
  ]);
  const snaps = snapshots ?? [];
  return buildYearReview({
    year,
    txns: txns
      .filter((t) => counted.has(t.account_id))
      .map((t) => ({ direction: t.direction === "in" ? "in" : "out", amount: Number(t.amount), category: t.category, goalId: t.goal_id, sourceTable: t.source_table, principal: t.principal_amount == null ? null : Number(t.principal_amount), capital: !!t.capital })),
    netWorth: { start: snaps.length > 1 ? Number(snaps[0].net_worth) : null, end: snaps.length > 1 ? Number(snaps[snaps.length - 1].net_worth) : null },
  });
}
