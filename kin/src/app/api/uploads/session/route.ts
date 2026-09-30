import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readAccess, FREE_STORAGE_BYTES, PLUS_STORAGE_BYTES } from "@/lib/access";
import { HIGHLIGHT_PHOTO_BYTES, HIGHLIGHT_VIDEO_BYTES } from "@/lib/highlights";
import {
  getValidDriveAccessToken,
  ensureDriveFolderStructure,
  ensureNamedSubfolder,
  ensureProfilePhotoFolder,
  createResumableUploadSession,
} from "@/lib/google-drive";

type SessionRequest = {
  kind: "journal" | "journal_personal" | "journal_video" | "document" | "avatar" | "family_background" | "recipe" | "routine" | "chat" | "highlight";
  fileName: string;
  mimeType: string;
  fileSize: number;
  folderId?: string;
  /** journal_video only: the entry is Just me, so its video goes in the
   * person's own folder rather than the household's. */
  personal?: boolean;
};

/** What each upload kind will accept, checked here because the client's
 * `accept=` attribute on <input type=file> is cosmetic only — a request
 * built by hand or from devtools can claim any mimeType and any size, and
 * this session is the last point before a Drive/Storage upload URL is
 * handed out. */
const UPLOAD_LIMITS: Record<SessionRequest["kind"], { types: RegExp; maxBytes: number; label: string }> = {
  // A highlight lasts a day, so it is kept small: a photo, or a video of up
  // to 30 seconds (the app checks the length before asking). Photos are
  // held to 15 MB below.
  highlight: { types: /^(image|video)\//, maxBytes: HIGHLIGHT_VIDEO_BYTES, label: "a photo up to 15MB or a video up to 25MB" },
  journal: { types: /^(image|video)\//, maxBytes: 200 * 1024 * 1024, label: "a photo or video, up to 200MB" },
  journal_personal: { types: /^(image|video)\//, maxBytes: 200 * 1024 * 1024, label: "a photo or video, up to 200MB" },
  // A video made in Kin from an entry's photos, and its poster (a JPEG of the
  // title card). A minute at 720p comes to about 20MB; 80MB leaves room for a
  // phone whose encoder ignores the bitrate it was asked for.
  journal_video: { types: /^(video\/|image\/jpeg$)/, maxBytes: 80 * 1024 * 1024, label: "a video up to 80MB, or its JPEG poster" },
  recipe: { types: /^image\//, maxBytes: 15 * 1024 * 1024, label: "a photo, up to 15MB" },
  avatar: { types: /^image\//, maxBytes: 15 * 1024 * 1024, label: "a photo, up to 15MB" },
  family_background: { types: /^image\//, maxBytes: 15 * 1024 * 1024, label: "a photo, up to 15MB" },
  document: {
    types: /^(image\/|application\/pdf$|application\/vnd\.openxmlformats-officedocument\.|application\/msword$|application\/vnd\.ms-excel$|application\/vnd\.ms-powerpoint$)/,
    maxBytes: 25 * 1024 * 1024,
    label: "a photo, PDF, or office document, up to 25MB",
  },
  routine: {
    types: /^(image\/|application\/pdf$|application\/vnd\.openxmlformats-officedocument\.|application\/msword$|application\/vnd\.ms-excel$|application\/vnd\.ms-powerpoint$)/,
    maxBytes: 25 * 1024 * 1024,
    label: "a photo, PDF, or office document, up to 25MB",
  },
  // What a household actually sends each other: a photo, a short clip, a
  // voice note, a PDF of the school letter. Video is allowed here and not on tasks because
  // "look at this" is half of what a family thread is for.
  chat: {
    types: /^(image\/|video\/|audio\/|application\/pdf$|application\/vnd\.openxmlformats-officedocument\.|application\/msword$|application\/vnd\.ms-excel$|application\/vnd\.ms-powerpoint$)/,
    maxBytes: 50 * 1024 * 1024,
    label: "a photo, video, voice note, PDF, or office document, up to 50MB",
  },
};

/** Issues the "permission slip" a client needs to upload one file directly
 * to its final destination (Google Drive or Supabase Storage) — the file
 * bytes never pass through this server, so they aren't subject to Vercel's
 * request body size limit. */
export async function POST(request: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json()) as SessionRequest;
  const { kind, fileName, mimeType, fileSize, folderId, personal } = body;
  if (!fileName || (kind === "document" && !folderId)) {
    return NextResponse.json({ error: "Missing fileName or folderId." }, { status: 400 });
  }

  const limit = UPLOAD_LIMITS[kind];
  if (!limit) return NextResponse.json({ error: "Unrecognised upload kind." }, { status: 400 });
  if (!mimeType || !limit.types.test(mimeType)) {
    return NextResponse.json({ error: `That file type isn't accepted here — expected ${limit.label}.` }, { status: 400 });
  }
  if (typeof fileSize !== "number" || !(fileSize > 0)) {
    return NextResponse.json({ error: "Missing or invalid file size." }, { status: 400 });
  }
  if (fileSize > limit.maxBytes) {
    return NextResponse.json({ error: `That file is too large — the limit here is ${limit.label}.` }, { status: 400 });
  }

  // Kin's own storage has a size per household: 1 GB on Kin Free, 50 GB on
  // Kin Plus (20260928150000_kin_free_and_plus.sql). Only files headed for
  // Kin's storage count -- a household's Google Drive is its own. Asked once,
  // and only on the paths that end in Storage. If the count can't be read the
  // upload goes ahead: a stuck photo is worse than an uncounted one.
  const storageRefusal = async (): Promise<NextResponse | null> => {
    const supabase = await createClient();
    const { data: used, error } = await supabase.rpc("family_storage_bytes");
    if (error || typeof used !== "number") {
      if (error) console.error("family_storage_bytes failed; allowing the upload", error.message);
      return null;
    }
    const plus = readAccess(me.families).plus;
    const cap = plus ? PLUS_STORAGE_BYTES : FREE_STORAGE_BYTES;
    if (used + fileSize <= cap) return null;
    return NextResponse.json(
      {
        error: plus
          ? "Your household has used its 50 GB of Kin storage. Connect Google Drive in Settings → Connected apps to keep adding photos there."
          : "Your household has used the 1 GB of storage in Kin Free. Kin Plus has 50 GB, or connect Google Drive in Settings → Connected apps and photos go there instead.",
      },
      { status: 413 },
    );
  };

  // A photo on a personal journal entry ("Just me"): Kin's storage, under the
  // person's own folder, never the household's Drive or folder -- nobody else
  // in the household can read it (20260928185000_people_and_personal_space).
  if (kind === "journal_personal") {
    const refused = await storageRefusal();
    if (refused) return refused;
    return NextResponse.json({
      provider: "supabase",
      bucket: "journal",
      path: `person/${me.person_id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${fileName}`,
    });
  }

  // A video made from an entry's photos: always Kin's storage, never Drive.
  // It plays inline in the journal and the Family feed, which a signed Storage
  // URL does in a <video> and a Drive link does not, and a linked household
  // has no Drive to fetch it from. Under the household's folder, or the
  // person's own for a Just-me entry; journal_entry_videos checks the same.
  if (kind === "journal_video") {
    const refused = await storageRefusal();
    if (refused) return refused;
    const safe = fileName.replace(/[^\w.-]+/g, "_").slice(-60);
    const folder = personal ? `person/${me.person_id}` : me.family_id;
    return NextResponse.json({
      provider: "supabase",
      bucket: "journal",
      path: `${folder}/videos/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`,
    });
  }

  // Dish photos stay in Storage: the app reads them back on every meal card,
  // and a signed Storage URL renders in an <img> where a Drive link does not.
  if (kind === "recipe") {
    const refused = await storageRefusal();
    if (refused) return refused;
    return NextResponse.json({
      provider: "supabase",
      bucket: "recipe-photos",
      path: `${me.family_id}/${Date.now()}-${fileName}`,
    });
  }

  // A task attachment has no Drive folder of its own the way a document
  // entry does (ensureDriveFolderStructure below resolves one per doc_folder,
  // and routines aren't folders) -- straight to Storage, same bucket as
  // documents.
  if (kind === "routine") {
    const refused = await storageRefusal();
    if (refused) return refused;
    return NextResponse.json({
      provider: "supabase",
      bucket: "documents",
      path: `${me.family_id}/routines/${Date.now()}-${fileName}`,
    });
  }

  // Chat files go straight to Storage and never to Drive. A thread renders
  // its photos inline on every visit, and a signed Storage URL works in an
  // <img> where a Drive link does not -- the same reason dish photos stay
  // here. The random segment keeps two photos picked in the same
  // millisecond, which a multi-select does, from landing on one path.
  // Highlights: Storage only, under the household's own folder, where the
  // documents bucket's policies keep them to the household. Gone in 24 hours
  // (20260929100100_highlights.sql).
  if (kind === "highlight") {
    if (mimeType.startsWith("image/") && fileSize > HIGHLIGHT_PHOTO_BYTES) {
      return NextResponse.json({ error: "That photo is too large for a highlight — the limit is 15MB." }, { status: 400 });
    }
    const refused = await storageRefusal();
    if (refused) return refused;
    return NextResponse.json({
      provider: "supabase",
      bucket: "documents",
      path: `${me.family_id}/highlights/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${fileName.replace(/[^\w.-]+/g, "_").slice(-80)}`,
    });
  }

  if (kind === "chat") {
    const refused = await storageRefusal();
    if (refused) return refused;
    return NextResponse.json({
      provider: "supabase",
      bucket: "documents",
      path: `${me.family_id}/chat/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${fileName}`,
    });
  }

  const driveToken = await getValidDriveAccessToken(me.family_id);
  if (driveToken) {
    try {
      const { rootFolderId } = await ensureDriveFolderStructure(me.family_id, driveToken, me.families.name);
      let targetFolderId: string;
      if (kind === "journal") {
        targetFolderId = await ensureNamedSubfolder(driveToken, rootFolderId, "Journal");
      } else if (kind === "avatar") {
        targetFolderId = await ensureProfilePhotoFolder(driveToken, rootFolderId, { kind: "member", memberId: me.id, fullName: me.full_name });
      } else if (kind === "family_background") {
        targetFolderId = await ensureProfilePhotoFolder(driveToken, rootFolderId, { kind: "household" });
      } else {
        const admin = createAdminClient();
        const { data: folder } = await admin!
          .from("doc_folders")
          .select("drive_folder_id")
          .eq("id", folderId!)
          .eq("family_id", me.family_id)
          .single();
        if (!folder?.drive_folder_id) throw new Error("Drive folder missing");
        targetFolderId = folder.drive_folder_id;
      }
      const origin = request.headers.get("origin") ?? new URL(request.url).origin;
      const uploadUrl = await createResumableUploadSession(driveToken, targetFolderId, fileName, mimeType, origin);
      return NextResponse.json({ provider: "google_drive", uploadUrl });
    } catch (err) {
      // Falls through to the Supabase Storage session below.
      console.error(`Drive upload session failed for kind=${kind}, falling back to Supabase:`, err);
    }
  }

  const refused = await storageRefusal();
  if (refused) return refused;

  const bucket = kind === "journal" ? "journal" : kind === "avatar" || kind === "family_background" ? "avatars" : "documents";
  const prefix =
    kind === "journal" || kind === "avatar" || kind === "family_background" ? me.family_id : `${me.family_id}/${folderId}`;
  const path = `${prefix}/${Date.now()}-${fileName}`;
  return NextResponse.json({ provider: "supabase", bucket, path });
}
