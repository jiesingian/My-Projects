import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getValidDriveAccessToken,
  ensureDriveFolderStructure,
  ensureNamedSubfolder,
  ensureProfilePhotoFolder,
  createResumableUploadSession,
} from "@/lib/google-drive";

type SessionRequest = {
  kind: "journal" | "document" | "avatar" | "family_background" | "recipe" | "routine" | "chat";
  fileName: string;
  mimeType: string;
  fileSize: number;
  folderId?: string;
};

/** What each upload kind will accept, checked here because the client's
 * `accept=` attribute on <input type=file> is cosmetic only — a request
 * built by hand or from devtools can claim any mimeType and any size, and
 * this session is the last point before a Drive/Storage upload URL is
 * handed out. */
const UPLOAD_LIMITS: Record<SessionRequest["kind"], { types: RegExp; maxBytes: number; label: string }> = {
  journal: { types: /^(image|video)\//, maxBytes: 200 * 1024 * 1024, label: "a photo or video, up to 200MB" },
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
  const { kind, fileName, mimeType, fileSize, folderId } = body;
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

  // Dish photos stay in Storage: the app reads them back on every meal card,
  // and a signed Storage URL renders in an <img> where a Drive link does not.
  if (kind === "recipe") {
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
  if (kind === "chat") {
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

  const bucket = kind === "journal" ? "journal" : kind === "avatar" || kind === "family_background" ? "avatars" : "documents";
  const prefix =
    kind === "journal" || kind === "avatar" || kind === "family_background" ? me.family_id : `${me.family_id}/${folderId}`;
  const path = `${prefix}/${Date.now()}-${fileName}`;
  return NextResponse.json({ provider: "supabase", bucket, path });
}
