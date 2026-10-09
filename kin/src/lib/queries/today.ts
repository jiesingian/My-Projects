import { householdZone } from "@/lib/household-zone";
import { createClient } from "@/lib/supabase/server";
import { formatAccounting, formatCurrency } from "@/lib/format";
import { getPricedBuyList } from "@/lib/queries/household-money";
import { familyDay as localDay, familyTime as localTime, familyClock, familyMidnight } from "@/lib/time";
import { formatTimeOfDay } from "@/lib/routines";
import type { IconName } from "@/components/icons";
import { isForMe, taggedFrom, whoseFor, type Whose } from "@/lib/for-me";
import { DEFAULT_BILL_REMIND_DAYS } from "@/lib/wealth";

/** Who is looking: Today shows them what is theirs (lib/for-me). */
type Viewer = { id: string; role: string };

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
  /** What Today offers on the row (28 September, one list): Done/Skip, Pay/Skip
   * for a bill, Shop/Skip for the list. Absent: nothing to mark (a meal). */
  action?: "done" | "pay" | "shop";
  /** Marked today, from today_marks: shown done or skipped, with Undo. */
  mark?: "done" | "skipped";
  /** Coming up only: which page it sits on -- the reader's own, the
   * family's, or another member's (lib/for-me, whoseFor). */
  whose?: Whose;
  /** Coming up only: who it is tagged to, for its Who dropdown. Empty for
   * the family's (bills, meals, whole-family plans). */
  memberIds?: string[];
};

/** One tile in "At a glance": the single figure that matters in one part of
 * the household, and where tapping it goes. These replaced the five hub
 * cards, which only repeated the bottom bar -- a tile answers a question
 * ("how much is left?") where a hub card only named a place. */
export type GlanceTile = {
  id: "money" | "goal" | "shop" | "waiting" | "next";
  icon: IconName;
  /** The figure itself, short enough to read at a glance: "₱18,400". */
  value: string;
  /** What the figure is: "left this month". */
  label: string;
  href: string;
  /** 0..1, drawn as a thin bar under the figure. Only money has one. */
  progress?: number;
  /** Over budget, or something overdue: the figure takes the warning tint. */
  warn?: boolean;
};

/** The pieces of "At a glance" that need their own reads: money, the
 * shopping list, and the reader's next plan. The page puts them in the
 * order of the tabs (29 September, Janine): what is waiting or next
 * (Planner), the goal (Planner), shopping or today's meal (Household), money
 * (Wealth). */
export async function getGlance(familyId: string, currency: string, me: Viewer): Promise<{ money: GlanceTile; shop: GlanceTile; next: GlanceTile | null }> {
  const tz = await householdZone();
  const supabase = await createClient();
  const now = new Date();
  // The month in the household's zone, not the server's: on a server in UTC
  // the first eight hours of the 1st in Manila still belong to last month.
  const [year, month] = localDay(now, tz).split("-").map(Number);
  const startOfMonth = (familyMidnight(`${year}-${String(month).padStart(2, "0")}-01`, tz) ?? now).toISOString();

  const [budgetPeriod, monthSpend, shop, upcoming] = await Promise.all([
    supabase
      .from("budget_periods")
      .select("budget_amount")
      .eq("family_id", familyId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle(),
    supabase
      .from("wealth_transactions")
      .select("amount")
      .eq("family_id", familyId)
      .eq("direction", "out")
      .eq("status", "confirmed")
      .gte("occurred_at", startOfMonth),
    getPricedBuyList(familyId),
    // The reader's next plan, for the first tile when no chore is waiting
    // (29 September): theirs, the family's or a child's -- lib/for-me.
    supabase
      .from("activities")
      .select("title, start_at, applies_to_whole_family, activity_members(member_id, members(role))")
      .eq("family_id", familyId)
      .eq("status", "upcoming")
      .gte("start_at", now.toISOString())
      .order("start_at", { ascending: true })
      .limit(25),
  ]);

  const nextMine = (upcoming.data ?? []).find((a) => isForMe(me, a.applies_to_whole_family, taggedFrom(a.activity_members)));
  const next: GlanceTile | null = nextMine
    ? {
        id: "next",
        icon: "calendarDays",
        value: `${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short" }).format(new Date(nextMine.start_at))} ${localTime(new Date(nextMine.start_at), tz)}`,
        label: `next: ${nextMine.title}`,
        href: "/planner",
      }
    : null;

  const spent = (monthSpend.data ?? []).reduce((sum, t) => sum + Number(t.amount), 0);
  const target = budgetPeriod.data ? Number(budgetPeriod.data.budget_amount) : 0;
  const money: GlanceTile =
    target > 0
      ? spent > target
        ? { id: "money", icon: "wallet", value: formatAccounting(spent - target, currency), label: "over this month's budget", href: "/wealth", progress: 1, warn: true }
        : { id: "money", icon: "wallet", value: formatAccounting(target - spent, currency), label: "left this month", href: "/wealth", progress: spent / target }
      : { id: "money", icon: "wallet", value: formatAccounting(spent, currency), label: "spent this month", href: "/wealth" };

  const open = shop.items.filter((i) => !i.checked);
  const shopTile: GlanceTile = {
    id: "shop",
    icon: "basket",
    value: open.length === 0 ? "List clear" : `${open.length} to buy`,
    label:
      open.length === 0
        ? "shopping list is empty"
        : shop.estimatedRemaining > 0
          ? `about ${formatAccounting(shop.estimatedRemaining, currency)}${shop.unpricedCount > 0 ? " + unpriced" : ""}`
          : open.slice(0, 3).map((i) => i.name).join(", "),
    href: "/household?seg=buy",
  };

  return { money, shop: shopTile, next };
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
export async function getTodayBriefing(familyId: string, currency: string, me: Viewer): Promise<BriefItem[]> {
  const tz = await householdZone();
  const supabase = await createClient();
  const now = new Date();
  const today = localDay(now, tz);

  // Activities are stored as instants, so they cannot be filtered on the
  // household's local day in the query. A 48-hour window either way is small
  // enough to fetch and be certain the local day is fully covered whatever
  // the offset, and the day is picked out below.
  const windowStart = new Date(now.getTime() - 36 * 3600_000).toISOString();
  const windowEnd = new Date(now.getTime() + 48 * 3600_000).toISOString();

  const [activities, events, bills, health, meals, buyCount, marks] = await Promise.all([
    supabase
      .from("activities")
      .select("id, title, start_at, location, status, applies_to_whole_family, activity_members(member_id, members(role))")
      .eq("family_id", familyId)
      // Completed and cancelled ones come back too, so a plan ticked off
      // today stays on Today as done (with Undo) instead of vanishing.
      .in("status", ["upcoming", "completed", "cancelled"])
      .gte("start_at", windowStart)
      .lt("start_at", windowEnd)
      .order("start_at", { ascending: true }),
    // Birthdays and anniversaries are stored on the date they first happened
    // and marked recurring, so matching on event_date alone would only ever
    // find someone's actual birth. Recurring ones are few — one per person —
    // so they come back whole and the month and day are compared here.
    supabase
      .from("events")
      .select("id, title, kind, event_date, recurs_yearly, sub_note, applies_to_whole_family, event_members(member_id, members(role))")
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
      .select("id, what, when_date, status, member_id, member:members!health_schedule_member_id_fkey(full_name, role)")
      .eq("family_id", familyId)
      .in("status", ["due", "due_soon", "given"])
      .order("when_date", { ascending: true })
      .limit(6),
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
    supabase.from("today_marks").select("item_key, state").eq("family_id", familyId).eq("day", today),
  ]);

  // What the household has already done or skipped today. A table that is not
  // there yet (before its migration runs) reads as "nothing marked".
  const marked = new Map<string, "done" | "skipped">((marks.data ?? []).map((m) => [m.item_key, m.state as "done" | "skipped"]));

  const items: BriefItem[] = [];

  for (const a of activities.data ?? []) {
    const start = new Date(a.start_at);
    if (localDay(start, tz) !== today) continue;
    if (!isForMe(me, a.applies_to_whole_family, taggedFrom(a.activity_members))) continue;
    const key = `activity-${a.id}`;
    // A plan completed or cancelled on another day, or from the Planner
    // without a mark here, is not today's business any more.
    if (a.status !== "upcoming" && !marked.has(key)) continue;
    items.push({
      id: key,
      action: "done",
      mark: marked.get(key),
      icon: "calendarDays",
      tint: "schedule",
      title: a.title,
      // Written the way the chores beside it are ("6:00 pm"), not "6:00 PM".
      meta: [formatTimeOfDay(familyClock(start, tz)), a.location].filter(Boolean).join(" · "),
      href: "/planner",
      at: start.getTime(),
    });
  }

  const monthDay = today.slice(5);
  for (const e of events.data ?? []) {
    const isToday = e.recurs_yearly ? e.event_date.slice(5) === monthDay : e.event_date === today;
    if (!isToday) continue;
    if (!isForMe(me, e.applies_to_whole_family, taggedFrom(e.event_members))) continue;
    // A birthday reads better with the number on it than without.
    const years = e.recurs_yearly ? Number(today.slice(0, 4)) - Number(e.event_date.slice(0, 4)) : 0;
    const ordinal = e.kind === "birthday" && years > 0 ? `Turns ${years} today` : e.kind === "anniversary" && years > 0 ? `${years} years today` : "Today";
    items.push({
      id: `event-${e.id}`,
      // No Done or Skip (Jonathan, 28 September): a birthday or an event is
      // the whole day and finishes by itself; it only needs to be seen.
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
      action: "pay",
      mark: marked.get(`bill-${b.id}`),
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
    if (!isForMe(me, false, [{ id: h.member_id, role: (h.member as unknown as { role: string } | null)?.role }])) continue;
    // Given long ago is history; given today (marked here) shows as done.
    if (h.status === "given" && !marked.has(`health-${h.id}`)) continue;
    items.push({
      id: `health-${h.id}`,
      action: "done",
      mark: marked.get(`health-${h.id}`),
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
      action: "shop",
      mark: marked.get("buy"),
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

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

/** What is coming in the next week that is worth acting on before the day:
 * a birthday to get a gift for, a bill about to fall due, a check-up to book,
 * tomorrow's early start, tomorrow's dinner that is missing ingredients.
 *
 * The briefing above answers "what is today"; this answers "what should I
 * sort out now so it is not a scramble later", which is the reminder a good
 * family assistant gives without being asked. Nothing that is already in
 * today's briefing appears here. */
export async function getComingUp(familyId: string, currency: string, me: Viewer): Promise<BriefItem[]> {
  const tz = await householdZone();
  const supabase = await createClient();
  const now = new Date();
  const today = localDay(now, tz);
  const tomorrow = addDays(today, 1);
  const weekOut = addDays(today, 7);
  const dayIndex = new Map<string, number>();
  for (let i = 1; i <= 7; i++) dayIndex.set(addDays(today, i).slice(5), i);

  const [events, bills, health, tasks, meals] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, kind, event_date, recurs_yearly, applies_to_whole_family, event_members(member_id, members(role))")
      .eq("family_id", familyId)
      .or(`and(event_date.gt.${today},event_date.lte.${weekOut}),recurs_yearly.eq.true`),
    supabase
      .from("bills")
      .select("*")
      .eq("family_id", familyId)
      .eq("status", "unpaid")
      .gt("due_date", today)
      // Each bill says how far ahead it wants to be heard of (3 days unless
      // set, at most 30); the ones not yet inside their window drop below.
      .lte("due_date", addDays(today, 30))
      .order("due_date", { ascending: true }),
    supabase
      .from("health_schedule")
      .select("id, what, when_date, member_id, member:members!health_schedule_member_id_fkey(full_name, role)")
      .eq("family_id", familyId)
      .in("status", ["due", "due_soon"])
      .gt("when_date", today)
      .lte("when_date", weekOut)
      .order("when_date", { ascending: true })
      .limit(3),
    supabase
      .from("activities")
      .select("id, title, start_at, location, applies_to_whole_family, activity_members(member_id, members(role))")
      .eq("family_id", familyId)
      .eq("status", "upcoming")
      .gte("start_at", new Date(now.getTime() + 6 * 3600_000).toISOString())
      .lt("start_at", new Date(now.getTime() + 54 * 3600_000).toISOString())
      .order("start_at", { ascending: true }),
    supabase
      .from("meal_plans")
      .select("id, dish, meal_ingredients(item_key, ingredient_name)")
      .eq("family_id", familyId)
      .eq("plan_date", tomorrow),
  ]);

  const items: BriefItem[] = [];

  for (const e of events.data ?? []) {
    const tagged = taggedFrom(e.event_members);
    const whose = whoseFor(me, e.applies_to_whole_family, tagged);
    const inDays = e.recurs_yearly ? dayIndex.get(e.event_date.slice(5)) : e.event_date > today && e.event_date <= weekOut ? Math.round((Date.parse(e.event_date) - Date.parse(today)) / 86_400_000) : undefined;
    if (!inDays) continue;
    const on = inDays === 1 ? "tomorrow" : `on ${weekdayOf(addDays(today, inDays))}`;
    const years = e.recurs_yearly ? Number(addDays(today, inDays).slice(0, 4)) - Number(e.event_date.slice(0, 4)) : 0;
    const what =
      e.kind === "birthday" && years > 0 ? `Turns ${years} ${on}` : e.kind === "anniversary" && years > 0 ? `${years} years ${on}` : `${on[0].toUpperCase()}${on.slice(1)}`;
    const nudge = e.kind === "birthday" || e.kind === "anniversary" ? " · a gift or a greeting?" : "";
    items.push({ id: `soon-event-${e.id}`, icon: e.kind === "birthday" ? "cupcake" : "gift", tint: "occasion", title: e.title, meta: `${what}${nudge}`, href: "/planner", at: inDays, whose, memberIds: e.applies_to_whole_family ? [] : tagged.map((t) => t.id) });
  }

  const billsInWindow = (bills.data ?? [])
    .map((b) => ({ ...b, inDays: Math.round((Date.parse(b.due_date!) - Date.parse(today)) / 86_400_000) }))
    .filter((b) => b.inDays <= (b.remind_days_before ?? DEFAULT_BILL_REMIND_DAYS))
    .slice(0, 3);
  for (const b of billsInWindow) {
    const inDays = b.inDays;
    items.push({
      id: `soon-bill-${b.id}`,
      icon: "wallet",
      tint: "money",
      title: b.name,
      meta: `${formatCurrency(Number(b.amount), currency)} · due ${inDays === 1 ? "tomorrow" : `in ${inDays} days`}`,
      href: "/wealth",
      at: inDays,
    });
  }

  for (const h of health.data ?? []) {
    const who = (h.member as unknown as { full_name: string } | null)?.full_name?.split(" ")[0] ?? "Someone";
    const inDays = Math.round((Date.parse(h.when_date!) - Date.parse(today)) / 86_400_000);
    items.push({ id: `soon-health-${h.id}`, icon: "activity", tint: "occasion", title: `${who} · ${h.what}`, meta: `Due ${inDays === 1 ? "tomorrow" : `in ${inDays} days`} · book it now?`, href: "/family", at: inDays, whose: h.member_id === me.id ? "mine" : "others", memberIds: [h.member_id] });
  }

  // Tomorrow's first thing, if it starts early enough to plan the evening
  // around -- school programs, flights, a 7am practice.
  // Every early start tomorrow: there are only ever a few, and the Who
  // dropdown shows whichever are wanted.
  for (const a of tasks.data ?? []) {
    const start = new Date(a.start_at);
    if (localDay(start, tz) !== tomorrow || Number(localTime(start, tz).slice(0, 2)) >= 10) continue;
    const tagged = taggedFrom(a.activity_members);
    const whose = whoseFor(me, a.applies_to_whole_family, tagged);
    items.push({ id: `soon-task-${a.id}`, icon: "clock", tint: "schedule", title: a.title, meta: ["Early start tomorrow", localTime(start, tz), a.location].filter(Boolean).join(" · "), href: "/planner", at: 1, whose, memberIds: a.applies_to_whole_family ? [] : tagged.map((t) => t.id) });
  }

  // Tomorrow's meals, against what is in the house and already on the list.
  const planned = meals.data ?? [];
  if (planned.length > 0) {
    const [{ data: pantry }, { data: onList }] = await Promise.all([
      supabase.from("pantry_items").select("item_key").eq("family_id", familyId),
      supabase.from("buy_items").select("name").eq("family_id", familyId).eq("cleared", false).eq("checked", false),
    ]);
    const have = new Set((pantry ?? []).map((p) => p.item_key));
    const listed = new Set((onList ?? []).map((b) => b.name.trim().toLowerCase()));
    for (const m of planned) {
      const missing = (m.meal_ingredients ?? []).filter((i) => !(i.item_key && have.has(i.item_key)) && !listed.has(i.ingredient_name.trim().toLowerCase()));
      if (!m.dish || missing.length === 0) continue;
      items.push({
        id: `soon-meal-${m.id}`,
        icon: "basket",
        tint: "home",
        title: `Tomorrow's ${m.dish}`,
        meta: `Needs ${missing.length} thing${missing.length === 1 ? "" : "s"} not in the house or on the list`,
        href: `/household?seg=meals&date=${tomorrow}`,
        at: 1,
      });
    }
  }

  // Running low in the pantry and not yet on the list (20260928100000).
  const [{ data: low }, { data: openList }] = await Promise.all([
    supabase.from("pantry_items").select("name").eq("family_id", familyId).eq("running_low", true).order("name"),
    supabase.from("buy_items").select("name").eq("family_id", familyId).eq("checked", false).eq("cleared", false),
  ]);
  const listed = new Set((openList ?? []).map((b) => b.name.trim().toLowerCase()));
  const lowNames = (low ?? []).map((p) => p.name).filter((n) => !listed.has(n.trim().toLowerCase()));
  if (lowNames.length > 0) {
    items.push({
      id: "soon-pantry-low",
      icon: "basket",
      tint: "home",
      title: lowNames.length === 1 ? `Running low: ${lowNames[0]}` : `Running low on ${lowNames.length} things`,
      meta: `${lowNames.slice(0, 4).join(", ")}${lowNames.length > 4 ? "…" : ""} · not on the list yet`,
      href: "/household?seg=buy",
      at: 0.5,
    });
  }

  // Six a page at most, each page in date order. Anything without a page
  // named (bills, meals, the pantry) is the family's.
  const perPage = new Map<Whose, number>();
  return items
    .map((i) => ({ ...i, whose: i.whose ?? "family" }))
    .sort((a, b) => (a.at ?? 9) - (b.at ?? 9))
    .filter((i) => {
      const n = perPage.get(i.whose) ?? 0;
      perPage.set(i.whose, n + 1);
      return n < 6;
    });
}
