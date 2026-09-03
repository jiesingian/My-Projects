import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { getValidDriveAccessToken, ensureDriveFolderStructure, ensureNamedSubfolder, listDriveFolderFiles } from "@/lib/google-drive";

/** Drive has no push notifications wired up here, so this reconciles the
 * index against Drive's own Journal folder both ways on every load:
 * - drops rows for files someone deleted (or trashed) straight in Drive
 * - imports photos/videos someone dropped straight into Drive, so they
 *   show up in the app without having to be uploaded through it
 * Best effort throughout — gives up rather than guessing if Drive can't be
 * reached, and never touches rows for anything other than this family. */
async function syncDriveJournalMedia(familyId: string, familyName: string): Promise<void> {
  const token = await getValidDriveAccessToken(familyId);
  if (!token) return;

  let folderId: string;
  try {
    const { rootFolderId } = await ensureDriveFolderStructure(familyId, token, familyName);
    folderId = await ensureNamedSubfolder(token, rootFolderId, "Journal");
  } catch {
    return;
  }

  let liveFiles;
  try {
    liveFiles = await listDriveFolderFiles(token, folderId);
  } catch {
    return;
  }

  const supabase = await createClient();
  const { data: indexed } = await supabase
    .from("journal_media")
    .select("id, drive_file_id")
    .eq("family_id", familyId)
    .eq("storage_provider", "google_drive");

  const liveIds = new Set(liveFiles.map((f) => f.id));
  const indexedIds = new Set((indexed ?? []).map((m) => m.drive_file_id).filter((id): id is string => !!id));

  const staleRowIds = (indexed ?? []).filter((m) => m.drive_file_id && !liveIds.has(m.drive_file_id)).map((m) => m.id);
  if (staleRowIds.length > 0) {
    await supabase.from("journal_media").delete().in("id", staleRowIds);
  }

  const newFiles = liveFiles.filter(
    (f) => !indexedIds.has(f.id) && (f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/")),
  );
  if (newFiles.length > 0) {
    await supabase.from("journal_media").insert(
      newFiles.map((f) => ({
        family_id: familyId,
        media_type: f.mimeType.startsWith("video/") ? "video" : "photo",
        taken_at: f.createdTime ? f.createdTime.slice(0, 10) : new Date().toISOString().slice(0, 10),
        storage_provider: "google_drive" as const,
        drive_file_id: f.id,
        drive_view_link: f.webViewLink ?? null,
        drive_thumbnail_link: f.thumbnailLink ?? null,
      })),
    );
  }
}

export async function getGallery(familyId: string, familyName: string) {
  await syncDriveJournalMedia(familyId, familyName);
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
  await syncDriveJournalMedia(familyId, familyName);
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
