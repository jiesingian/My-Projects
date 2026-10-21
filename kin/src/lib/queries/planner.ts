import { keysFromMarks } from "@/lib/week-done";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { GROUP_OF, type CalendarGroup, type CalendarTable } from "@/lib/calendar-groups";
import { startOfWeek as firstDayOfWeek, type WeekStart } from "@/lib/week";
import { getHolidaysBetween, holidayCountry, mergeHolidays } from "@/lib/holidays";
import { getCurrentMember } from "@/lib/session";
import { getHouseholdSpecialDays } from "@/lib/queries/special-days";
import { expandRoutine, assigneeFor, type RoutineRule } from "@/lib/routines";
import { loanPaymentDates, paidFromVisibleFilter } from "@/lib/wealth";
import { formatCurrency } from "@/lib/format";
import { householdZone } from "@/lib/household-zone";
import { addDays, familyDay, familyInstant, familyMidnight } from "@/lib/time";
import { bucketByDay, countsByMonth, dayAfterMonths, daysFrom, monthsAround, weekStartDay, type PlannerMonth } from "@/lib/planner-days";
import { parseISODate, toISODate } from "@/lib/routines";
import { describeActivityRepeat, occurrenceStarts } from "@/lib/activity-repeat";

export type PlannerCalendarItem = {
  id: string;
  table: CalendarTable;
  /** The household day it falls on, "YYYY-MM-DD" -- what the calendar files
   * it under (lib/planner-days). */
  day: string;
  /** When it is: the real instant for a timed item, the start of its
   * household day for an all-day one. For the time and for ordering, never
   * for working out which day it is. */
  date: Date;
  allDay: boolean;
  title: string;
  location: string | null;
  who: string;
  memberIds: string[];
  appliesToAll: boolean;
  href: string;
  /** A recurring chore. They come round every day, so the agenda folds a
   * day's worth of them into one line rather than letting them bury the
   * one-off plans (agreed 28 September). */
  chore?: boolean;
  /** A repeating task's rule in words ("Every Mon, Wed · until 30 Nov"). */
  repeatWords?: string;
  /** The row behind a repeated occurrence, whose own id is per day. */
  sourceId?: string;
};

function firstNames(names: (string | undefined)[]): string {
  return names.filter(Boolean).map((n) => n!.split(" ")[0]).join(", ").toUpperCase();
}

/** Every date-bearing record across the app — activities, events,
 * bills, meal plans, and goals with a target date — normalized into one list
 * so the Planner Calendar view reflects everything with a date, not just
 * activities. Household days from `startDate` to `endDate`, exclusive, in the
 * household's own zone: the process's clock has no say (lib/planner-days). */
async function fetchCalendarItems(familyId: string, startDate: string, endDate: string, tz: string): Promise<PlannerCalendarItem[]> {
  const supabase = await createClient();
  const rangeStart = familyMidnight(startDate, tz)!;
  const rangeEnd = familyMidnight(endDate, tz)!;
  const startISO = rangeStart.toISOString();
  const endISO = rangeEnd.toISOString();
  // An all-day item's instant: the start of its day, in the household's zone.
  const dayStart = (day: string) => familyMidnight(day, tz) ?? new Date(`${day}T00:00:00Z`);

  // No trips fetch: travel is a kind of event now, so it arrives with the
  // events and needs no second query or second loop.
  const [{ data: activities }, { data: events }, { data: allBills }, { data: meals }, { data: goals }, { data: routines }, holidays, { data: seenAccounts }, { data: loans }, currency] = await Promise.all([
    // Tasks that start in range, and repeating ones that started before it
    // and have not ended -- expanded below into the days they fall on.
    supabase
      .from("activities")
      .select("*, activity_members(members(id, full_name))")
      .eq("family_id", familyId)
      .lt("start_at", endISO)
      .or(`start_at.gte.${startISO},and(repeat.neq.once,or(repeat_until.is.null,repeat_until.gte.${startDate}))`),
    supabase
      .from("events")
      .select("*, event_members(members(id, full_name))")
      .eq("family_id", familyId)
      .gte("event_date", startDate)
      .lt("event_date", endDate),
    supabase.from("bills").select("*").eq("family_id", familyId).not("due_date", "is", null).gte("due_date", startDate).lt("due_date", endDate),
    supabase.from("meal_plans").select("*").eq("family_id", familyId).gte("plan_date", startDate).lt("plan_date", endDate),
    supabase
      .from("goals")
      .select("*, owner:owner_member_id(id, full_name)")
      .eq("family_id", familyId)
      .not("target_date", "is", null)
      .gte("target_date", startDate)
      .lt("target_date", endDate),
    // Routines are a rule, not rows: every one that could still be running is
    // fetched, then expanded into whatever occurrences land in this range.
    supabase
      .from("routines")
      .select("*, routine_members(member_id, position, members(id, full_name))")
      .eq("family_id", familyId)
      .eq("paused", false)
      .lte("start_date", endDate)
      .or(`end_date.is.null,end_date.gte.${startDate}`),
    // Public holidays are the household's country's (families.country,
    // Philippines when unset), cached for a day per country (lib/holidays).
    // With the household's own special days (20260930171000) among them.
    getCurrentMember()
      .then((me) => holidayCountry(me?.family_id === familyId ? me.families.country : null))
      .then((country) => Promise.all([getHolidaysBetween(startDate, endDate, country), getHouseholdSpecialDays(familyId, startDate, endDate)]))
      .then(([pub, own]) => mergeHolidays(pub, own)),
    // The accounts the viewer can see (RLS, archived ones too), for the bills
    // below.
    supabase.from("accounts").select("id").eq("family_id", familyId),
    // Loans with a payment schedule: a rule like a routine's, expanded below
    // into the payments that land in this range.
    supabase
      .from("liabilities")
      .select("id, name, monthly_payment, next_payment_date, payments_remaining")
      .eq("family_id", familyId)
      .not("next_payment_date", "is", null)
      .lt("next_payment_date", endDate),
    getCurrentMember().then((me) => (me?.family_id === familyId ? me.families.currency : null)),
  ]);

  // A bill paid from an account the viewer cannot see -- someone's private
  // account -- is left off their calendar, as on Cash Flow and Subscriptions
  // (e2e/private-accounts.spec.ts).
  const canSee = new Set((seenAccounts ?? []).map((a) => a.id));
  const bills = (allBills ?? []).filter((b) => !b.paid_from_account_id || canSee.has(b.paid_from_account_id));

  const items: PlannerCalendarItem[] = [];

  const fromDay = startDate;
  const toDay = addDays(endDate, -1) ?? startDate;
  for (const a of activities ?? []) {
    const memberIds = (a.activity_members ?? [])
      .map((m) => (m.members as unknown as { id: string } | null)?.id)
      .filter((v): v is string => !!v);
    const who = a.applies_to_whole_family
      ? "WHOLE FAMILY"
      : firstNames((a.activity_members ?? []).map((m) => (m.members as unknown as { full_name: string } | null)?.full_name)) || "HOUSE";
    // Once: its own day. Repeating: every day of the range it falls on
    // (lib/activity-repeat), at the first one's time on the household clock.
    const start = new Date(a.start_at);
    const repeatWords = describeActivityRepeat(a, familyDay(start, tz)) ?? undefined;
    for (const at of occurrenceStarts(a, start, fromDay, toDay, tz)) {
      if (at < rangeStart || at >= rangeEnd) continue;
      items.push({
        id: at.getTime() === start.getTime() ? a.id : `${a.id}:${familyDay(at, tz)}`,
        table: "activities",
        day: familyDay(at, tz),
        date: at,
        allDay: false,
        title: a.title,
        location: a.location,
        who,
        memberIds,
        appliesToAll: a.applies_to_whole_family,
        href: `/planner/add?type=task&id=${a.id}`,
        repeatWords,
        sourceId: a.id,
      });
    }
  }

  for (const e of events ?? []) {
    const memberIds = (e.event_members ?? [])
      .map((em) => (em.members as unknown as { id: string } | null)?.id)
      .filter((v): v is string => !!v);
    const who = e.applies_to_whole_family
      ? "WHOLE FAMILY"
      : firstNames((e.event_members ?? []).map((em) => (em.members as unknown as { full_name: string } | null)?.full_name)) || "WHOLE FAMILY";
    items.push({
      id: e.id,
      table: "events",
      day: e.event_date,
      date: dayStart(e.event_date),
      allDay: true,
      title: e.title,
      location: null,
      who,
      memberIds,
      appliesToAll: e.applies_to_whole_family || memberIds.length === 0,
      href: `/planner/add?type=event&id=${e.id}`,
    });
  }

  for (const h of holidays) {
    items.push({
      id: `holiday-${h.date}-${h.name}`,
      table: "holidays",
      day: h.date,
      date: dayStart(h.date),
      allDay: true,
      title: h.name,
      location: null,
      who: "",
      memberIds: [],
      // Everyone's day off, whoever the Planner is showing.
      appliesToAll: true,
      href: `/planner?seg=calendar&view=month&date=${h.date}`,
    });
  }

  for (const b of bills ?? []) {
    items.push({
      id: b.id,
      table: "bills",
      day: b.due_date!,
      date: dayStart(b.due_date!),
      allDay: true,
      title: `${b.name} due`,
      location: null,
      who: "HOUSE",
      memberIds: [],
      appliesToAll: true,
      // Bills live in Wealth's Cash Flow tab, not Household -- this pointed
      // at a segment Household doesn't have, so it silently fell back to
      // Household's default tab instead of the bill.
      href: `/wealth?seg=cashflow`,
    });
  }

  // Each loan payment on its own day, with what it comes to -- filed with
  // the bills (same colour, same legend switch, hidden from a child's digest
  // the same way) because that is what it is. Not a bills row: there is
  // nothing to settle here, so it goes to A&L, where the loan is.
  for (const l of loans ?? []) {
    const amount = l.monthly_payment != null && Number(l.monthly_payment) > 0 ? ` · ${formatCurrency(Number(l.monthly_payment), currency ?? "PHP")}` : "";
    for (const day of loanPaymentDates(l)) {
      if (day < startDate || day >= endDate) continue;
      items.push({
        id: `liability-${l.id}-${day}`,
        table: "bills",
        day,
        date: dayStart(day),
        allDay: true,
        title: `${l.name} payment${amount}`,
        location: null,
        who: "HOUSE",
        memberIds: [],
        appliesToAll: true,
        href: `/wealth?seg=assets`,
      });
    }
  }

  for (const m of meals ?? []) {
    items.push({
      id: m.id,
      table: "meal_plans",
      day: m.plan_date,
      date: dayStart(m.plan_date),
      allDay: true,
      title: m.dish,
      location: null,
      who: "HOUSE",
      memberIds: [],
      appliesToAll: true,
      href: `/household?seg=meals`,
    });
  }

  for (const g of goals ?? []) {
    const who = g.is_joint ? "JOINT" : (g.owner as unknown as { full_name: string } | null)?.full_name?.split(" ")[0]?.toUpperCase() ?? "MINE";
    items.push({
      id: g.id,
      table: "goals",
      day: g.target_date!,
      date: dayStart(g.target_date!),
      allDay: true,
      title: g.title,
      location: null,
      who,
      memberIds: g.owner_member_id ? [g.owner_member_id] : [],
      appliesToAll: g.is_joint,
      href: `/wealth?seg=assets`,
    });
  }

  for (const r of routines ?? []) {
    const roster = (r.routine_members ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((rm) => ({
        id: (rm.members as unknown as { id: string } | null)?.id ?? rm.member_id,
        name: (rm.members as unknown as { full_name: string } | null)?.full_name ?? "",
      }))
      .filter((m) => !!m.id);

    const rule: RoutineRule = {
      freq: r.freq as RoutineRule["freq"],
      repeat_interval: r.repeat_interval,
      byweekday: r.byweekday ?? [],
      bymonthday: r.bymonthday,
      start_date: r.start_date,
      end_date: r.end_date,
    };

    // expandRoutine counts whole days on local midnights; handed the range
    // as those same local midnights of the household days, it never meets
    // the process's zone, and its days come back as the household's.
    for (const occ of expandRoutine(rule, parseISODate(startDate), parseISODate(endDate))) {
      const day = toISODate(occ.date);
      // Whose turn it is only means anything when the routine rotates;
      // otherwise everyone named on it is on for every occurrence.
      const turn = r.rotate_assignee ? assigneeFor(roster, occ.index) : null;
      const memberIds = turn ? [turn.id] : roster.map((m) => m.id);
      const who = r.applies_to_whole_family
        ? "WHOLE FAMILY"
        : turn
          ? turn.name.split(" ")[0].toUpperCase()
          : firstNames(roster.map((m) => m.name)) || "HOUSE";

      const at = (r.time_of_day ? familyInstant(day, r.time_of_day.slice(0, 8), tz) : null) ?? dayStart(day);
      items.push({
        id: `${r.id}:${day}`,
        table: "routines",
        day,
        date: at,
        allDay: !r.time_of_day,
        title: r.title,
        location: r.location,
        who,
        memberIds,
        appliesToAll: r.applies_to_whole_family,
        href: `/planner?seg=routines`,
        chore: r.kind === "chore",
      });
    }
  }

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** The Planner's "Who: Family" (29 September): only what the whole family is
 * in -- tagged "whole family", or the household's own (bills, meals, a plan
 * tagged to nobody). "Everyone" is the other view: every member's plans
 * together, to see what a new one would clash with. Passed where a member
 * id otherwise goes. */
export const FAMILY_FILTER = "family";

/** An item is shown when it belongs to whoever is selected and its category
 * has not been switched off in the legend. */
function shown(item: PlannerCalendarItem, memberId?: string, hidden?: Set<CalendarGroup>): boolean {
  if (memberId === FAMILY_FILTER) {
    if (!item.appliesToAll && item.memberIds.length > 0) return false;
  } else if (memberId && !item.appliesToAll && !item.memberIds.includes(memberId)) return false;
  return !hidden?.has(GROUP_OF[item.table]);
}

/** The week containing `anchor` (a household day; today by default), plus a
 * longer strip of days either side of it. The strip is what the date rail
 * scrolls through, so the user can swipe weeks forward and back without a
 * page load; the week itself is the agenda beneath. One query covers both.
 * Every day is the household's own (lib/planner-days). */
export async function getWeekAgenda(
  familyId: string,
  memberId?: string,
  anchor?: string,
  hidden?: Set<CalendarGroup>,
  stripWeeksEachSide = 6,
  // Named for the preference, not for the Date this returns under the same
  // word: 0 is Sunday, 1 is Monday.
  weekStartsOn: WeekStart = 0,
) {
  const tz = await householdZone();
  const today = familyDay(new Date(), tz);
  const selected = anchor ?? today;
  const weekFirst = weekStartDay(selected, weekStartsOn);
  const stripStart = addDays(weekFirst, -7 * stripWeeksEachSide) ?? weekFirst;
  const stripLength = 7 * (stripWeeksEachSide * 2 + 1);
  const stripDays = daysFrom(stripStart, stripLength);
  const stripEnd = addDays(stripStart, stripLength) ?? stripStart;

  const all = await fetchCalendarItems(familyId, stripStart, stripEnd, tz);
  const byDay = bucketByDay(all.filter((it) => shown(it, memberId, hidden)));

  const strip = stripDays.map((day) => ({
    day,
    isToday: day === today,
    isSelected: day === selected,
    items: byDay.get(day) ?? [],
  }));

  const weekOffset = 7 * stripWeeksEachSide;
  const days = strip.slice(weekOffset, weekOffset + 7).map((d) => ({
    day: d.day,
    isToday: d.isToday,
    isSelected: d.isSelected,
    activities: d.items,
  }));

  return { weekStart: days[0].day, weekEnd: days[6].day, today, days, strip };
}

export type PlannerMonthDays = PlannerMonth & {
  /** Indexed by the day of the month, 1 to daysInMonth. */
  itemsByDay: PlannerCalendarItem[][];
};

/** Consecutive months around `anchor` (a household day), each with its own
 * days' items, so the month grid can scroll continuously from one month into
 * the next instead of paging one month at a time. One query spans the whole
 * run.
 *
 * The window is two years wide, and weighted forward: a calendar is read
 * ahead far more than behind, and it has to carry on through a December into
 * the next year and well beyond without stopping. Anything further out is a
 * couple of taps away in the header's jump sheet. */
export async function getMonthsOverview(
  familyId: string,
  anchor: string,
  memberId?: string,
  hidden?: Set<CalendarGroup>,
  before = 6,
  after = 17,
) {
  const tz = await householdZone();
  const runs = monthsAround(anchor, before, after);
  const all = await fetchCalendarItems(familyId, runs[0].first, dayAfterMonths(runs), tz);
  const byDay = bucketByDay(all.filter((it) => shown(it, memberId, hidden)));

  const months: PlannerMonthDays[] = runs.map((m) => ({
    ...m,
    itemsByDay: Array.from({ length: m.daysInMonth + 1 }, (_, d) => (d === 0 ? [] : (byDay.get(`${m.key}-${String(d).padStart(2, "0")}`) ?? []))),
  }));

  return { months, today: familyDay(new Date(), tz) };
}

/** Per-month item counts for `year`, in the household's days, for the year
 * overview. */
export async function getYearOverview(familyId: string, year: number, memberId?: string, hidden?: Set<CalendarGroup>) {
  const tz = await householdZone();
  const all = await fetchCalendarItems(familyId, `${year}-01-01`, `${year + 1}-01-01`, tz);
  return { year, countsByMonth: countsByMonth(all.filter((it) => shown(it, memberId, hidden)), year), today: familyDay(new Date(), tz) };
}

/** One-off tasks: the `activities` table. The recurring kind are routines and
 * come from getRoutines.
 *
 * These had nowhere to be read. The Planner's tabs are Calendar, Tasks and
 * Events, and a one-off went to none of them -- it appeared on the calendar
 * grid and nowhere else, filed under a word ("activity") that named no tab,
 * no page and nothing a person could go and look at. So the Tasks tab lists
 * them now, beside the recurring ones they belong with.
 *
 * From the start of today onward. What is already past is history and the
 * calendar still holds it; a tab called Tasks is for what is still to do. */
export async function getOneOffTasks(familyId: string, fromISO: string, fromDay: string = fromISO.slice(0, 10)) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, activity_members(members(id, full_name))")
    .eq("family_id", familyId)
    // A repeating task stays while it has days left to come.
    .or(`start_at.gte.${fromISO},and(repeat.neq.once,or(repeat_until.is.null,repeat_until.gte.${fromDay}))`)
    .order("start_at", { ascending: true });
  return (data ?? []).map((a) => ({
    ...a,
    who: (a.activity_members ?? [])
      .map((am) => (am.members as unknown as { full_name: string } | null)?.full_name)
      .filter((v): v is string => !!v),
    memberIds: (a.activity_members ?? [])
      .map((am) => (am.members as unknown as { id: string } | null)?.id)
      .filter((v): v is string => !!v),
  }));
}

/** Events, travel included -- travel is a kind of event now rather than its
 * own table, so a trip's photo is signed here the way a trip's used to be.
 * The bucket is still `trip-photos`: the rows moved, the files did not. */
export async function getEvents(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*, event_members(members(id, full_name))")
    .eq("family_id", familyId)
    .order("event_date", { ascending: true });
  const events = data ?? [];
  const urls = await getSignedUrls(
    "trip-photos",
    events.map((e) => e.photo_storage_path).filter((v): v is string => !!v),
  );
  return events.map((e) => ({
    ...e,
    photoUrl: e.photo_storage_path ? urls[e.photo_storage_path] ?? null : null,
    who: (e.event_members ?? [])
      .map((em) => (em.members as unknown as { full_name: string } | null)?.full_name)
      .filter((v): v is string => !!v),
    memberIds: (e.event_members ?? [])
      .map((em) => (em.members as unknown as { id: string } | null)?.id)
      .filter((v): v is string => !!v),
  }));
}

/** Whether anyone in the household has connected Google Calendar, and how
 * stale the least-recently-synced of them is. The Planner syncs silently on
 * load; this is what lets it say so. */
export async function getCalendarSyncStatus(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("calendar_links").select("last_synced_at").eq("family_id", familyId).eq("connected", true);
  if (!data || data.length === 0) return { connected: 0, lastSyncedAt: null as Date | null };

  let stalest: Date | null = null;
  for (const link of data) {
    if (!link.last_synced_at) return { connected: data.length, lastSyncedAt: null };
    const at = new Date(link.last_synced_at);
    if (!stalest || at < stalest) stalest = at;
  }
  return { connected: data.length, lastSyncedAt: stalest };
}

/** Does this family have any dated record at all, anywhere in time? Only
 * asked when the visible range is empty, to tell "nothing this week" apart
 * from "nothing ever" — which want completely different things said to them. */
export async function hasAnyCalendarRecords(familyId: string): Promise<boolean> {
  const supabase = await createClient();
  // Bills paid from an account the viewer cannot see do not count: hidden
  // means hidden, down to "you have something here".
  const { data: seen } = await supabase.from("accounts").select("id").eq("family_id", familyId);
  const counts = await Promise.all([
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("family_id", familyId),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("family_id", familyId),
    supabase.from("trips").select("id", { count: "exact", head: true }).eq("family_id", familyId),
    supabase.from("bills").select("id", { count: "exact", head: true }).eq("family_id", familyId).not("due_date", "is", null).or(paidFromVisibleFilter((seen ?? []).map((a) => a.id))),
    supabase.from("meal_plans").select("id", { count: "exact", head: true }).eq("family_id", familyId),
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("family_id", familyId).not("target_date", "is", null),
  ]);
  return counts.some((c) => (c.count ?? 0) > 0);
}

/** What was ticked done today, as calendar item keys (lib/week-done): a
 * plan, event or bill marked done on Today, and a chore logged done. Read
 * under the caller's own RLS. */
export async function getDoneToday(familyId: string, today: string): Promise<Set<string>> {
  const supabase = await createClient();
  const [{ data: marks }, { data: chores }] = await Promise.all([
    supabase.from("today_marks").select("item_key, state").eq("family_id", familyId).eq("day", today),
    supabase.from("routine_log").select("routine_id").eq("family_id", familyId).eq("occurrence_date", today).eq("status", "done"),
  ]);
  return new Set([...keysFromMarks(marks ?? []), ...(chores ?? []).map((c) => `routines:${c.routine_id}`)]);
}
