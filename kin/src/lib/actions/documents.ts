"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { getValidDriveAccessToken, deleteDriveFile } from "@/lib/google-drive";
import { syncRowToCalendars, removeRowFromCalendars } from "@/lib/actions/calendar-sync";
import { allDayEvent } from "@/lib/calendar-shape";
import { explainVisibilityRefusal } from "@/lib/visibility";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";

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

  const title = clamp(input.title, 150);
  if (!title) return { error: "Give the entry a title." };

  let folderId = input.folderId;
  if (folderId === "__new__" && input.newFolderName) {
    const { data: folder, error: folderErr } = await supabase
      .from("doc_folders")
      .insert({ family_id: me.family_id, name: clamp(input.newFolderName, 100) })
      .select()
      .single();
    if (folderErr) return { error: folderErr.message };
    folderId = folder.id;
  }
  if (!folderId || folderId === "__new__") return { error: "Choose or name a folder." };

  const { data: entry, error: entryErr } = await supabase
    .from("doc_entries")
    .insert({
      family_id: me.family_id,
      folder_id: folderId,
      title,
      owner_member_id: input.ownerMemberId,
      expires_at: input.expiresAt,
      doc_type: input.docType && clamp(input.docType, 50),
      reference_no: input.referenceNo && clamp(input.referenceNo, 100),
      visibility: input.visibility,
      note: input.note && clamp(input.note, 1000),
      created_by: me.id,
    })
    .select()
    .single();
  // Same as in health.ts: a "parents" entry from someone who is not a parent
  // is refused at the RETURNING and rolls back, and the policy's own wording
  // is not something a person can act on.
  if (entryErr) return { error: explainVisibilityRefusal(entryErr.message) };

  if (input.expiresAt) {
    await syncRowToCalendars(
      me.family_id,
      "doc_entries",
      entry.id,
      allDayEvent(`${title} renewal`, input.expiresAt),
      { kind: "member", memberId: input.ownerMemberId },
    );
  }

  revalidatePath("/family");
  return { error: null, entryId: entry.id, folderId };
}

export async function updateDocEntryAction(input: {
  entryId: string;
  folderId: string;
  title: string;
  ownerMemberId: string | null;
  expiresAt: string | null;
  docType: string | null;
  referenceNo: string | null;
  visibility: string;
  note: string | null;
}): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = clamp(input.title, 150);
  if (!title) return { error: "Give the entry a title." };

  const { error, count } = await supabase
    .from("doc_entries")
    .update({
      title,
      owner_member_id: input.ownerMemberId,
      expires_at: input.expiresAt,
      doc_type: input.docType && clamp(input.docType, 50),
      reference_no: input.referenceNo && clamp(input.referenceNo, 100),
      visibility: input.visibility,
      note: input.note && clamp(input.note, 1000),
    }, { count: "exact" })
    .eq("id", input.entryId)
    .eq("family_id", me.family_id);
  // Same as at creation: a "parents" visibility from someone who is not a
  // parent is refused at the RETURNING and rolls back.
  if (error) return { error: explainVisibilityRefusal(error.message) };
  if (count === 0) return { error: "That document entry is no longer there — someone may have removed it." };

  if (input.expiresAt) {
    await syncRowToCalendars(
      me.family_id,
      "doc_entries",
      input.entryId,
      allDayEvent(`${title} renewal`, input.expiresAt),
      { kind: "member", memberId: input.ownerMemberId },
    );
  } else {
    // The expiry (and the reminder it drove) was cleared -- nothing left to
    // remind about, so the calendar side comes off too rather than sitting
    // there pointing at a date the entry no longer has.
    await removeRowFromCalendars(me.family_id, "doc_entries", input.entryId);
  }

  revalidatePath(`/family/documents/${input.folderId}`);
  return { error: null };
}

/** Refuses while any file is still attached rather than guessing what should
 * happen to them -- the same per-provider cleanup deleteDocFileAction does
 * for one file would need repeating here for however many are left, and
 * silently dropping the file rows would leak their storage. Delete the
 * files first; an entry with none left is then just a row. */
export async function deleteDocEntryAction(entryId: string, folderId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { count } = await supabase.from("doc_files").select("id", { count: "exact", head: true }).eq("entry_id", entryId);
  if (count && count > 0) return { error: "Remove its files first, then this entry can be deleted." };

  const { error } = await supabase.from("doc_entries").delete().eq("id", entryId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };

  await removeRowFromCalendars(me.family_id, "doc_entries", entryId);
  revalidatePath(`/family/documents/${folderId}`);
  return { error: null };
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
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: file } = await supabase.from("doc_files").select("id").eq("storage_path", path).eq("family_id", me.family_id).maybeSingle();
  if (!file) return null;
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 5);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteDocFileAction(fileId: string, folderId: string): Promise<{ error: string | null; driveFolderLink?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("doc_files")
    .select("storage_path, storage_provider, drive_file_id")
    .eq("id", fileId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!file) return { error: "Not found." };

  if (file.storage_provider === "supabase" && file.storage_path) {
    const { error: removeError } = await supabase.storage.from("documents").remove([file.storage_path]);
    if (removeError) console.error(`Document ${file.storage_path} was left in storage after its record was deleted`, removeError.message);
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

  const { error } = await supabase.from("doc_files").delete().eq("id", fileId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath(`/family/documents/${folderId}`);
  return { error: null };
}
