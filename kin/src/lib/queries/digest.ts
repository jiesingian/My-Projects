import { householdZone } from "@/lib/household-zone";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { familyDay } from "@/lib/time";
import { startOfWeek, weekStartOf } from "@/lib/week";
import { getWeekRecap, type WeekRecap } from "@/lib/queries/memories";
import { getRoutines } from "@/lib/queries/routines";
import { getGoals, type GoalView } from "@/lib/queries/goals";
import { getWeekAgenda, type PlannerCalendarItem } from "@/lib/queries/planner";
import { nextWeekFor } from "@/lib/digest";
import { inKidView } from "@/lib/kid-view";

export type WeeklyDigest = {
  recap: WeekRecap;
  photos: { id: string; url: string }[];
  highlights: { id: string; title: string; milestone: boolean; date: string }[];
  streaks: { id: string; title: string; who: string; days: number }[];
  goals: GoalView[];
  nextWeek: { date: Date; items: PlannerCalendarItem[] }[];
};

type Reader = { id: string; role: string; family_id: string; kid_view?: boolean | null; families: { week_start?: string | null } };

/** The Sunday digest (approved 30 September): the week just gone, and the one
 * coming. Everything is read the way the rest of Kin reads it for this
 * person, so the digest shows nothing their own tabs would not:
 *
 * - photos and journal entries are the household's only -- a "just me"
 *   entry is on its writer's Mine tab and nowhere else;
 * - goals come from getGoals, which already applies each goal's own
 *   visibility for this reader;
 * - next week's plans pass lib/digest's nextWeekFor, Today's rule;
 * - in kid view, money goals and bills are left out, as they are on a
 *   child's Today. */
export async function getWeeklyDigest(me: Reader): Promise<WeeklyDigest> {
  const tz = await householdZone();
  const supabase = await createClient();
  const kid = inKidView(me);
  const weekStart = weekStartOf(me.families.week_start);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const sinceDay = familyDay(since, tz);
  const nextWeekAnchor = startOfWeek(new Date(Date.now() + 7 * 86_400_000), weekStart);

  const [recap, { data: media }, { data: entries }, routines, goals, agenda, { data: members }] = await Promise.all([
    getWeekRecap(me.family_id),
    supabase
      .from("journal_media")
      .select("id, storage_path, storage_provider, drive_file_id, media_type")
      .eq("family_id", me.family_id)
      .eq("visibility", "household")
      .neq("media_type", "video")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(9),
    supabase
      .from("journal_entries")
      .select("id, title, milestone, entry_date")
      .eq("family_id", me.family_id)
      .eq("visibility", "household")
      .gte("entry_date", sinceDay)
      // A ★ milestone first: it is the week's news.
      .order("milestone", { ascending: false })
      .order("entry_date", { ascending: false })
      .limit(5),
    getRoutines(me.family_id),
    getGoals(me.family_id, me, weekStart),
    getWeekAgenda(me.family_id, undefined, nextWeekAnchor, undefined, 0, weekStart),
    supabase.from("members").select("id, role").eq("family_id", me.family_id),
  ]);

  const paths = (media ?? []).filter((m) => m.storage_provider === "supabase" && m.storage_path).map((m) => m.storage_path as string);
  const urls = paths.length ? await getSignedUrls("journal", paths) : {};
  const photos = (media ?? [])
    .map((m) => ({ id: m.id, url: m.storage_provider === "google_drive" ? (m.drive_file_id ? `/api/drive/file/${m.drive_file_id}` : null) : m.storage_path ? urls[m.storage_path] ?? null : null }))
    .filter((p): p is { id: string; url: string } => !!p.url);

  // A streak worth a mention: three days running or more, longest first.
  const streaks = routines
    .filter((r) => !r.paused && r.streak >= 3)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 4)
    .map((r) => ({
      id: r.id,
      title: r.title,
      who: r.appliesToAll ? "Everyone" : r.members.map((m) => m.name.split(" ")[0]).join(", ") || "The house",
      days: r.streak,
    }));

  const roles = new Map((members ?? []).map((m) => [m.id, m.role as string]));
  const nextWeek = agenda.days
    .map((d) => ({ date: d.date, items: nextWeekFor(d.activities, me, (id) => roles.get(id), kid) }))
    .filter((d) => d.items.length > 0);

  return {
    recap,
    photos,
    highlights: (entries ?? []).map((e) => ({ id: e.id, title: e.title, milestone: e.milestone, date: e.entry_date })),
    streaks,
    goals: (kid ? goals.filter((g) => g.kind !== "money") : goals).filter((g) => !g.noData).slice(0, 4),
    nextWeek,
  };
}
