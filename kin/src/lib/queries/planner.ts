import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";

export async function getWeekAgenda(familyId: string) {
  const supabase = await createClient();
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
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

  const rows = (activities ?? []).map((a) => ({
    ...a,
    who: a.applies_to_whole_family
      ? "WHOLE FAMILY"
      : (a.activity_members ?? [])
          .map((m) => (m.members as unknown as { full_name: string } | null)?.full_name?.split(" ")[0])
          .filter(Boolean)
          .join(", ")
          .toUpperCase() || "HOUSE",
  }));

  const todayActivities = rows.filter((a) => new Date(a.start_at).toDateString() === today.toDateString());

  return {
    days: days.map((d) => ({
      date: d,
      count: rows.filter((a) => new Date(a.start_at).toDateString() === d.toDateString()).length,
      isToday: d.toDateString() === today.toDateString(),
    })),
    today: todayActivities,
  };
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
