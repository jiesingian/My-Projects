import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";

/** The week containing `anchor` (defaults to today), with every day's own
 * activities attached — not just today's — so Prev/Next week navigation has
 * something to show for whichever week is selected. */
export async function getWeekAgenda(familyId: string, memberId?: string, anchor: Date = new Date()) {
  const supabase = await createClient();
  const today = new Date();
  const startOfWeek = new Date(anchor);
  startOfWeek.setDate(anchor.getDate() - anchor.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const { data: activities } = await supabase
    .from("activities")
    .select("*, activity_members(members(id, full_name))")
    .eq("family_id", familyId)
    .gte("start_at", days[0].toISOString())
    .lt("start_at", new Date(days[6].getTime() + 86400000).toISOString())
    .order("start_at", { ascending: true });

  const allRows = (activities ?? []).map((a) => ({
    ...a,
    who: a.applies_to_whole_family
      ? "WHOLE FAMILY"
      : (a.activity_members ?? [])
          .map((m) => (m.members as unknown as { full_name: string } | null)?.full_name?.split(" ")[0])
          .filter(Boolean)
          .join(", ")
          .toUpperCase() || "HOUSE",
    memberIds: (a.activity_members ?? []).map((m) => (m.members as unknown as { id: string } | null)?.id).filter((v): v is string => !!v),
  }));

  const rows = memberId ? allRows.filter((a) => a.applies_to_whole_family || a.memberIds.includes(memberId)) : allRows;

  return {
    weekStart: days[0],
    weekEnd: days[6],
    days: days.map((d) => ({
      date: d,
      isToday: d.toDateString() === today.toDateString(),
      activities: rows.filter((a) => new Date(a.start_at).toDateString() === d.toDateString()),
    })),
  };
}

/** Per-day activity counts for the whole month containing `anchor`, for the
 * month-grid view. */
export async function getMonthOverview(familyId: string, anchor: Date, memberId?: string) {
  const supabase = await createClient();
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const { data: activities } = await supabase
    .from("activities")
    .select("start_at, applies_to_whole_family, activity_members(member_id)")
    .eq("family_id", familyId)
    .gte("start_at", monthStart.toISOString())
    .lt("start_at", monthEnd.toISOString());

  const countsByDay = new Array(daysInMonth + 1).fill(0);
  for (const a of activities ?? []) {
    if (memberId && !a.applies_to_whole_family && !(a.activity_members ?? []).some((m) => m.member_id === memberId)) continue;
    countsByDay[new Date(a.start_at).getDate()]++;
  }

  return { monthStart, daysInMonth, countsByDay };
}

/** Per-month activity counts for the whole year containing `anchor`, for the
 * year overview. */
export async function getYearOverview(familyId: string, anchor: Date, memberId?: string) {
  const supabase = await createClient();
  const year = anchor.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const { data: activities } = await supabase
    .from("activities")
    .select("start_at, applies_to_whole_family, activity_members(member_id)")
    .eq("family_id", familyId)
    .gte("start_at", yearStart.toISOString())
    .lt("start_at", yearEnd.toISOString());

  const countsByMonth = new Array(12).fill(0);
  for (const a of activities ?? []) {
    if (memberId && !a.applies_to_whole_family && !(a.activity_members ?? []).some((m) => m.member_id === memberId)) continue;
    countsByMonth[new Date(a.start_at).getMonth()]++;
  }

  return { year, countsByMonth };
}

export async function getEvents(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*").eq("family_id", familyId).order("event_date", { ascending: true });
  return data ?? [];
}

export async function getGoals(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("goals")
    .select("*, owner:owner_member_id(full_name)")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });
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
