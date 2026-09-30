import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { getValidDriveAccessToken, ensureDriveFolderStructure, ensureNamedSubfolder, listDriveFolderFiles } from "@/lib/google-drive";
import { familyDay } from "@/lib/time";
import { getEntryVideos, type EntryVideo } from "@/lib/queries/entry-video";

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
    // The household's photos. Your own personal ones are on Mine, with their
    // entries; the Gallery is what the whole household shares.
    .eq("visibility", "household")
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

/** The household journal (Household), or -- with `mine` -- everything this
 * person wrote: their personal entries and the ones they put in the household
 * journal (Mine). Row-level security keeps anybody else's personal entries out
 * either way; the filters say which of what you may see belongs on the tab. */
export async function getEntries(familyId: string, mine?: { personId: string }, opts?: { milestonesOnly?: boolean }) {
  const supabase = await createClient();
  let query = supabase
    .from("journal_entries")
    .select(
      `*, milestone_member:members!journal_entries_milestone_member_id_fkey(full_name), journal_entry_people(members(id, full_name)), journal_entry_media(journal_media(id, storage_path, storage_provider, drive_file_id))`,
    )
    .eq("family_id", familyId);
  query = mine ? query.eq("owner_person_id", mine.personId) : query.eq("visibility", "household");
  // The ★ filter on Household: milestones are entries marked as one.
  if (opts?.milestonesOnly) query = query.eq("milestone", true);
  const { data } = await query.order("entry_date", { ascending: false });

  const entries = data ?? [];
  type MediaRef = { id: string; storage_path: string | null; storage_provider: string; drive_file_id: string | null };
  const allPaths = entries.flatMap((e) =>
    (e.journal_entry_media ?? [])
      .map((m) => m.journal_media as unknown as MediaRef | null)
      .filter((v): v is MediaRef => !!v && v.storage_provider === "supabase" && !!v.storage_path)
      .map((v) => v.storage_path as string),
  );
  const [urls, videos] = await Promise.all([getSignedUrls("journal", allPaths), getEntryVideos(entries.map((e) => e.id))]);

  return entries.map((e) => ({
    ...e,
    video: videos.get(e.id) ?? null,
    milestoneOf: (e.milestone_member as unknown as { full_name: string } | null)?.full_name ?? null,
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
      `*, milestone_member:members!journal_entries_milestone_member_id_fkey(full_name), journal_entry_people(members(id, full_name)), journal_entry_media(journal_media(id, storage_path, storage_provider, drive_file_id, media_type))`,
    )
    .eq("family_id", familyId)
    .eq("id", entryId)
    .maybeSingle();
  if (!data) return null;

  type MediaRef = { id: string; storage_path: string | null; storage_provider: string; drive_file_id: string | null; media_type: string };
  const mediaRefs = (data.journal_entry_media ?? [])
    .map((m) => m.journal_media as unknown as MediaRef | null)
    .filter((v): v is MediaRef => !!v);
  const supabasePaths = mediaRefs.filter((v) => v.storage_provider === "supabase" && v.storage_path).map((v) => v.storage_path as string);
  const [urls, videos] = await Promise.all([getSignedUrls("journal", supabasePaths), getEntryVideos([data.id])]);

  return {
    ...data,
    video: videos.get(data.id) ?? null,
    milestoneOf: (data.milestone_member as unknown as { full_name: string } | null)?.full_name ?? null,
    people: (data.journal_entry_people ?? [])
      .map((p) => (p.members as unknown as { id: string; full_name: string } | null))
      .filter((v): v is { id: string; full_name: string } => !!v),
    hasDriveMedia: mediaRefs.some((m) => m.storage_provider === "google_drive"),
    photos: mediaRefs
      .map((m) => ({
        id: m.id,
        kind: m.media_type === "video" ? ("video" as const) : ("photo" as const),
        url: m.storage_provider === "google_drive" && m.drive_file_id ? `/api/drive/file/${m.drive_file_id}` : m.storage_path ? (urls[m.storage_path] ?? null) : null,
      }))
      .filter((p): p is { id: string; kind: "photo" | "video"; url: string } => !!p.url),
  };
}

/** A person's recent moments, for their profile: household journal entries
 * they wrote or are in, newest first, each with its first photo, and their
 * milestones. Row-level security decides what the viewer may see; a personal
 * entry is its owner's alone and never shows on anyone else's view of them. */
export async function getPersonMoments(familyId: string, memberId: string, limit = 6) {
  const supabase = await createClient();
  const [{ data: tagged }, { data: milestones }] = await Promise.all([
    supabase.from("journal_entry_people").select("entry_id").eq("member_id", memberId),
    supabase
      .from("journal_entries")
      .select("id, title, entry_date")
      .eq("family_id", familyId)
      .eq("visibility", "household")
      .eq("milestone", true)
      .eq("milestone_member_id", memberId)
      .order("entry_date", { ascending: false })
      .limit(8),
  ]);
  const ids = (tagged ?? []).map((t) => t.entry_id);
  const who = ids.length ? `created_by.eq.${memberId},id.in.(${ids.join(",")})` : `created_by.eq.${memberId}`;
  const { data } = await supabase
    .from("journal_entries")
    .select("id, title, note, entry_date, journal_entry_media(sort_order, journal_media(id, storage_path, storage_provider, drive_file_id))")
    .eq("family_id", familyId)
    .eq("visibility", "household")
    .eq("milestone", false)
    .or(who)
    .order("entry_date", { ascending: false })
    .limit(limit);

  type MediaRef = { id: string; storage_path: string | null; storage_provider: string; drive_file_id: string | null };
  const firstMedia = (e: NonNullable<typeof data>[number]) =>
    [...(e.journal_entry_media ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => m.journal_media as unknown as MediaRef | null)
      .find((m): m is MediaRef => !!m) ?? null;
  const entries = data ?? [];
  const paths = entries
    .map(firstMedia)
    .filter((m): m is MediaRef => !!m && m.storage_provider === "supabase" && !!m.storage_path)
    .map((m) => m.storage_path as string);
  const urls = await getSignedUrls("journal", paths);

  return {
    milestones: (milestones ?? []).map((m) => ({ id: m.id, title: m.title, milestone_date: m.entry_date })),
    moments: entries.map((e) => {
      const m = firstMedia(e);
      const photo = !m
        ? null
        : m.storage_provider === "google_drive"
          ? m.drive_file_id
            ? `/api/drive/file/${m.drive_file_id}`
            : null
          : m.storage_path
            ? (urls[m.storage_path] ?? null)
            : null;
      return { id: e.id, title: e.title, note: e.note, date: e.entry_date, photo };
    }),
  };
}

type PublicMedia = { id: string; storage_path: string | null; storage_provider: string; drive_file_id: string | null; owner_person_id: string | null };

/** Photos of a Public entry as the reader may see them: the writer's own, and
 * for anyone outside the writer's household only Kin-stored ones -- the
 * policies already hold back the rest, this just keeps the shapes tidy. */
async function publicPhotos(rows: { owner_person_id: string | null; family_id: string; journal_entry_media: { journal_media: unknown }[] | null }[], myFamilyId: string | null) {
  const mediaOf = (r: (typeof rows)[number]) =>
    (r.journal_entry_media ?? [])
      .map((m) => m.journal_media as PublicMedia | null)
      .filter((m): m is PublicMedia => !!m && m.owner_person_id === r.owner_person_id);
  const paths = rows.flatMap((r) => mediaOf(r).filter((m) => m.storage_provider === "supabase" && m.storage_path).map((m) => m.storage_path as string));
  const urls = await getSignedUrls("journal", paths);
  return (r: (typeof rows)[number]) => {
    const ours = r.family_id === myFamilyId;
    return mediaOf(r)
      .map((m) => {
        const url =
          m.storage_provider === "google_drive"
            ? ours && m.drive_file_id
              ? `/api/drive/file/${m.drive_file_id}`
              : null
            : m.storage_path
              ? (urls[m.storage_path] ?? null)
              : null;
        // Ids only on our own household's photos: reactions and comments stay
        // in the household whose photo it is, as on the Family feed.
        return url ? { id: ours ? m.id : null, url } : null;
      })
      .filter((p): p is { id: string | null; url: string } => !!p);
  };
}

/** An entry from outside this household that someone you are connected with
 * made Public -- for its own page, when getEntry (this household's) finds
 * nothing. Row-level security decides whether it is readable at all. */
export async function getPublicEntry(entryId: string) {
  const supabase = await createClient();
  const [{ data }, me] = await Promise.all([
    supabase
      .from("journal_entries")
      .select(`*, journal_entry_media(journal_media(id, storage_path, storage_provider, drive_file_id, owner_person_id))`)
      .eq("id", entryId)
      .not("public_at", "is", null)
      .maybeSingle(),
    supabase.rpc("current_family_id"),
  ]);
  if (!data) return null;
  const [photosOf, videos] = await Promise.all([publicPhotos([data], (me.data as string | null) ?? null), getEntryVideos([data.id])]);
  return {
    ...data,
    video: videos.get(data.id) ?? null,
    // A connection's household is theirs: who was there and whose milestone
    // are names from inside it, and are not shown.
    milestoneOf: null as string | null,
    people: [] as { id: string; full_name: string }[],
    // Another household's Drive is not ours to explain.
    hasDriveMedia: false,
    photos: photosOf(data),
  };
}

export type PublicFeedEntry = {
  id: string;
  title: string;
  note: string | null;
  entryDate: string;
  milestone: boolean;
  author: string;
  mine: boolean;
  photos: { id: string | null; url: string }[];
  video: EntryVideo | null;
};

/** The Public feed: entries marked Public by the people you are connected
 * with, and your own. Row-level security lets a reader see a Public entry only
 * when they are connected with its writer (20260929100200); the filter below
 * also drops the household's own Public entries whose writer you are not
 * connected with -- the household can see those anyway, but in Household,
 * not here. Names come from my_connections(), which gives one only for a
 * connection both people accepted. */
export async function getPublicFeed(personId: string, familyId: string): Promise<PublicFeedEntry[]> {
  const supabase = await createClient();
  const [{ data }, { data: connections }] = await Promise.all([
    supabase
      .from("journal_entries")
      .select(`id, title, note, entry_date, milestone, family_id, owner_person_id, journal_entry_media(journal_media(id, storage_path, storage_provider, drive_file_id, owner_person_id))`)
      .not("public_at", "is", null)
      .order("entry_date", { ascending: false })
      .limit(200),
    supabase.rpc("my_connections"),
  ]);
  const names = new Map((connections ?? []).filter((c) => c.status === "accepted").map((c) => [c.person_id, c.full_name ?? "Someone"]));
  const rows = (data ?? []).filter((r) => r.owner_person_id === personId || (r.owner_person_id && names.has(r.owner_person_id)));
  const [photosOf, videos] = await Promise.all([publicPhotos(rows, familyId), getEntryVideos(rows.map((r) => r.id))]);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    note: r.note,
    entryDate: r.entry_date,
    milestone: r.milestone,
    author: r.owner_person_id === personId ? "You" : (names.get(r.owner_person_id as string) ?? "Someone"),
    mine: r.owner_person_id === personId,
    photos: photosOf(r),
    video: videos.get(r.id) ?? null,
  }));
}
