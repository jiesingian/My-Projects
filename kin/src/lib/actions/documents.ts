"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { getValidDriveAccessToken, deleteDriveFile } from "@/lib/google-drive";
import { pushNewRowToCalendar } from "@/lib/actions/calendar-sync";

type UploadedFile =
  | { provider: "google_drive"; driveFileId: string; driveViewLink: string | null; driveThumbnailLink: string | null }
  | { provider: "supabase"; storagePath: string };

export async function createDocEntryAction(input: {
  title: string;
  folderId: string;
  newFolderName: string | null;
  ownerMemberId: string | null;
  expiresAt: string | null;
  docType: string | null;
  referenceNo: string | null;
  visibility: string;
  note: string | null;
}): Promise<{ error: string | null; entryId?: string; folderId?: string }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = input.title.trim();
  if (!title) return { error: "Give the entry a title." };

  let folderId = input.folderId;
  if (folderId === "__new__" && input.newFolderName) {
    const { data: folder, error: folderErr } = await supabase
      .from("doc_folders")
      .insert({ family_id: me.family_id, name: input.newFolderName.trim() })
      .select()
      .single();
    if (folderErr) return { error: folderErr.message };
    folderId = folder.id;
  }
  if (!folderId || folderId === "__new__") return { error: "Choose or name a folder." };
  revalidatePath("/family");

  const { data: entry, error: entryErr } = await supabase
    .from("doc_entries")
    .insert({
      family_id: me.family_id,
      folder_id: folderId,
      title,
      owner_member_id: input.ownerMemberId,
      expires_at: input.expiresAt,
      doc_type: input.docType,
      reference_no: input.referenceNo,
      visibility: input.visibility,
      note: input.note,
      created_by: me.id,
    })
    .select()
    .single();
  if (entryErr) return { error: entryErr.message };

  if (input.expiresAt) {
    await pushNewRowToCalendar(me.family_id, "doc_entries", entry.id, {
      title: `${title} renewal`,
      startAt: new Date(`${input.expiresAt}T00:00:00`),
      allDay: true,
    });
  }

  return { error: null, entryId: entry.id, folderId };
}

/** Records a file the client already uploaded directly to Drive or Supabase
 * Storage (see uploadFileDirect) — this call only ever carries small JSON,
 * never the file itself, so it isn't subject to any request body limit. */
export async function attachDocFileAction(input: {
  entryId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  uploaded: UploadedFile;
}): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase.from("doc_files").insert(
    input.uploaded.provider === "google_drive"
      ? {
          entry_id: input.entryId,
          family_id: me.family_id,
          file_name: input.fileName,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
          storage_provider: "google_drive",
          drive_file_id: input.uploaded.driveFileId,
          drive_view_link: input.uploaded.driveViewLink,
          drive_thumbnail_link: input.uploaded.driveThumbnailLink,
          created_by: me.id,
        }
      : {
          entry_id: input.entryId,
          family_id: me.family_id,
          file_name: input.fileName,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
          storage_provider: "supabase",
          storage_path: input.uploaded.storagePath,
          created_by: me.id,
        },
  );
  if (error) return { error: `"${input.fileName}" saved to storage but failed to index: ${error.message}` };

  revalidatePath("/family");
  return { error: null };
}

export async function getDocFileUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 5);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteDocFileAction(fileId: string, folderId: string): Promise<{ error: string | null; driveFolderLink?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: file } = await supabase.from("doc_files").select("storage_path, storage_provider, drive_file_id").eq("id", fileId).maybeSingle();
  if (!file) return { error: "Not found." };

  if (file.storage_provider === "supabase" && file.storage_path) {
    await supabase.storage.from("documents").remove([file.storage_path]);
  } else if (file.storage_provider === "google_drive" && file.drive_file_id) {
    const token = await getValidDriveAccessToken(me.family_id);
    const deleted = token ? await deleteDriveFile(token, file.drive_file_id).catch(() => false) : false;
    if (!deleted) {
      const { data: docFolder } = await supabase.from("doc_folders").select("drive_folder_id").eq("id", folderId).maybeSingle();
      return {
        error: "Kin can only delete files it uploaded itself — this one was added directly in Drive.",
        driveFolderLink: docFolder?.drive_folder_id ? `https://drive.google.com/drive/folders/${docFolder.drive_folder_id}` : null,
      };
    }
  }

  const { error } = await supabase.from("doc_files").delete().eq("id", fileId);
  if (error) return { error: error.message };

  revalidatePath(`/family/documents/${folderId}`);
  return { error: null };
}
