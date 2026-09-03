import { createClient } from "@/lib/supabase/client";

export type UploadedFile =
  | { provider: "google_drive"; driveFileId: string; driveViewLink: string | null; driveThumbnailLink: string | null }
  | { provider: "supabase"; storagePath: string };

/** Uploads one file straight to its final destination (Google Drive or
 * Supabase Storage), bypassing our own server entirely for the file bytes —
 * that's what lets this handle full-size photos despite Vercel's 4.5MB
 * request body cap on serverless functions. Call requestUploadSession()
 * first to get a destination, then pass its result in here. */
export async function uploadFileDirect(file: File, kind: "journal" | "document", folderId?: string): Promise<UploadedFile> {
  const sessionRes = await fetch("/api/uploads/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, fileName: file.name, mimeType: file.type, folderId }),
  });
  if (!sessionRes.ok) throw new Error("Couldn't start the upload — try again.");
  const session = await sessionRes.json();

  if (session.provider === "google_drive") {
    const putRes = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) throw new Error(`"${file.name}" failed to upload to Drive.`);
    const uploaded = await putRes.json();
    return {
      provider: "google_drive",
      driveFileId: uploaded.id,
      driveViewLink: uploaded.webViewLink ?? null,
      driveThumbnailLink: uploaded.thumbnailLink ?? null,
    };
  }

  const supabase = createClient();
  const { error } = await supabase.storage.from(session.bucket).upload(session.path, file, {
    contentType: file.type || undefined,
  });
  if (error) throw new Error(`"${file.name}" failed to upload: ${error.message}`);
  return { provider: "supabase", storagePath: session.path };
}

/** Cleans up a file that made it to Drive but never got indexed (the
 * metadata call right after it failed) — otherwise it'd sit there as an
 * orphan with no record of it anywhere in the app. Best effort. */
export async function rollbackUpload(uploaded: UploadedFile): Promise<void> {
  if (uploaded.provider !== "google_drive") return;
  await fetch(`/api/drive/file/${uploaded.driveFileId}`, { method: "DELETE" }).catch(() => {});
}
