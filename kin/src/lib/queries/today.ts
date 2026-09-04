import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import type { IconName } from "@/components/icons";

export type HubCard = {
  n: string;
  name: string;
  icon: IconName;
  primary: string;
  stat: string;
  statLabel: string;
  href: string;
  span?: "full";
};

export async function getHubCards(familyId: string, currency: string): Promise<HubCard[]> {
  const supabase = await createClient();
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const [
    dueHealth,
    journalCount,
    upcomingActivity,
    weekActivityCount,
    unpaidBill,
    openBuyCount,
    budgetPeriod,
    monthSpend,
  ] = await Promise.all([
    supabase
      .from("health_schedule")
      .select("what, when_date, member:members(full_name)")
      .eq("family_id", familyId)
      .in("status", ["due", "due_soon"])
      .order("when_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .gte("entry_date", startOfMonth),
    supabase
      .from("activities")
      .select("title, start_at")
      .eq("family_id", familyId)
      .eq("status", "upcoming")
      .gte("start_at", today.toISOString())
      .order("start_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .gte("start_at", startOfWeek.toISOString())
      .lt("start_at", endOfWeek.toISOString()),
    supabase
      .from("bills")
      .select("name, amount, due_date")
      .eq("family_id", familyId)
      .in("status", ["unpaid", "overdue"])
      .order("due_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("buy_items")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .eq("checked", false)
      .eq("cleared", false),
    supabase
      .from("budget_periods")
      .select("budget_amount")
      .eq("family_id", familyId)
      .eq("period_month", today.getMonth() + 1)
      .eq("period_year", today.getFullYear())
      .maybeSingle(),
    supabase
      .from("wealth_transactions")
      .select("amount")
      .eq("family_id", familyId)
      .eq("direction", "out")
      .eq("status", "confirmed")
      .gte("occurred_at", startOfMonth),
  ]);

  const alertCount = (dueHealth.data ? 1 : 0);
  const healthPrimary = dueHealth.data
    ? `${(dueHealth.data.member as unknown as { full_name: string } | null)?.full_name ?? "Someone"} · ${dueHealth.data.what}`
    : "Nothing due — add a member to get started";

  const journalPrimary =
    (journalCount.count ?? 0) > 0
      ? `${journalCount.count} entr${journalCount.count === 1 ? "y" : "ies"} logged this month`
      : "Nothing logged yet this month";

  const plannerPrimary = upcomingActivity.data
    ? `${upcomingActivity.data.title}, ${new Date(upcomingActivity.data.start_at).toLocaleString("en-PH", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "Nothing scheduled — add an activity";

  const householdPrimary =
    (openBuyCount.count ?? 0) > 0 ? `${openBuyCount.count} item${openBuyCount.count === 1 ? "" : "s"} still to buy` : "Shopping list is clear";

  const spent = (monthSpend.data ?? []).reduce((sum, t) => sum + Number(t.amount), 0);
  const target = budgetPeriod.data ? Number(budgetPeriod.data.budget_amount) : 0;
  const pct = target > 0 ? Math.round((spent / target) * 100) : 0;
  const wealthPrimary = unpaidBill.data
    ? `${unpaidBill.data.name} due · ${formatCurrency(Number(unpaidBill.data.amount), currency)}`
    : target > 0
      ? `${today.toLocaleString("en-PH", { month: "long" })} budget — ${formatCurrency(spent, currency)} of ${formatCurrency(target, currency)}`
      : `${formatCurrency(spent, currency)} spent this month`;

  return [
    {
      n: "01",
      name: "Family",
      icon: "users",
      primary: healthPrimary,
      stat: String(alertCount),
      statLabel: "alerts",
      href: "/family",
    },
    {
      n: "02",
      name: "Journal",
      icon: "images",
      primary: journalPrimary,
      stat: String(journalCount.count ?? 0),
      statLabel: "entries",
      href: "/journal",
    },
    {
      n: "03",
      name: "Planner",
      icon: "calendarDays",
      primary: plannerPrimary,
      stat: String(weekActivityCount.count ?? 0),
      statLabel: "this week",
      href: "/planner",
    },
    {
      n: "04",
      name: "Household",
      icon: "house",
      primary: householdPrimary,
      stat: String(openBuyCount.count ?? 0),
      statLabel: "to buy",
      href: "/household",
    },
    {
      n: "05",
      name: "Wealth",
      icon: "wallet",
      primary: wealthPrimary,
      stat: `${pct}%`,
      statLabel: "spent",
      href: "/wealth",
      span: "full",
    },
  ];
}
