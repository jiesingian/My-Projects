import { cache } from "react";
import { householdZone } from "@/lib/household-zone";
import { createClient } from "@/lib/supabase/server";
import { getSpendingBudgetRows } from "@/lib/queries/wealth";
import { budgetsFor, budgetsInForce, budgetTotal } from "@/lib/budgets";
import { formatAccounting, formatCurrency } from "@/lib/format";
import { getPricedBuyList } from "@/lib/queries/household-money";
import { familyDay as localDay, familyTime as localTime, familyClock, familyMidnight } from "@/lib/time";
import { formatTimeOfDay } from "@/lib/routines";
import type { IconName } from "@/components/icons";
import { isForMe, taggedFrom, whoseFor, type Whose } from "@/lib/for-me";
import { DEFAULT_BILL_REMIND_DAYS, pendingBriefItems, pendingRows } from "@/lib/wealth";
import { occurrenceStarts } from "@/lib/activity-repeat";
import { remembranceItems, type Departed } from "@/lib/remembrance";
import { getRelativesPotlucks } from "@/lib/queries/potluck";
import { isChild, isGrownUp } from "@/lib/roles";
import { isGone } from "@/lib/member-status";
import { dosesFor, type DueDose } from "@/lib/health-plan";
import { doseRows, type TodayDose } from "@/lib/today-doses";
import { shopGlance } from "@/lib/shop-glance";
import { eventIsCurrent } from "@/lib/planner-done";
import { nextEventDate } from "@/lib/grocery";
import { rsvpOpen } from "@/lib/event-rsvp";
import { potluckLines } from "@/lib/potluck";
import { getGame } from "@/lib/queries/game";
import { weekStartOf } from "@/lib/week";

/** Tasks that start in [fromISO, …), or repeating ones that have not ended
 * by `fromDay` -- a weekly task's later days are on its rule, not its row
 * (lib/activity-repeat), so they are fetched and expanded here. */
const startsOrRepeats = (fromISO: string, fromDay: string) =>
  `start_at.gte.${fromISO},and(repeat.neq.once,or(repeat_until.is.null,repeat_until.gte.${fromDay}))`;

const repeats = (a: { repeat: string | null }) => !!a.repeat && a.repeat !== "once";

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
   * for a bill, Shop/Skip for the list; since 23 October Record (money
   * coming back, a loan or fund payment), Confirm (a bill paid elsewhere)
   * and Receive (income), each opening where that happens in Wealth.
   * Absent: nothing to mark (a meal). */
  action?: "done" | "pay" | "shop" | "record" | "confirm" | "receive";
  /** Marked today, from today_marks: shown done or skipped, with Undo. */
  mark?: "done" | "skipped";
  /** An event still waiting on the reader's RSVP (23 October): the row
   * offers Going / Can't go (components/rsvp-buttons). */
  rsvp?: { eventId: string; memberId: string };
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
  id: "money" | "goal" | "shop" | "waiting" | "next" | "medicine" | "week";
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

/** The pieces of "At a glance" that need their own reads: money and the
 * shopping list. The page puts them after This week and Goals (26
 * October): shopping or today's meal (Household), money (Wealth). */
export async function getGlance(familyId: string, currency: string): Promise<{ money: GlanceTile; shop: GlanceTile }> {
  const tz = await householdZone();
  const supabase = await createClient();
  const now = new Date();
  // The month in the household's zone, not the server's: on a server in UTC
  // the first eight hours of the 1st in Manila still belong to last month.
  const [year, month] = localDay(now, tz).split("-").map(Number);
  const startOfMonth = (familyMidnight(`${year}-${String(month).padStart(2, "0")}-01`, tz) ?? now).toISOString();

  const today = localDay(now, tz);
  const [budgetRows, monthSpend, shop, { data: low }, { data: weekBills }, { data: todayMeals }] = await Promise.all([
    // The month's budget is every category budget the viewer can see,
    // Family's and each person's, added up (26 October), as All shows it.
    getSpendingBudgetRows(familyId),
    supabase
      .from("wealth_transactions")
      .select("amount")
      .eq("family_id", familyId)
      .eq("direction", "out")
      .eq("status", "confirmed")
      .gte("occurred_at", startOfMonth),
    getPricedBuyList(familyId),
    // Running low in the pantry: said on the tile, not a card of its own.
    supabase.from("pantry_items").select("name").eq("family_id", familyId).eq("running_low", true),
    // With no budget set, the tile says what the week asks instead (23
    // October): the bills due in the next seven days.
    supabase.from("bills").select("amount, due_date").eq("family_id", familyId).eq("status", "unpaid").gte("due_date", today).lte("due_date", addDays(today, 7)).order("due_date", { ascending: true }),
    // Today's meals against the house and the list (decision 7, 23 October):
    // a shortfall is said on the tile, as tomorrow's is in Coming up.
    supabase.from("meal_plans").select("id, dish, meal_ingredients(item_key, ingredient_name)").eq("family_id", familyId).eq("plan_date", today).order("position", { ascending: true }),
  ]);

  const spent = (monthSpend.data ?? []).reduce((sum, t) => sum + Number(t.amount), 0);
  const target = budgetTotal(budgetsFor(budgetsInForce(budgetRows, `${year}-${String(month).padStart(2, "0")}`), "all"));
  const bills = weekBills ?? [];
  const billsLine =
    bills.length > 0
      ? `${bills.length} bill${bills.length === 1 ? "" : "s"} by ${weekdayOf(bills[bills.length - 1].due_date!).slice(0, 3)} · ${formatAccounting(bills.reduce((sum, b) => sum + Number(b.amount), 0), currency)}`
      : null;
  const money: GlanceTile =
    target > 0
      ? spent > target
        ? { id: "money", icon: "wallet", value: formatAccounting(spent - target, currency), label: "over this month's budget", href: "/wealth", progress: 1, warn: true }
        : { id: "money", icon: "wallet", value: formatAccounting(target - spent, currency), label: "left this month", href: "/wealth", progress: spent / target }
      : billsLine
        ? { id: "money", icon: "wallet", value: formatAccounting(spent, currency), label: `spent this month · ${billsLine}`, href: "/wealth?seg=cashflow&open=expenses" }
        : { id: "money", icon: "wallet", value: formatAccounting(spent, currency), label: "spent this month", href: "/wealth" };

  // Today's one mention of the shopping list (Janine, 21 October).
  const open = shop.items.filter((i) => !i.checked);
  const listed = new Set(open.map((i) => i.name.trim().toLowerCase()));
  const lowCount = (low ?? []).filter((p) => !listed.has(p.name.trim().toLowerCase())).length;
  const said = shopGlance({ open: open.map((i) => i.name), estimate: shop.estimatedRemaining, unpriced: shop.unpricedCount, low: lowCount }, (n) => formatAccounting(n, currency));
  // Today's meal missing things not in the house and not on the list.
  const planned = (todayMeals ?? []).filter((m) => m.dish && (m.meal_ingredients ?? []).length > 0);
  if (planned.length > 0) {
    const { data: pantry } = await supabase.from("pantry_items").select("item_key").eq("family_id", familyId);
    const have = new Set((pantry ?? []).map((p) => p.item_key));
    for (const m of planned) {
      const missing = (m.meal_ingredients ?? []).filter((i) => !(i.item_key && have.has(i.item_key)) && !listed.has(i.ingredient_name.trim().toLowerCase())).length;
      if (missing === 0) continue;
      said.label = `${said.label} · ${m.dish} needs ${missing}`;
      break;
    }
  }
  const shopTile: GlanceTile = { id: "shop", icon: "basket", value: said.value, label: said.label, href: "/household?seg=buy" };

  return { money, shop: shopTile };
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

  // The household's day as instants, for the visits booked at a time.
  const dayStart = (familyMidnight(today, tz) ?? now).toISOString();
  const dayEnd = (familyMidnight(addDays(today, 1), tz) ?? now).toISOString();

  const [activities, events, bills, health, visits, meals, marks, departed, rsvps] = await Promise.all([
    supabase
      .from("activities")
      .select("id, title, start_at, location, status, repeat, repeat_days, repeat_until, applies_to_whole_family, activity_members(member_id, members(role))")
      .eq("family_id", familyId)
      // Completed and cancelled ones come back too, so a plan ticked off
      // today stays on Today as done (with Undo) instead of vanishing.
      .in("status", ["upcoming", "completed", "cancelled"])
      .lt("start_at", windowEnd)
      .or(startsOrRepeats(windowStart, today))
      .order("start_at", { ascending: true }),
    // Birthdays and anniversaries are stored on the date they first happened
    // and marked recurring, so matching on event_date alone would only ever
    // find someone's actual birth. Recurring ones are few — one per person —
    // so they come back whole and the day is settled here. A trip or any
    // other multi-day event under way (end_date) is today's too (23 October).
    supabase
      .from("events")
      .select("id, title, kind, event_date, end_date, recurs_yearly, sub_note, applies_to_whole_family, event_members(member_id, members(role))")
      .eq("family_id", familyId)
      .or(`event_date.eq.${today},recurs_yearly.eq.true,and(event_date.lte.${today},end_date.gte.${today})`),
    supabase
      .from("bills")
      .select("id, name, amount, due_date, status")
      .eq("family_id", familyId)
      // Scheduled: paid in another app and waiting on its confirmation in
      // Accounts (23 October) -- it was pushed as due and hidden here.
      .in("status", ["unpaid", "overdue", "scheduled"])
      .lte("due_date", today)
      .order("due_date", { ascending: true })
      .limit(4),
    supabase
      // Today's: due by today (or with no date), a check-up booked for today
      // or missed, and one given today (marked here). Without the date
      // filter, "due soon" next month sat on Today as "due" every day and
      // again in Coming up (23 October).
      .from("health_schedule")
      .select("id, what, when_date, status, member_id, member:members!health_schedule_member_id_fkey(full_name, role)")
      .eq("family_id", familyId)
      .in("status", ["due", "due_soon", "planned", "scheduled", "given"])
      .or(`when_date.is.null,when_date.lte.${today}`)
      .order("when_date", { ascending: true })
      .limit(6),
    // A doctor's visit booked for today (health_appointments), at its time
    // (23 October): seen, and opened to its visit sheet; nothing to tick.
    supabase
      .from("health_appointments")
      .select("id, what, when_at, where_text, member_id, member:members!health_appointments_member_id_fkey(full_name, role)")
      .eq("family_id", familyId)
      .gte("when_at", dayStart)
      .lt("when_at", dayEnd)
      .order("when_at", { ascending: true }),
    supabase
      .from("meal_plans")
      .select("id, dish, slot")
      .eq("family_id", familyId)
      .eq("plan_date", today)
      .order("position", { ascending: true }),
    supabase.from("today_marks").select("item_key, state").eq("family_id", familyId).eq("day", today),
    departedOnTree(supabase, familyId),
    // The reader's own RSVPs, to know which events still wait on them.
    supabase.from("event_rsvps").select("event_id").eq("family_id", familyId).eq("member_id", me.id),
  ]);
  const answered = new Set((rsvps.data ?? []).map((r) => r.event_id));

  // What the household has already done or skipped today. A table that is not
  // there yet (before its migration runs) reads as "nothing marked".
  const marked = new Map<string, "done" | "skipped">((marks.data ?? []).map((m) => [m.item_key, m.state as "done" | "skipped"]));
  // Money logged ahead of time and still waiting on "it went through"
  // (27 October): a transfer, or an entry made in another app. Until now
  // only whoever opened Accounts saw these. Grown-ups', as money is; the
  // database returns only the accounts the reader may see.
  const pendingTx = isGrownUp(me.role)
    ? await supabase.from("wealth_transactions").select("id, transfer_group_id, direction, amount, occurred_at, particulars, account_id, accounts(name)").eq("family_id", familyId).eq("status", "pending").order("occurred_at", { ascending: false })
    : { data: [] };

  const items: BriefItem[] = [];

  for (const a of activities.data ?? []) {
    // A repeating plan is here on each day its rule falls (lib/activity-repeat),
    // at its usual time; a one-off only on its own day.
    const start = repeats(a) ? occurrenceStarts(a, new Date(a.start_at), today, today, tz)[0] : new Date(a.start_at);
    if (!start || localDay(start, tz) !== today) continue;
    if (!isForMe(me, a.applies_to_whole_family, taggedFrom(a.activity_members))) continue;
    const key = `activity-${a.id}`;
    // A plan completed or cancelled on another day, or from the Planner
    // without a mark here, is not today's business any more. A repeating
    // one is marked a day at a time (today_marks), never as a whole, so its
    // row's status does not hide it.
    if (!repeats(a) && a.status !== "upcoming" && !marked.has(key)) continue;
    // A plan at the household's midnight is an all-day one -- a Google
    // all-day event is stored that way (lib/calendar-shape) -- so it reads
    // without a time and sits with the day's all-day things, not "12:00 am"
    // at the top (23 October).
    const clock = familyClock(start, tz);
    const allDay = clock === "00:00";
    items.push({
      id: key,
      action: "done",
      mark: marked.get(key),
      icon: "calendarDays",
      tint: "schedule",
      title: a.title,
      // Written the way the chores beside it are ("6:00 pm"), not "6:00 PM".
      meta: [allDay ? null : formatTimeOfDay(clock), a.location].filter(Boolean).join(" · "),
      href: "/planner",
      at: allDay ? undefined : start.getTime(),
    });
  }

  for (const e of events.data ?? []) {
    // The Planner's rule (lib/planner-done): a yearly one on this year's turn,
    // a 29 February one on 1 March when the year has no 29th -- matching
    // month and day alone missed it three years in four (23 October).
    if (!eventIsCurrent(e, today)) continue;
    const tagged = taggedFrom(e.event_members);
    if (!isForMe(me, e.applies_to_whole_family, tagged)) continue;
    // Still waiting on the reader's RSVP (lib/event-rsvp: one-off events,
    // asked of the people it is for or everyone): Going / Can't on the row.
    const asked = e.applies_to_whole_family || tagged.length === 0 || tagged.some((t) => t.id === me.id);
    const rsvp = asked && rsvpOpen(e, today) && !answered.has(e.id) ? { eventId: e.id, memberId: me.id } : undefined;
    // A birthday reads better with the number on it than without.
    const years = e.recurs_yearly ? Number(today.slice(0, 4)) - Number(e.event_date.slice(0, 4)) : 0;
    // A multi-day event says how long it runs; its last day says so.
    const multiDay = !e.recurs_yearly && !!e.end_date && e.end_date > e.event_date;
    const ordinal =
      e.kind === "birthday" && years > 0 ? `Turns ${years} today`
      : e.kind === "anniversary" && years > 0 ? `${years} years today`
      : multiDay ? (e.end_date! > today ? `Until ${weekdayOf(e.end_date!)}` : "Last day")
      : "Today";
    items.push({
      id: `event-${e.id}`,
      // No Done or Skip (Jonathan, 28 September): a birthday or an event is
      // the whole day and finishes by itself; it only needs to be seen.
      icon: e.kind === "birthday" ? "cupcake" : "gift",
      tint: "occasion",
      title: e.title,
      meta: [ordinal, e.sub_note, rsvp ? "waiting on your reply" : null].filter(Boolean).join(" · "),
      href: rsvp ? `/planner/add?type=event&id=${e.id}` : "/planner",
      rsvp,
    });
  }

  // The household's own potluck today that still needs things (23 October;
  // Coming up knew only linked households'): said on the event's row.
  await addPotluckNeeds(supabase, familyId, me, items, "event-");

  // Undas, a 40th day, a babang-luksa or an anniversary: seen, never ticked,
  // like a birthday.
  for (const r of remembranceItems(departed, today, 0)) {
    items.push({ id: r.id, icon: "candle", tint: "occasion", title: r.title, meta: r.meta, href: "/family?seg=tree" });
  }

  // One row per pending transfer (both legs are confirmed together) or
  // entry; Confirm opens its sheet under Accounts, "Waiting on you".
  for (const p of pendingBriefItems(pendingRows((pendingTx.data ?? []).map((t) => ({ ...t, accountName: (t.accounts as { name: string } | null)?.name ?? "" }))), currency)) {
    items.push({ ...p, action: "confirm", mark: marked.get(p.id), icon: "wallet", tint: "money" });
  }

  for (const b of bills.data ?? []) {
    // lte already excludes nulls, but the column is nullable and the type
    // says so; a bill without a date is treated as not yet overdue.
    const overdue = !!b.due_date && b.due_date < today;
    if (b.status === "scheduled") {
      items.push({
        id: `bill-${b.id}`,
        action: "confirm",
        mark: marked.get(`bill-${b.id}`),
        icon: "wallet",
        tint: "money",
        title: b.name,
        meta: `${formatCurrency(Number(b.amount), currency)} · paid elsewhere · waiting on confirmation`,
        // Where the pending entry is confirmed: Accounts, "Waiting on you".
        href: "/wealth?seg=accounts",
      });
      continue;
    }
    items.push({
      id: `bill-${b.id}`,
      action: "pay",
      mark: marked.get(`bill-${b.id}`),
      icon: "wallet",
      tint: "money",
      title: b.name,
      // Its day come, Today asks (Jonathan, 26 October); Pay lands on the
      // same question in Wealth, the amount there to change.
      meta: `${formatCurrency(Number(b.amount), currency)} · ${overdue ? "overdue" : "due today"} · did it go through?`,
      // Straight to this bill's Pay row. Bills sit inside Cash Flow's
      // Expenses group, folded by default, so the link asks for it open and
      // names the row; "Pay" that lands on a chart costs the tap it saved.
      href: `/wealth?seg=cashflow&open=expenses&bill=${b.id}`,
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
      meta: h.when_date && h.when_date < today ? "overdue" : h.status === "scheduled" || h.status === "planned" ? "booked for today" : "due",
      // The person's own schedule, where the appointment is, rather than the
      // Family tab's front page.
      href: `/family/members/${h.member_id}?view=health&seg=schedule`,
      urgent: Boolean(h.when_date && h.when_date <= today),
    });
  }

  for (const v of visits.data ?? []) {
    const who = (v.member as unknown as { full_name: string } | null)?.full_name?.split(" ")[0] ?? "Someone";
    if (!isForMe(me, false, [{ id: v.member_id, role: (v.member as unknown as { role: string } | null)?.role }])) continue;
    const at = new Date(v.when_at);
    items.push({
      id: `visit-${v.id}`,
      icon: "activity",
      tint: "occasion",
      title: `${who} · ${v.what}`,
      meta: [formatTimeOfDay(familyClock(at, tz)), v.where_text, "visit"].filter(Boolean).join(" · "),
      href: `/family/members/${v.member_id}/visit/${v.id}`,
      at: at.getTime(),
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

  return items.sort((a, b) => {
    if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
    if (a.at != null && b.at != null) return a.at - b.at;
    if (a.at != null) return -1;
    if (b.at != null) return 1;
    return 0;
  });
}

/** For the household's own events among `items` (ids `<prefix><eventId>`),
 * the potluck lines still uncovered (lib/potluck): "who brings what? N still
 * needed" on the row, opening the event's potluck. */
async function addPotluckNeeds(supabase: Awaited<ReturnType<typeof createClient>>, familyId: string, me: { id: string }, items: BriefItem[], prefix: string): Promise<void> {
  const own = items.filter((i) => i.id.startsWith(prefix));
  if (own.length === 0) return;
  const ids = own.map((i) => i.id.slice(prefix.length));
  const [{ data: potluckItems }, { data: claims }] = await Promise.all([
    supabase.from("potluck_items").select("id, event_id, label, wanted, position").eq("family_id", familyId).in("event_id", ids),
    supabase.from("potluck_claims").select("id, event_id, item_id, member_id, guest_id, member_name, household_name, family_id, qty").eq("event_family_id", familyId).in("event_id", ids),
  ]);
  if (!potluckItems?.length) return;
  for (const item of own) {
    const eventId = item.id.slice(prefix.length);
    const lines = potluckLines(
      (potluckItems ?? []).filter((p) => p.event_id === eventId),
      (claims ?? []).filter((c) => c.event_id === eventId),
      { id: me.id, familyId },
    );
    const open = lines.filter((l) => l.left > 0).length;
    if (open === 0) continue;
    item.meta = `${item.meta} · who brings what? ${open} still needed`;
    item.href = `/planner/add?type=event&id=${eventId}#potluck`;
  }
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

  const [events, bills, health, tasks, meals, departed, potlucks, members] = await Promise.all([
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
      .select("id, what, when_date, status, member_id, member:members!health_schedule_member_id_fkey(full_name, role)")
      .eq("family_id", familyId)
      // Due this week, or already booked for a day this week (23 October).
      .in("status", ["due", "due_soon", "planned", "scheduled"])
      .gt("when_date", today)
      .lte("when_date", weekOut)
      .order("when_date", { ascending: true })
      .limit(3),
    supabase
      .from("activities")
      .select("id, title, start_at, location, status, repeat, repeat_days, repeat_until, applies_to_whole_family, activity_members(member_id, members(role))")
      .eq("family_id", familyId)
      .in("status", ["upcoming", "completed", "cancelled"])
      .lt("start_at", new Date(now.getTime() + 54 * 3600_000).toISOString())
      .or(startsOrRepeats(new Date(now.getTime() + 6 * 3600_000).toISOString(), tomorrow))
      .order("start_at", { ascending: true }),
    supabase
      .from("meal_plans")
      .select("id, dish, meal_ingredients(item_key, ingredient_name)")
      .eq("family_id", familyId)
      .eq("plan_date", tomorrow),
    departedOnTree(supabase, familyId),
    getRelativesPotlucks(),
    supabase.from("members").select("id, full_name, dob, role, status").eq("family_id", familyId),
  ]);

  const items: BriefItem[] = [];

  // A managed child turning 13: "children graduate to their own login at
  // 13" (Family tab), but nothing said when (21 October audit). The week
  // before, and for a month after while they are still managed, the
  // grown-ups see it here; the invite code is on Settings -> Household.
  if (isGrownUp(me.role)) {
    for (const m of members.data ?? []) {
      if (m.role !== "child_managed" || !m.dob || m.status === "pending" || isGone(m.status)) continue;
      const thirteenth = `${Number(m.dob.slice(0, 4)) + 13}${m.dob.slice(4)}`;
      const inDays = Math.round((Date.parse(thirteenth) - Date.parse(today)) / 86_400_000);
      if (!Number.isFinite(inDays) || inDays > 7 || inDays < -30) continue;
      const first = m.full_name.split(" ")[0];
      const when = inDays <= 0 ? "Turned 13" : `Turns 13 ${inDays === 1 ? "tomorrow" : `on ${weekdayOf(addDays(today, inDays))}`}`;
      items.push({
        id: `soon-login-${m.id}`,
        icon: "users",
        tint: "occasion",
        title: `${first} can have a login of their own`,
        meta: `${when} · share the invite code and they sign up themselves`,
        href: "/settings/household",
        at: Math.max(inDays, 0.5),
        whose: "family",
        memberIds: [m.id],
      });
    }
  }

  // A linked household's potluck this week that still needs things
  // (20261019233100): the family's, like a whole-family plan.
  for (const p of potlucks) {
    const inDays = Math.round((Date.parse(p.eventDate) - Date.parse(today)) / 86_400_000);
    if (inDays < 0 || inDays > 7 || p.openItems === 0) continue;
    const on = inDays === 0 ? "today" : inDays === 1 ? "tomorrow" : `on ${weekdayOf(p.eventDate)}`;
    items.push({ id: `soon-potluck-${p.eventId}`, icon: "bowl", tint: "occasion", title: p.title, meta: `${p.hostName} household, ${on} · who brings what? ${p.openItems} still needed`, href: `/planner/potluck/${p.eventId}`, at: Math.max(inDays, 0.5), whose: "family", memberIds: [] });
  }

  // Undas ahead (time for candles and flowers) and each remembered relative's
  // day this week; the family's, like a whole-family plan.
  for (const r of remembranceItems(departed, today, 7)) {
    if (r.inDays > 0) items.push({ id: `soon-${r.id}`, icon: "candle", tint: "occasion", title: r.title, meta: r.meta, href: "/family?seg=tree", at: r.inDays, whose: "family", memberIds: [] });
  }

  // Who is coming and who brings food, said on the row itself (the feature
  // guide, 23 October: both sat one tap down and went unseen). Read only for
  // the events that made the week, and as the viewer.
  const soonEvents = (events.data ?? [])
    // Days until its next turn (a 29 February one on 1 March in a year
    // without one, lib/grocery), keeping only the coming week's.
    .map((e) => ({ e, inDays: Math.round((Date.parse(nextEventDate(e, today)) - Date.parse(today)) / 86_400_000) }))
    .filter((x) => x.inDays >= 1 && x.inDays <= 7);
  const soonIds = soonEvents.map((x) => x.e.id);
  const [rsvps, guests, claims] = soonIds.length
    ? await Promise.all([
        // Everyone's answers: who is coming, and whether the reader has
        // answered at all (Going / Can't on the row, 23 October).
        supabase.from("event_rsvps").select("event_id, member_id, answer").in("event_id", soonIds),
        supabase.from("event_guests").select("event_id, headcount").eq("answer", "going").in("event_id", soonIds),
        supabase.from("potluck_claims").select("event_id, member_id, guest_id, member_name").in("event_id", soonIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const coming = new Map<string, number>();
  const mineAnswered = new Set<string>();
  for (const r of rsvps.data ?? []) {
    if (r.answer === "going") coming.set(r.event_id, (coming.get(r.event_id) ?? 0) + 1);
    if (r.member_id === me.id) mineAnswered.add(r.event_id);
  }
  for (const g of guests.data ?? []) coming.set(g.event_id, (coming.get(g.event_id) ?? 0) + Math.max(1, g.headcount ?? 1));
  const bringers = new Map<string, Set<string>>();
  for (const c of claims.data ?? []) {
    const who = c.member_id ?? c.guest_id ?? c.member_name;
    bringers.set(c.event_id, (bringers.get(c.event_id) ?? new Set()).add(who));
  }

  for (const { e, inDays } of soonEvents) {
    const tagged = taggedFrom(e.event_members);
    const whose = whoseFor(me, e.applies_to_whole_family, tagged);
    const on = inDays === 1 ? "tomorrow" : `on ${weekdayOf(addDays(today, inDays))}`;
    const years = e.recurs_yearly ? Number(addDays(today, inDays).slice(0, 4)) - Number(e.event_date.slice(0, 4)) : 0;
    const what =
      e.kind === "birthday" && years > 0 ? `Turns ${years} ${on}` : e.kind === "anniversary" && years > 0 ? `${years} years ${on}` : `${on[0].toUpperCase()}${on.slice(1)}`;
    const nudge = e.kind === "birthday" || e.kind === "anniversary" ? " · a gift or a greeting?" : "";
    const going = coming.get(e.id) ?? 0;
    const bringing = bringers.get(e.id)?.size ?? 0;
    const asked = e.applies_to_whole_family || tagged.length === 0 || tagged.some((t) => t.id === me.id);
    const rsvp = asked && rsvpOpen(e, today) && !mineAnswered.has(e.id) ? { eventId: e.id, memberId: me.id } : undefined;
    const counts = [going ? `${going} coming` : "", bringing ? `${bringing} bringing food` : "", rsvp ? "waiting on your reply" : ""].filter(Boolean).join(" · ");
    items.push({ id: `soon-event-${e.id}`, icon: e.kind === "birthday" ? "cupcake" : "gift", tint: "occasion", title: e.title, meta: `${what}${counts ? ` · ${counts}` : nudge}`, href: `/planner/add?type=event&id=${e.id}`, at: inDays, whose, memberIds: e.applies_to_whole_family ? [] : tagged.map((t) => t.id), rsvp });
  }
  // The household's own potluck this week that still needs things.
  await addPotluckNeeds(supabase, familyId, me, items, "soon-event-");

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
    const on = inDays === 1 ? "tomorrow" : `on ${weekdayOf(h.when_date!)}`;
    const booked = h.status === "scheduled" || h.status === "planned";
    items.push({
      id: `soon-health-${h.id}`,
      icon: "activity",
      tint: "occasion",
      title: `${who} · ${h.what}`,
      meta: booked ? `Booked for ${on}` : `Due ${inDays === 1 ? "tomorrow" : `in ${inDays} days`} · book it now?`,
      // The person's own schedule, as Today's row opens (23 October).
      href: `/family/members/${h.member_id}?view=health&seg=schedule`,
      at: inDays,
      whose: h.member_id === me.id ? "mine" : "others",
      memberIds: [h.member_id],
    });
  }

  // Tomorrow's first thing, if it starts early enough to plan the evening
  // around -- school programs, flights, a 7am practice.
  // Every early start tomorrow: there are only ever a few, and the Who
  // dropdown shows whichever are wanted.
  for (const a of tasks.data ?? []) {
    // A one-off still to do, or a repeating one whose rule falls tomorrow.
    if (!repeats(a) && a.status !== "upcoming") continue;
    const start = repeats(a) ? occurrenceStarts(a, new Date(a.start_at), tomorrow, tomorrow, tz)[0] : new Date(a.start_at);
    // An all-day plan sits at midnight (lib/calendar-shape); it is no early start.
    const clock = familyClock(start, tz);
    if (!start || localDay(start, tz) !== tomorrow || clock === "00:00" || Number(clock.slice(0, 2)) >= 10) continue;
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

  return capComingUp(items);
}

/** Coming up's order and size: six a page at most, each page in date
 * order. Anything without a page named (bills, meals, the pantry, Wealth's
 * rows) is the family's. Exported so the page can fold in rows from
 * elsewhere (queries/today-wealth) before the cap is applied. */
export function capComingUp(items: BriefItem[]): BriefItem[] {
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

/** "At a glance" Goals (Jonathan, 23 October, decision 3): the reader's
 * daily targets today, "2 of 3", from the same count the Target view shows
 * (queries/game); with no targets asked today, the plain way to Goals it
 * was (Janine, 21 October: no ring, no percentage). */
export async function getGoalsTile(me: { id: string; family_id: string; families: { week_start?: string | null } }): Promise<GlanceTile> {
  const plain: GlanceTile = { id: "goal", icon: "target", value: "Goals", label: "your goals and targets", href: "/planner?seg=goals" };
  const game = await getGame(me.family_id, weekStartOf(me.families.week_start));
  const player = game.players.find((p) => p.id === me.id);
  if (!player || player.dailiesTotal === 0) return plain;
  const done = player.dailiesDone === player.dailiesTotal;
  return { id: "goal", icon: "target", value: `${player.dailiesDone} of ${player.dailiesTotal}`, label: done ? "targets today · all done" : "targets today", href: "/planner?seg=goals&g=game" };
}

/** The household's relatives on the tree who have passed, for Undas and
 * their days (lib/remembrance) -- none when the household turned remembering
 * off (families.remember_the_departed, 20261019233000). */
async function departedOnTree(supabase: Awaited<ReturnType<typeof createClient>>, familyId: string): Promise<Departed[]> {
  const [{ data: family }, { data: rows }] = await Promise.all([
    supabase.from("families").select("remember_the_departed").eq("id", familyId).maybeSingle(),
    supabase.from("family_tree_people").select("id, full_name, died_on, members!family_tree_people_member_id_fkey(full_name)").eq("family_id", familyId).not("died_on", "is", null),
  ]);
  if (!family || family.remember_the_departed === false) return [];
  return (rows ?? []).map((r) => ({ id: r.id, name: r.members?.full_name ?? r.full_name ?? "Someone dear", diedOn: r.died_on! }));
}

/** The medicines the reader gives today (Jonathan, 23 October): their own,
 * and a grown-up's children's, as far as Health lets them see (its policies
 * keep "Just me" and "Parents only" rows where they belong) -- the people
 * the dose push reaches (20260926140000_reminders.sql). Until 23 October
 * Today knew the reader's own only, as a tile. */
const loadDoses = cache(async function loadDoses(me: { id: string; role: string; family_id: string }): Promise<{ due: DueDose[]; who: (memberId: string) => string | null }> {
  const supabase = await createClient();
  const tz = await householdZone();
  const today = localDay(new Date(), tz);
  const { data: members } = await supabase.from("members").select("id, full_name, role, status").eq("family_id", me.family_id);
  const people = (members ?? []).filter((m) => m.status !== "pending" && !isGone(m.status) && (m.id === me.id || (isGrownUp(me.role) && isChild(m.role))));
  const names = new Map(people.map((m) => [m.id, m.full_name.split(" ")[0]]));
  const who = (memberId: string) => (memberId === me.id ? null : (names.get(memberId) ?? "Someone"));
  if (people.length === 0) return { due: [], who };
  const { data: medicines } = await supabase
    .from("health_medicines")
    .select("id, member_id, name, dose, times, start_date, end_date")
    .in("member_id", people.map((m) => m.id));
  const { data: doses } = medicines?.length
    ? await supabase.from("health_medicine_doses").select("medicine_id, dose_date, dose_time").in("medicine_id", medicines.map((m) => m.id)).eq("dose_date", today)
    : { data: [] };
  return { due: dosesFor(medicines ?? [], doses ?? [], today, familyClock(new Date(), tz)), who };
});

/** Today's list: one row per medicine the reader gives, with its next dose
 * (lib/today-doses). */
export async function getTodayDoses(me: { id: string; role: string; family_id: string }): Promise<TodayDose[]> {
  const { due, who } = await loadDoses(me);
  return doseRows(due, who);
}
