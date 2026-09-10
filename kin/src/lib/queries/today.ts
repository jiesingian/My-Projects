import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import { familyDay as localDay, familyTime as localTime } from "@/lib/time";
import { startOfWeek, weekStartOf } from "@/lib/week";
import type { IconName } from "@/components/icons";

/** One line in the briefing. Deliberately flat and pre-formatted: the page
 * renders these without knowing which hub any of them came from. */
export type BriefItem = {
  id: string;
  icon: IconName;
  tint: "money" | "schedule" | "occasion" | "home";
  title: string;
  meta: string;
  href: string;
  /** Overdue, or due today. Sorts to the top and takes a warning tint. */
  urgent?: boolean;
  /** Epoch ms for things that happen at a time of day, so the day reads in
   * order. Absent for things that are simply true all day. */
  at?: number;
};

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

export async function getHubCards(familyId: string, currency: string, weekStartPref?: string | null): Promise<HubCard[]> {
  const supabase = await createClient();
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  // Whichever day the household said its week starts on. This counted from
  // getDay() -- Sunday, always -- while the Planner it links to has laid its
  // columns out from the preference since lib/week.ts was written. So a
  // household set to Monday saw "N THIS WEEK" counted Sunday to Saturday
  // under a Planner drawn Monday to Sunday, and on a Sunday the two disagreed
  // by a whole week: an activity that day counted here and appeared in last
  // week there. That is the exact bug lib/week.ts exists to end -- "the
  // setting saved cleanly and changed nothing" -- surviving in the one place
  // that had not been converted.
  const weekBegins = startOfWeek(today, weekStartOf(weekStartPref));
  const weekEnds = new Date(weekBegins);
  weekEnds.setDate(weekBegins.getDate() + 7);

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
      .select("what, when_date, member:members!health_schedule_member_id_fkey(full_name)")
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
      .gte("start_at", weekBegins.toISOString())
      .lt("start_at", weekEnds.toISOString()),
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

/** What actually needs the household today, gathered from every hub into one
 * list.
 *
 * The hub cards below this on the page answer "where do I go"; they are a
 * table of contents, and a table of contents is not a reason to open an app
 * every morning. This answers "what do I need to know", which is — so it runs
 * first and everything else on the page is subordinate to it.
 *
 * Six sources, one shape, one order: anything overdue or due today first,
 * then whatever happens at a time of day in the order it happens, then the
 * things that are simply true all day. */
export async function getTodayBriefing(familyId: string, currency: string): Promise<BriefItem[]> {
  const supabase = await createClient();
  const now = new Date();
  const today = localDay(now);

  // Activities are stored as instants, so they cannot be filtered on the
  // household's local day in the query. A 48-hour window either way is small
  // enough to fetch and be certain the local day is fully covered whatever
  // the offset, and the day is picked out below.
  const windowStart = new Date(now.getTime() - 36 * 3600_000).toISOString();
  const windowEnd = new Date(now.getTime() + 48 * 3600_000).toISOString();

  const [activities, events, bills, health, meals, buyCount] = await Promise.all([
    supabase
      .from("activities")
      .select("id, title, start_at, location")
      .eq("family_id", familyId)
      .eq("status", "upcoming")
      .gte("start_at", windowStart)
      .lt("start_at", windowEnd)
      .order("start_at", { ascending: true }),
    // Birthdays and anniversaries are stored on the date they first happened
    // and marked recurring, so matching on event_date alone would only ever
    // find someone's actual birth. Recurring ones are few — one per person —
    // so they come back whole and the month and day are compared here.
    supabase
      .from("events")
      .select("id, title, kind, event_date, recurs_yearly, sub_note")
      .eq("family_id", familyId)
      .or(`event_date.eq.${today},recurs_yearly.eq.true`),
    supabase
      .from("bills")
      .select("id, name, amount, due_date")
      .eq("family_id", familyId)
      .in("status", ["unpaid", "overdue"])
      .lte("due_date", today)
      .order("due_date", { ascending: true })
      .limit(4),
    supabase
      .from("health_schedule")
      .select("id, what, when_date, member:members!health_schedule_member_id_fkey(full_name)")
      .eq("family_id", familyId)
      .in("status", ["due", "due_soon"])
      .order("when_date", { ascending: true })
      .limit(3),
    supabase
      .from("meal_plans")
      .select("id, dish, slot")
      .eq("family_id", familyId)
      .eq("plan_date", today)
      .order("position", { ascending: true }),
    supabase
      .from("buy_items")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .eq("checked", false)
      .eq("cleared", false),
  ]);

  const items: BriefItem[] = [];

  for (const a of activities.data ?? []) {
    const start = new Date(a.start_at);
    if (localDay(start) !== today) continue;
    items.push({
      id: `activity-${a.id}`,
      icon: "calendarDays",
      tint: "schedule",
      title: a.title,
      meta: [localTime(start), a.location].filter(Boolean).join(" · "),
      href: "/planner",
      at: start.getTime(),
    });
  }

  const monthDay = today.slice(5);
  for (const e of events.data ?? []) {
    const isToday = e.recurs_yearly ? e.event_date.slice(5) === monthDay : e.event_date === today;
    if (!isToday) continue;
    // A birthday reads better with the number on it than without.
    const years = e.recurs_yearly ? Number(today.slice(0, 4)) - Number(e.event_date.slice(0, 4)) : 0;
    const ordinal = e.kind === "birthday" && years > 0 ? `Turns ${years} today` : e.kind === "anniversary" && years > 0 ? `${years} years today` : "Today";
    items.push({
      id: `event-${e.id}`,
      icon: e.kind === "birthday" ? "cupcake" : "gift",
      tint: "occasion",
      title: e.title,
      meta: [ordinal, e.sub_note].filter(Boolean).join(" · "),
      href: "/planner",
    });
  }

  for (const b of bills.data ?? []) {
    // lte already excludes nulls, but the column is nullable and the type
    // says so; a bill without a date is treated as not yet overdue.
    const overdue = !!b.due_date && b.due_date < today;
    items.push({
      id: `bill-${b.id}`,
      icon: "wallet",
      tint: "money",
      title: b.name,
      meta: `${formatCurrency(Number(b.amount), currency)} · ${overdue ? "overdue" : "due today"}`,
      href: "/wealth",
      urgent: true,
    });
  }

  for (const h of health.data ?? []) {
    const who = (h.member as unknown as { full_name: string } | null)?.full_name?.split(" ")[0] ?? "Someone";
    items.push({
      id: `health-${h.id}`,
      icon: "activity",
      tint: "occasion",
      title: `${who} · ${h.what}`,
      meta: h.when_date && h.when_date < today ? "overdue" : "due",
      href: "/family",
      urgent: Boolean(h.when_date && h.when_date <= today),
    });
  }

  for (const m of meals.data ?? []) {
    if (!m.dish) continue;
    items.push({
      id: `meal-${m.id}`,
      icon: "house",
      tint: "home",
      title: m.dish,
      meta: m.slot ? String(m.slot) : "Planned today",
      href: "/household",
    });
  }

  if ((buyCount.count ?? 0) > 0) {
    items.push({
      id: "buy",
      icon: "house",
      tint: "home",
      title: `${buyCount.count} thing${buyCount.count === 1 ? "" : "s"} to buy`,
      meta: "Shopping list",
      href: "/household",
    });
  }

  return items.sort((a, b) => {
    if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
    if (a.at != null && b.at != null) return a.at - b.at;
    if (a.at != null) return -1;
    if (b.at != null) return 1;
    return 0;
  });
}
