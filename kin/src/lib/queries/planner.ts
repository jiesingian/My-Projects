import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { GROUP_OF, type CalendarGroup, type CalendarTable } from "@/lib/calendar-groups";
import { expandRoutine, assigneeFor, type RoutineRule } from "@/lib/routines";

export type PlannerCalendarItem = {
  id: string;
  table: CalendarTable;
  date: Date;
  allDay: boolean;
  title: string;
  location: string | null;
  who: string;
  memberIds: string[];
  appliesToAll: boolean;
  href: string;
};

function firstNames(names: (string | undefined)[]): string {
  return names.filter(Boolean).map((n) => n!.split(" ")[0]).join(", ").toUpperCase();
}

/** Every date-bearing record across the app — activities, events, trips,
 * bills, meal plans, and goals with a target date — normalized into one list
 * so the Planner Calendar view reflects everything with a date, not just
 * activities. `rangeEnd` is exclusive. */
async function fetchCalendarItems(familyId: string, rangeStart: Date, rangeEnd: Date): Promise<PlannerCalendarItem[]> {
  const supabase = await createClient();
  const startISO = rangeStart.toISOString();
  const endISO = rangeEnd.toISOString();
  const startDate = toISODate(rangeStart);
  const endDate = toISODate(rangeEnd);

  const [{ data: activities }, { data: events }, { data: trips }, { data: bills }, { data: meals }, { data: goals }, { data: routines }] = await Promise.all([
    supabase
      .from("activities")
      .select("*, activity_members(members(id, full_name))")
      .eq("family_id", familyId)
      .gte("start_at", startISO)
      .lt("start_at", endISO),
    supabase
      .from("events")
      .select("*, event_members(members(id, full_name))")
      .eq("family_id", familyId)
      .gte("event_date", startDate)
      .lt("event_date", endDate),
    supabase
      .from("trips")
      .select("*, trip_travellers(members(id, full_name))")
      .eq("family_id", familyId)
      .gte("start_date", startDate)
      .lt("start_date", endDate),
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
  ]);

  const items: PlannerCalendarItem[] = [];

  for (const a of activities ?? []) {
    const memberIds = (a.activity_members ?? [])
      .map((m) => (m.members as unknown as { id: string } | null)?.id)
      .filter((v): v is string => !!v);
    const who = a.applies_to_whole_family
      ? "WHOLE FAMILY"
      : firstNames((a.activity_members ?? []).map((m) => (m.members as unknown as { full_name: string } | null)?.full_name)) || "HOUSE";
    items.push({
      id: a.id,
      table: "activities",
      date: new Date(a.start_at),
      allDay: false,
      title: a.title,
      location: a.location,
      who,
      memberIds,
      appliesToAll: a.applies_to_whole_family,
      href: `/planner/add?type=activity&id=${a.id}`,
    });
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
      date: new Date(`${e.event_date}T00:00:00`),
      allDay: true,
      title: e.title,
      location: null,
      who,
      memberIds,
      appliesToAll: e.applies_to_whole_family || memberIds.length === 0,
      href: `/planner/add?type=event&id=${e.id}`,
    });
  }

  for (const t of trips ?? []) {
    const memberIds = (t.trip_travellers ?? [])
      .map((tr) => (tr.members as unknown as { id: string } | null)?.id)
      .filter((v): v is string => !!v);
    const who = t.applies_to_whole_family
      ? "WHOLE FAMILY"
      : firstNames((t.trip_travellers ?? []).map((tr) => (tr.members as unknown as { full_name: string } | null)?.full_name)) || "WHOLE FAMILY";
    items.push({
      id: t.id,
      table: "trips",
      date: new Date(`${t.start_date}T00:00:00`),
      allDay: true,
      title: t.title,
      location: null,
      who,
      memberIds,
      appliesToAll: t.applies_to_whole_family || memberIds.length === 0,
      href: `/planner?seg=travel`,
    });
  }

  for (const b of bills ?? []) {
    items.push({
      id: b.id,
      table: "bills",
      date: new Date(`${b.due_date}T00:00:00`),
      allDay: true,
      title: `${b.name} due`,
      location: null,
      who: "HOUSE",
      memberIds: [],
      appliesToAll: true,
      href: `/household?seg=bills`,
    });
  }

  for (const m of meals ?? []) {
    items.push({
      id: m.id,
      table: "meal_plans",
      date: new Date(`${m.plan_date}T00:00:00`),
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
      date: new Date(`${g.target_date}T00:00:00`),
      allDay: true,
      title: g.title,
      location: null,
      who,
      memberIds: g.owner_member_id ? [g.owner_member_id] : [],
      appliesToAll: g.is_joint,
      href: `/wealth?seg=goals`,
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

    for (const occ of expandRoutine(rule, rangeStart, rangeEnd)) {
      // Whose turn it is only means anything when the routine rotates;
      // otherwise everyone named on it is on for every occurrence.
      const turn = r.rotate_assignee ? assigneeFor(roster, occ.index) : null;
      const memberIds = turn ? [turn.id] : roster.map((m) => m.id);
      const who = r.applies_to_whole_family
        ? "WHOLE FAMILY"
        : turn
          ? turn.name.split(" ")[0].toUpperCase()
          : firstNames(roster.map((m) => m.name)) || "HOUSE";

      const at = r.time_of_day ? new Date(`${toISODate(occ.date)}T${r.time_of_day}`) : occ.date;
      items.push({
        id: `${r.id}:${toISODate(occ.date)}`,
        table: "routines",
        date: at,
        allDay: !r.time_of_day,
        title: r.title,
        location: r.location,
        who,
        memberIds,
        appliesToAll: r.applies_to_whole_family,
        href: `/planner?seg=routines`,
      });
    }
  }

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** An item is shown when it belongs to whoever is selected and its category
 * has not been switched off in the legend. */
function shown(item: PlannerCalendarItem, memberId?: string, hidden?: Set<CalendarGroup>): boolean {
  if (memberId && !item.appliesToAll && !item.memberIds.includes(memberId)) return false;
  return !hidden?.has(GROUP_OF[item.table]);
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The week containing `anchor` (defaults to today), plus a longer strip of
 * days either side of it. The strip is what the date rail scrolls through, so
 * the user can swipe weeks forward and back without a page load; the week
 * itself is the agenda beneath. One query covers both. */
export async function getWeekAgenda(
  familyId: string,
  memberId?: string,
  anchor: Date = new Date(),
  hidden?: Set<CalendarGroup>,
  stripWeeksEachSide = 6,
) {
  const today = new Date();
  const startOfWeek = new Date(anchor);
  startOfWeek.setDate(anchor.getDate() - anchor.getDay());

  const stripStart = new Date(startOfWeek);
  stripStart.setDate(startOfWeek.getDate() - 7 * stripWeeksEachSide);
  const stripLength = 7 * (stripWeeksEachSide * 2 + 1);
  const stripEnd = new Date(stripStart);
  stripEnd.setDate(stripStart.getDate() + stripLength);

  const all = await fetchCalendarItems(familyId, stripStart, stripEnd);
  const rows = all.filter((it) => shown(it, memberId, hidden));

  const byDay = new Map<string, PlannerCalendarItem[]>();
  for (const it of rows) {
    const key = toISODate(it.date);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(it);
    else byDay.set(key, [it]);
  }

  const strip = Array.from({ length: stripLength }, (_, i) => {
    const d = new Date(stripStart);
    d.setDate(stripStart.getDate() + i);
    return {
      date: d,
      isToday: d.toDateString() === today.toDateString(),
      isSelected: d.toDateString() === anchor.toDateString(),
      items: byDay.get(toISODate(d)) ?? [],
    };
  });

  const weekOffset = 7 * stripWeeksEachSide;
  const days = strip.slice(weekOffset, weekOffset + 7).map((d) => ({
    date: d.date,
    isToday: d.isToday,
    isSelected: d.isSelected,
    activities: d.items,
  }));

  return { weekStart: days[0].date, weekEnd: days[6].date, days, strip };
}

/** Consecutive months around `anchor`, each with its own days' items, so the
 * month grid can scroll continuously from one month into the next instead of
 * paging one month at a time. One query spans the whole run.
 *
 * The window is two years wide, and weighted forward: a calendar is read
 * ahead far more than behind, and it has to carry on through a December into
 * the next year and well beyond without stopping. Anything further out is a
 * couple of taps away in the header's jump sheet. */
export async function getMonthsOverview(
  familyId: string,
  anchor: Date,
  memberId?: string,
  hidden?: Set<CalendarGroup>,
  before = 6,
  after = 17,
) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth() - before, 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + after + 1, 1);

  const all = await fetchCalendarItems(familyId, first, end);
  const rows = all.filter((it) => shown(it, memberId, hidden));

  // Bucket the rows once by month rather than re-scanning them for each of
  // the two dozen months in the window.
  const byMonth = new Map<string, PlannerCalendarItem[]>();
  for (const it of rows) {
    const key = `${it.date.getFullYear()}-${it.date.getMonth()}`;
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(it);
    else byMonth.set(key, [it]);
  }

  const months = Array.from({ length: before + after + 1 }, (_, i) => {
    const monthStart = new Date(first.getFullYear(), first.getMonth() + i, 1);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const itemsByDay: PlannerCalendarItem[][] = Array.from({ length: daysInMonth + 1 }, () => []);
    for (const it of byMonth.get(`${monthStart.getFullYear()}-${monthStart.getMonth()}`) ?? []) {
      itemsByDay[it.date.getDate()].push(it);
    }
    return { monthStart, daysInMonth, itemsByDay };
  });

  return { months };
}

/** Per-month item counts for the whole year containing `anchor`, for the
 * year overview. */
export async function getYearOverview(familyId: string, anchor: Date, memberId?: string, hidden?: Set<CalendarGroup>) {
  const year = anchor.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const all = await fetchCalendarItems(familyId, yearStart, yearEnd);
  const countsByMonth = new Array(12).fill(0);
  for (const it of all) {
    if (!shown(it, memberId, hidden)) continue;
    countsByMonth[it.date.getMonth()]++;
  }

  return { year, countsByMonth };
}

export async function getEvents(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*, event_members(members(id, full_name))")
    .eq("family_id", familyId)
    .order("event_date", { ascending: true });
  return (data ?? []).map((e) => ({
    ...e,
    who: (e.event_members ?? [])
      .map((em) => (em.members as unknown as { full_name: string } | null)?.full_name)
      .filter((v): v is string => !!v),
  }));
}

export async function getTrips(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trips")
    .select("*, trip_travellers(members(id, full_name)), journal_entry_id")
    .eq("family_id", familyId)
    .order("start_date", { ascending: false });
  const trips = data ?? [];
  const urls = await getSignedUrls(
    "trip-photos",
    trips.map((t) => t.photo_storage_path).filter((v): v is string => !!v),
  );
  return trips.map((t) => ({
    ...t,
    photoUrl: t.photo_storage_path ? urls[t.photo_storage_path] ?? null : null,
    travellers: (t.trip_travellers ?? [])
      .map((tr) => (tr.members as unknown as { full_name: string } | null)?.full_name)
      .filter((v): v is string => !!v),
    travellerIds: (t.trip_travellers ?? [])
      .map((tr) => (tr.members as unknown as { id: string } | null)?.id)
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
  const counts = await Promise.all([
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("family_id", familyId),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("family_id", familyId),
    supabase.from("trips").select("id", { count: "exact", head: true }).eq("family_id", familyId),
    supabase.from("bills").select("id", { count: "exact", head: true }).eq("family_id", familyId).not("due_date", "is", null),
    supabase.from("meal_plans").select("id", { count: "exact", head: true }).eq("family_id", familyId),
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("family_id", familyId).not("target_date", "is", null),
  ]);
  return counts.some((c) => (c.count ?? 0) > 0);
}
