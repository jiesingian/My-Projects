import { createAdminClient } from "@/lib/supabase/admin";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveFile = { id: string; webViewLink?: string; thumbnailLink?: string };

/** Reads the household's stored Drive token, refreshing it first if it's
 * expired. Returns null if Drive isn't connected or refresh fails — callers
 * should fall back to Supabase Storage in that case, never throw. */
export async function getValidDriveAccessToken(familyId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: token } = await admin.from("drive_tokens").select("*").eq("family_id", familyId).maybeSingle();
  if (!token) return null;

  const expiresAt = token.token_expires_at ? new Date(token.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return token.access_token;

  if (!token.refresh_token) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const refreshed = (await res.json()) as { access_token: string; expires_in: number };

  await admin.from("drive_tokens").update({
    access_token: refreshed.access_token,
    token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("family_id", familyId);

  return refreshed.access_token;
}

async function driveFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  });
}

async function createFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFile> {
  const res = await driveFetch(accessToken, "/files?fields=id,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined }),
  });
  if (!res.ok) throw new Error(`Drive folder creation failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Ensures the household's root Drive folder and its doc-category subfolders
 * exist, creating whatever's missing. Safe to call repeatedly. */
export async function ensureDriveFolderStructure(
  familyId: string,
  accessToken: string,
  householdName: string,
): Promise<{ rootFolderId: string; rootFolderLink?: string }> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin client unavailable");

  const { data: link } = await supabase.from("drive_links").select("*").eq("family_id", familyId).maybeSingle();

  let rootFolderId = link?.root_folder_id ?? undefined;
  let rootFolderLink = link?.root_folder_link ?? undefined;
  if (!rootFolderId) {
    const root = await createFolder(accessToken, `Kin — ${householdName}`);
    rootFolderId = root.id;
    rootFolderLink = root.webViewLink;
    await supabase.from("drive_links").update({ root_folder_id: rootFolderId, root_folder_link: rootFolderLink }).eq("family_id", familyId);
  }

  const { data: docFolders } = await supabase.from("doc_folders").select("id, name, drive_folder_id").eq("family_id", familyId);
  for (const folder of docFolders ?? []) {
    if (folder.drive_folder_id) continue;
    const created = await createFolder(accessToken, folder.name, rootFolderId);
    await supabase.from("doc_folders").update({ drive_folder_id: created.id }).eq("id", folder.id);
  }

  return { rootFolderId, rootFolderLink };
}

/** Gets (creating if needed) the Drive folder id for a named top-level
 * subfolder under the household's root — used for Journal and Trips, which
 * aren't rows in doc_folders. Cheap: lists children by name before creating. */
export async function ensureNamedSubfolder(accessToken: string, rootFolderId: string, name: string): Promise<string> {
  const q = encodeURIComponent(`'${rootFolderId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
  const res = await driveFetch(accessToken, `/files?q=${q}&fields=files(id)`);
  if (res.ok) {
    const data = (await res.json()) as { files: { id: string }[] };
    if (data.files?.[0]) return data.files[0].id;
  }
  const created = await createFolder(accessToken, name, rootFolderId);
  return created.id;
}

/** Opens a Drive resumable-upload session and returns the one-time session
 * URL the browser can PUT the file bytes to directly — the file itself never
 * passes through our server, so it isn't subject to Vercel's request body
 * limit. `fields` on the initial call carries through to the final response
 * the browser gets back after the PUT completes.
 *
 * Drive only allows cross-origin PUTs to the session URL from the exact
 * Origin that was present when the session was created — since this call
 * itself runs server-side (no browser Origin header of its own), we pass
 * the app's origin explicitly so the browser's follow-up PUT is allowed. */
export async function createResumableUploadSession(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  origin: string,
): Promise<string> {
  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,webViewLink,thumbnailLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType || "application/octet-stream",
      Origin: origin,
    },
    body: JSON.stringify({ name: fileName, parents: [folderId] }),
  });
  if (!res.ok) throw new Error(`Drive session creation failed: ${res.status} ${await res.text()}`);
  const location = res.headers.get("Location");
  if (!location) throw new Error("Drive did not return an upload session URL");
  return location;
}

/** Streams a Drive file's bytes, using the household's own access token —
 * lets us serve inline previews under our own domain regardless of the
 * file's Drive sharing settings (the drive.file scope only lets us read
 * files this app created, which is exactly what we're previewing). */
export async function fetchDriveFile(accessToken: string, fileId: string): Promise<Response> {
  return driveFetch(accessToken, `/files/${fileId}?alt=media`);
}

/** Used to roll back an upload that succeeded on Drive's side but never got
 * indexed in our own tables, and to actually delete a file when the user
 * deletes it in the app. Returns whether Drive actually deleted it — the
 * drive.file scope only grants write access to files this app created, so
 * this reliably fails (403) for a file someone added directly in Drive and
 * the app only ever discovered via the read-only sync. Callers must check
 * this rather than assume success, since a false failure here otherwise
 * gets silently undone the moment the next sync re-imports the file. */
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<boolean> {
  const res = await driveFetch(accessToken, `/files/${fileId}`, { method: "DELETE" });
  return res.ok || res.status === 404;
}

export type DriveFolderFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
};

/** Lists files still actually present (not trashed) directly under a Drive
 * folder — used to reconcile our own index both ways: dropping rows for
 * files someone deleted straight from Drive, and picking up files someone
 * added straight to Drive that the app never uploaded itself. Requires the
 * drive.readonly scope to see files this app didn't create. */
export async function listDriveFolderFiles(accessToken: string, folderId: string): Promise<DriveFolderFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await driveFetch(accessToken, `/files?q=${q}&fields=files(id,name,mimeType,webViewLink,thumbnailLink,createdTime)&pageSize=1000`);
  if (!res.ok) throw new Error(`Drive list failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { files: DriveFolderFile[] };
  return data.files;
}
