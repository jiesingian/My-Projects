import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { getValidDriveAccessToken, ensureDriveFolderStructure, ensureNamedSubfolder, listDriveFolderFiles } from "@/lib/google-drive";
import { familyDay } from "@/lib/time";

/** Drive has no push notifications wired up here, so this reconciles the
 * index against Drive's own Journal folder both ways on every load:
 * - drops rows for files someone deleted (or trashed) straight in Drive
 * - imports photos/videos someone dropped straight into Drive, so they
 *   show up in the app without having to be uploaded through it
 * Best effort throughout — gives up rather than guessing if Drive can't be
 * reached, and never touches rows for anything other than this family.
 *
 * Scheduled by the Journal page with after(), not awaited by the reads below.
 * It refreshes a token, resolves two folders and lists a whole Drive folder
 * before a single photo could be shown — and because both reads used to call
 * it, that happened twice on every load. The page now renders from the index
 * it already has and Drive is reconciled behind the response, so a change made
 * straight in Drive appears on the next visit rather than holding up this one. */
export async function syncDriveJournalMedia(
  familyId: string,
  familyName: string,
  // Made by the caller before after(): Next refuses cookies() inside an
  // after() callback during a render, so a client made in here threw on every
  // Journal visit with Drive connected and the reconcile never ran (seen in
  // production's error log from 7 September until the 26th).
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<void> {
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
        taken_at: f.createdTime ? f.createdTime.slice(0, 10) : familyDay(),
        storage_provider: "google_drive" as const,
        drive_file_id: f.id,
        drive_view_link: f.webViewLink ?? null,
        drive_thumbnail_link: f.thumbnailLink ?? null,
      })),
    );
  }
}

export async function getGallery(familyId: string) {
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

/** Has this household's Drive connection died?
 *
 * Read as its own question rather than inferred, and deliberately strict:
 * `=== false` means the row exists and says disconnected. A missing row (never
 * connected) and an unreadable one (a policy refusing the select) both answer
 * "no", because neither is evidence of a connection that has broken -- and a
 * household that never linked Drive must not be told to reconnect it.
 */
export async function driveIsDisconnected(familyId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("drive_links")
    .select("connected")
    .eq("family_id", familyId)
    .maybeSingle();
  return data?.connected === false;
}

export async function getEntries(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entries")
    .select("*, journal_entry_people(members(id, full_name)), journal_entry_media(journal_media(id, storage_path, storage_provider, drive_file_id))")
    .eq("family_id", familyId)
    .order("entry_date", { ascending: false });

  const entries = data ?? [];
  type MediaRef = { id: string; storage_path: string | null; storage_provider: string; drive_file_id: string | null };
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
    // With each photo's id, so the viewer can carry its reactions and comments.
    photos: (e.journal_entry_media ?? [])
      .map((m) => {
        const media = m.journal_media as unknown as MediaRef | null;
        if (!media) return null;
        const url =
          media.storage_provider === "google_drive"
            ? media.drive_file_id
              ? `/api/drive/file/${media.drive_file_id}`
              : null
            : media.storage_path
              ? (urls[media.storage_path] ?? null)
              : null;
        return url ? { id: media.id, url } : null;
      })
      .filter((v): v is { id: string; url: string } => !!v),
    // photos carries only urls and ids, which loses where each photo came from --
    // and the Entries pane needs to know, to say why they are not loading.
    hasDriveMedia: (e.journal_entry_media ?? []).some(
      (m) => (m.journal_media as unknown as MediaRef | null)?.storage_provider === "google_drive",
    ),
  }));
}

export async function getEntry(familyId: string, entryId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entries")
    .select(
      "*, journal_entry_people(members(id, full_name)), journal_entry_media(journal_media(id, storage_path, storage_provider, drive_file_id))",
    )
    .eq("family_id", familyId)
    .eq("id", entryId)
    .maybeSingle();
  if (!data) return null;

  type MediaRef = { id: string; storage_path: string | null; storage_provider: string; drive_file_id: string | null };
  const mediaRefs = (data.journal_entry_media ?? [])
    .map((m) => m.journal_media as unknown as MediaRef | null)
    .filter((v): v is MediaRef => !!v);
  const supabasePaths = mediaRefs.filter((v) => v.storage_provider === "supabase" && v.storage_path).map((v) => v.storage_path as string);
  const urls = await getSignedUrls("journal", supabasePaths);

  return {
    ...data,
    people: (data.journal_entry_people ?? [])
      .map((p) => (p.members as unknown as { id: string; full_name: string } | null))
      .filter((v): v is { id: string; full_name: string } => !!v),
    photos: mediaRefs
      .map((m) => ({
        id: m.id,
        url: m.storage_provider === "google_drive" && m.drive_file_id ? `/api/drive/file/${m.drive_file_id}` : m.storage_path ? (urls[m.storage_path] ?? null) : null,
      }))
      .filter((p): p is { id: string; url: string } => !!p.url),
  };
}

export async function getMilestones(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("milestones")
    .select("*, members!milestones_member_id_fkey(full_name)")
    .eq("family_id", familyId)
    .order("milestone_date", { ascending: false });
  return data ?? [];
}
