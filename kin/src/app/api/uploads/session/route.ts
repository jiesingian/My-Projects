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
  kind: "journal" | "document" | "avatar" | "family_background";
  fileName: string;
  mimeType: string;
  folderId?: string;
};

/** Issues the "permission slip" a client needs to upload one file directly
 * to its final destination (Google Drive or Supabase Storage) — the file
 * bytes never pass through this server, so they aren't subject to Vercel's
 * request body size limit. */
export async function POST(request: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json()) as SessionRequest;
  const { kind, fileName, mimeType, folderId } = body;
  if (!fileName || (kind === "document" && !folderId)) {
    return NextResponse.json({ error: "Missing fileName or folderId." }, { status: 400 });
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
    } catch {
      // Falls through to the Supabase Storage session below.
    }
  }

  const bucket = kind === "journal" ? "journal" : kind === "avatar" || kind === "family_background" ? "avatars" : "documents";
  const prefix =
    kind === "journal" || kind === "avatar" || kind === "family_background" ? me.family_id : `${me.family_id}/${folderId}`;
  const path = `${prefix}/${Date.now()}-${fileName}`;
  return NextResponse.json({ provider: "supabase", bucket, path });
}
