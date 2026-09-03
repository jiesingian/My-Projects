import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { getValidDriveAccessToken, ensureDriveFolderStructure, ensureNamedSubfolder, listDriveFileIds } from "@/lib/google-drive";

/** Drive has no push notifications wired up here, so a file deleted straight
 * from Drive (not through the app) would otherwise keep showing up forever.
 * Reconciles by listing what's actually still in the household's Journal
 * folder and dropping any index rows Drive no longer has — best effort, and
 * deliberately gives up rather than mass-deleting if Drive can't be reached. */
async function pruneDeletedDriveMedia(familyId: string, familyName: string): Promise<void> {
  const supabase = await createClient();
  const { data: driveMedia } = await supabase
    .from("journal_media")
    .select("id, drive_file_id")
    .eq("family_id", familyId)
    .eq("storage_provider", "google_drive");
  if (!driveMedia || driveMedia.length === 0) return;

  const token = await getValidDriveAccessToken(familyId);
  if (!token) return;

  try {
    const { rootFolderId } = await ensureDriveFolderStructure(familyId, token, familyName);
    const folderId = await ensureNamedSubfolder(token, rootFolderId, "Journal");
    const liveIds = await listDriveFileIds(token, folderId);
    const staleIds = driveMedia.filter((m) => m.drive_file_id && !liveIds.has(m.drive_file_id)).map((m) => m.id);
    if (staleIds.length > 0) {
      await supabase.from("journal_media").delete().in("id", staleIds);
    }
  } catch {
    // Drive unreachable or erroring — leave the index as-is rather than guess.
  }
}

export async function getGallery(familyId: string, familyName: string) {
  await pruneDeletedDriveMedia(familyId, familyName);
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_media")
    .select("*")
    .eq("family_id", familyId)
    .order("taken_at", { ascending: false })
    .limit(30);
  const media = data ?? [];
  const supabasePaths = media.map((m) => m.storage_path).filter((p): p is string => !!p);
  const urls = await getSignedUrls("journal", supabasePaths);

  return media.map((m) => ({
    ...m,
    url:
      m.storage_provider === "google_drive" && m.drive_file_id
        ? `/api/drive/file/${m.drive_file_id}`
        : m.storage_path
          ? urls[m.storage_path] ?? null
          : null,
    viewLink: m.storage_provider === "google_drive" ? m.drive_view_link : null,
  }));
}

export async function getEntries(familyId: string, familyName: string) {
  await pruneDeletedDriveMedia(familyId, familyName);
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entries")
    .select("*, journal_entry_people(members(id, full_name)), journal_entry_media(journal_media(storage_path, storage_provider, drive_file_id))")
    .eq("family_id", familyId)
    .order("entry_date", { ascending: false });

  const entries = data ?? [];
  type MediaRef = { storage_path: string | null; storage_provider: string; drive_file_id: string | null };
  const allPaths = entries.flatMap((e) =>
    (e.journal_entry_media ?? [])
      .map((m) => m.journal_media as unknown as MediaRef | null)
      .filter((v): v is MediaRef => !!v && v.storage_provider === "supabase" && !!v.storage_path)
      .map((v) => v.storage_path as string),
  );
  const urls = await getSignedUrls("journal", allPaths);

  return entries.map((e) => ({
    ...e,
    people: (e.journal_entry_people ?? [])
      .map((p) => (p.members as unknown as { id: string; full_name: string } | null))
      .filter((v): v is { id: string; full_name: string } => !!v),
    photoUrls: (e.journal_entry_media ?? [])
      .map((m) => {
        const media = m.journal_media as unknown as MediaRef | null;
        if (!media) return null;
        if (media.storage_provider === "google_drive") return media.drive_file_id ? `/api/drive/file/${media.drive_file_id}` : null;
        return media.storage_path ? urls[media.storage_path] ?? null : null;
      })
      .filter((v): v is string => !!v),
  }));
}

export async function getMilestones(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("milestones")
    .select("*, members(full_name)")
    .eq("family_id", familyId)
    .order("milestone_date", { ascending: false });
  return data ?? [];
}
