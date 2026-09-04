import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";

export type PlannerCalendarItem = {
  id: string;
  table: "activities" | "events" | "trips" | "bills" | "meal_plans" | "goals";
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

  const [{ data: activities }, { data: events }, { data: trips }, { data: bills }, { data: meals }, { data: goals }] = await Promise.all([
    supabase
      .from("activities")
      .select("*, activity_members(members(id, full_name))")
      .eq("family_id", familyId)
      .gte("start_at", startISO)
      .lt("start_at", endISO),
    supabase.from("events").select("*").eq("family_id", familyId).gte("event_date", startDate).lt("event_date", endDate),
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
    items.push({
      id: e.id,
      table: "events",
      date: new Date(`${e.event_date}T00:00:00`),
      allDay: true,
      title: e.title,
      location: null,
      who: "WHOLE FAMILY",
      memberIds: [],
      appliesToAll: true,
      href: `/planner/add?type=event&id=${e.id}`,
    });
  }

  for (const t of trips ?? []) {
    const memberIds = (t.trip_travellers ?? [])
      .map((tr) => (tr.members as unknown as { id: string } | null)?.id)
      .filter((v): v is string => !!v);
    const who = firstNames((t.trip_travellers ?? []).map((tr) => (tr.members as unknown as { full_name: string } | null)?.full_name)) || "WHOLE FAMILY";
    items.push({
      id: t.id,
      table: "trips",
      date: new Date(`${t.start_date}T00:00:00`),
      allDay: true,
      title: t.title,
      location: null,
      who,
      memberIds,
      appliesToAll: memberIds.length === 0,
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

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function matchesMember(item: PlannerCalendarItem, memberId?: string): boolean {
  return !memberId || item.appliesToAll || item.memberIds.includes(memberId);
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The week containing `anchor` (defaults to today), plus a longer strip of
 * days either side of it. The strip is what the date rail scrolls through, so
 * the user can swipe weeks forward and back without a page load; the week
 * itself is the agenda beneath. One query covers both. */
export async function getWeekAgenda(familyId: string, memberId?: string, anchor: Date = new Date(), stripWeeksEachSide = 4) {
  const today = new Date();
  const startOfWeek = new Date(anchor);
  startOfWeek.setDate(anchor.getDate() - anchor.getDay());

  const stripStart = new Date(startOfWeek);
  stripStart.setDate(startOfWeek.getDate() - 7 * stripWeeksEachSide);
  const stripLength = 7 * (stripWeeksEachSide * 2 + 1);
  const stripEnd = new Date(stripStart);
  stripEnd.setDate(stripStart.getDate() + stripLength);

  const all = await fetchCalendarItems(familyId, stripStart, stripEnd);
  const rows = all.filter((it) => matchesMember(it, memberId));

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
 * paging one month at a time. One query spans the whole run. */
export async function getMonthsOverview(familyId: string, anchor: Date, memberId?: string, before = 1, after = 2) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth() - before, 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + after + 1, 1);

  const all = await fetchCalendarItems(familyId, first, end);
  const rows = all.filter((it) => matchesMember(it, memberId));

  const months = Array.from({ length: before + after + 1 }, (_, i) => {
    const monthStart = new Date(first.getFullYear(), first.getMonth() + i, 1);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const itemsByDay: PlannerCalendarItem[][] = Array.from({ length: daysInMonth + 1 }, () => []);
    for (const it of rows) {
      if (it.date.getFullYear() === monthStart.getFullYear() && it.date.getMonth() === monthStart.getMonth()) {
        itemsByDay[it.date.getDate()].push(it);
      }
    }
    return { monthStart, daysInMonth, itemsByDay };
  });

  return { months };
}

/** Per-month item counts for the whole year containing `anchor`, for the
 * year overview. */
export async function getYearOverview(familyId: string, anchor: Date, memberId?: string) {
  const year = anchor.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const all = await fetchCalendarItems(familyId, yearStart, yearEnd);
  const countsByMonth = new Array(12).fill(0);
  for (const it of all) {
    if (!matchesMember(it, memberId)) continue;
    countsByMonth[it.date.getMonth()]++;
  }

  return { year, countsByMonth };
}

export async function getEvents(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*").eq("family_id", familyId).order("event_date", { ascending: true });
  return data ?? [];
}

export async function getTrips(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trips")
    .select("*, trip_travellers(members(full_name)), journal_entry_id")
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
  }));
}
