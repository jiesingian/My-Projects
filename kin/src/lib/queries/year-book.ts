import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import type { YearBookEntry } from "@/lib/year-book";

/** The household journal's entries for the year book, with their photos
 * (never videos) and how many reactions each drew. Read with the viewer's own
 * client, so row-level security has already left out anything they could not
 * open; personal ("Just me") entries are not the household's, so they stay out
 * of its book. Signed links last 30 minutes, which is longer than making a
 * book takes. */
export async function getYearBookEntries(familyId: string): Promise<YearBookEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entries")
    .select(
      `id, entry_date, title, note, milestone, milestone_member:members!journal_entries_milestone_member_id_fkey(full_name), journal_entry_people(members(full_name)), journal_entry_media(journal_media(id, storage_path, storage_provider, drive_file_id, media_type))`,
    )
    .eq("family_id", familyId)
    .eq("visibility", "household")
    .order("entry_date", { ascending: true });
  const entries = data ?? [];

  type MediaRef = { id: string; storage_path: string | null; storage_provider: string; drive_file_id: string | null; media_type: string };
  const mediaOf = (e: (typeof entries)[number]) =>
    (e.journal_entry_media ?? [])
      .map((m) => m.journal_media as unknown as MediaRef | null)
      .filter((v): v is MediaRef => !!v && v.media_type !== "video");
  const paths = entries.flatMap((e) => mediaOf(e).filter((m) => m.storage_provider === "supabase" && m.storage_path).map((m) => m.storage_path as string));
  const ids = entries.map((e) => e.id);
  const [urls, { data: reactions }] = await Promise.all([
    getSignedUrls("journal", paths),
    ids.length ? supabase.from("journal_reactions").select("entry_id").in("entry_id", ids) : Promise.resolve({ data: [] as { entry_id: string }[] }),
  ]);
  const reactionCount = new Map<string, number>();
  for (const r of reactions ?? []) reactionCount.set(r.entry_id, (reactionCount.get(r.entry_id) ?? 0) + 1);

  return entries.map((e) => ({
    id: e.id,
    date: e.entry_date,
    title: e.title,
    note: e.note,
    milestone: e.milestone,
    milestoneOf: (e.milestone_member as unknown as { full_name: string } | null)?.full_name ?? null,
    people: (e.journal_entry_people ?? [])
      .map((p) => (p.members as unknown as { full_name: string } | null)?.full_name)
      .filter((v): v is string => !!v),
    photos: mediaOf(e)
      .map((m) =>
        m.storage_provider === "google_drive" ? (m.drive_file_id ? `/api/drive/file/${m.drive_file_id}` : null) : m.storage_path ? (urls[m.storage_path] ?? null) : null,
      )
      .filter((u): u is string => !!u),
    reactions: reactionCount.get(e.id) ?? 0,
  }));
}
