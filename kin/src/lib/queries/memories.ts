import { householdZone } from "@/lib/household-zone";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { familyDay } from "@/lib/time";

export type Memory = { id: string; kind: "entry" | "milestone"; title: string; yearsAgo: number; photoUrl: string | null; href: string };

/** "On this day": journal entries and milestones from this date in earlier
 * years, newest first. A handful at most -- it is a nudge to look back, not
 * an archive. Nothing new is stored for it. */
export async function getOnThisDay(familyId: string): Promise<Memory[]> {
  const tz = await householdZone();
  const supabase = await createClient();
  const today = familyDay(new Date(), tz);
  const year = Number(today.slice(0, 4));
  const monthDay = today.slice(4);
  // Twenty years back is further than any household's journal goes, and an
  // IN list of dates is what an index on entry_date answers directly.
  const days = Array.from({ length: 20 }, (_, i) => `${year - 1 - i}${monthDay}`);

  const [{ data: entries }, { data: milestones }] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("id, title, entry_date, journal_entry_media(journal_media(storage_path, storage_provider, drive_file_id, media_type))")
      .eq("family_id", familyId)
      .eq("visibility", "household")
      .eq("milestone", false)
      .in("entry_date", days)
      .order("entry_date", { ascending: false })
      .limit(4),
    // Milestones are journal entries marked ★ (since 29 September); asked
    // apart so a milestone keeps its "Name: title" and its place in the three.
    supabase
      .from("journal_entries")
      .select("id, title, entry_date, members!journal_entries_milestone_member_id_fkey(full_name)")
      .eq("family_id", familyId)
      .eq("visibility", "household")
      .eq("milestone", true)
      .in("entry_date", days)
      .order("entry_date", { ascending: false })
      .limit(3),
  ]);

  type MediaRef = { storage_path: string | null; storage_provider: string; drive_file_id: string | null; media_type: string };
  const firstPhoto = (e: NonNullable<typeof entries>[number]) =>
    (e.journal_entry_media ?? []).map((m) => m.journal_media as unknown as MediaRef | null).find((m) => m && m.media_type !== "video") ?? null;
  const paths = (entries ?? []).map(firstPhoto).filter((m): m is MediaRef => !!m && m.storage_provider === "supabase" && !!m.storage_path).map((m) => m.storage_path as string);
  const urls = paths.length ? await getSignedUrls("journal", paths) : {};

  const out: Memory[] = [];
  for (const e of entries ?? []) {
    const m = firstPhoto(e);
    const photoUrl = !m ? null : m.storage_provider === "google_drive" ? (m.drive_file_id ? `/api/drive/file/${m.drive_file_id}` : null) : m.storage_path ? urls[m.storage_path] ?? null : null;
    out.push({ id: e.id, kind: "entry", title: e.title, yearsAgo: year - Number(e.entry_date.slice(0, 4)), photoUrl, href: "/journal" });
  }
  for (const ms of milestones ?? []) {
    const who = (ms.members as unknown as { full_name: string } | null)?.full_name?.split(" ")[0];
    out.push({ id: ms.id, kind: "milestone", title: who ? `${who}: ${ms.title}` : ms.title, yearsAgo: year - Number(ms.entry_date.slice(0, 4)), photoUrl: null, href: "/journal?view=milestones" });
  }
  return out.sort((a, b) => a.yearsAgo - b.yearsAgo).slice(0, 5);
}

export type WeekRecap = { posts: number; photos: number; choresDone: number; milestones: number; topHelper: string | null };

/** The last seven days in the household, in numbers a family is glad to see:
 * what they posted, what they got done, what happened. Shown on Today at the
 * weekend (see the page), built from rows Kin already keeps. */
export async function getWeekRecap(familyId: string): Promise<WeekRecap> {
  const tz = await householdZone();
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 86_400_000);
  const sinceDay = familyDay(since, tz);
  const [posts, photos, chores, milestones] = await Promise.all([
    supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("family_id", familyId).eq("visibility", "household").gte("created_at", since.toISOString()),
    supabase.from("journal_media").select("id", { count: "exact", head: true }).eq("family_id", familyId).eq("visibility", "household").gte("created_at", since.toISOString()),
    supabase.from("routine_log").select("member_id, members!routine_log_member_id_fkey(full_name)").eq("family_id", familyId).eq("status", "done").gte("occurrence_date", sinceDay),
    supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("family_id", familyId).eq("visibility", "household").eq("milestone", true).gte("entry_date", sinceDay),
  ]);
  const byMember = new Map<string, { name: string; n: number }>();
  for (const r of chores.data ?? []) {
    const name = (r.members as unknown as { full_name: string } | null)?.full_name?.split(" ")[0];
    if (!r.member_id || !name) continue;
    const cur = byMember.get(r.member_id) ?? { name, n: 0 };
    cur.n++;
    byMember.set(r.member_id, cur);
  }
  const top = [...byMember.values()].sort((a, b) => b.n - a.n)[0];
  return {
    posts: posts.count ?? 0,
    photos: photos.count ?? 0,
    choresDone: chores.data?.length ?? 0,
    milestones: milestones.count ?? 0,
    topHelper: top && top.n >= 2 ? `${top.name} (${top.n})` : null,
  };
}
