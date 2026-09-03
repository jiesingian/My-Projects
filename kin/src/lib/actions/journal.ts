"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { getValidDriveAccessToken, deleteDriveFile, ensureDriveFolderStructure, ensureNamedSubfolder } from "@/lib/google-drive";

type UploadedFile =
  | { provider: "google_drive"; driveFileId: string; driveViewLink: string | null; driveThumbnailLink: string | null }
  | { provider: "supabase"; storagePath: string };

export async function createJournalEntryAction(input: {
  title: string;
  date: string;
  note: string | null;
  people: string[];
}): Promise<{ error: string | null; entryId?: string }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = input.title.trim();
  if (!title) return { error: "Give the entry a title." };

  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert({ family_id: me.family_id, entry_date: input.date, title, note: input.note, source: "manual", created_by: me.id })
    .select()
    .single();
  if (error) return { error: error.message };

  if (input.people.length > 0) {
    await supabase.from("journal_entry_people").insert(input.people.map((memberId) => ({ entry_id: entry.id, member_id: memberId })));
  }

  return { error: null, entryId: entry.id };
}

/** Records a file the client already uploaded directly to Drive or Supabase
 * Storage (see uploadFileDirect) — this call only ever carries small JSON,
 * never the file itself, so it isn't subject to any request body limit. */
export async function attachJournalMediaAction(input: {
  entryId?: string;
  mediaType: "photo" | "video";
  takenAt: string;
  sortOrder?: number;
  uploaded: UploadedFile;
}): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: media, error } = await supabase
    .from("journal_media")
    .insert(
      input.uploaded.provider === "google_drive"
        ? {
            family_id: me.family_id,
            media_type: input.mediaType,
            taken_at: input.takenAt,
            uploaded_by: me.id,
            storage_provider: "google_drive",
            drive_file_id: input.uploaded.driveFileId,
            drive_view_link: input.uploaded.driveViewLink,
            drive_thumbnail_link: input.uploaded.driveThumbnailLink,
          }
        : {
            family_id: me.family_id,
            media_type: input.mediaType,
            taken_at: input.takenAt,
            uploaded_by: me.id,
            storage_provider: "supabase",
            storage_path: input.uploaded.storagePath,
          },
    )
    .select()
    .single();
  if (error) return { error: error.message };

  if (input.entryId) {
    await supabase.from("journal_entry_media").insert({ entry_id: input.entryId, media_id: media.id, sort_order: input.sortOrder ?? 0 });
  }

  revalidatePath("/journal");
  return { error: null };
}

/** Deletes a gallery/entry photo or video — from wherever it's actually
 * stored (Drive or Supabase Storage) as well as our own index. Cascades to
 * journal_entry_media automatically, so this removes it from any entry it
 * was attached to as well. */
export async function deleteJournalMediaAction(mediaId: string): Promise<{ error: string | null; driveFolderLink?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: media } = await supabase
    .from("journal_media")
    .select("storage_provider, storage_path, drive_file_id")
    .eq("id", mediaId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!media) return { error: "Not found." };

  if (media.storage_provider === "supabase" && media.storage_path) {
    await supabase.storage.from("journal").remove([media.storage_path]);
  } else if (media.storage_provider === "google_drive" && media.drive_file_id) {
    const token = await getValidDriveAccessToken(me.family_id);
    const deleted = token ? await deleteDriveFile(token, media.drive_file_id).catch(() => false) : false;
    if (!deleted) {
      let driveFolderLink: string | null = null;
      if (token) {
        try {
          const { rootFolderId } = await ensureDriveFolderStructure(me.family_id, token, me.families.name);
          const folderId = await ensureNamedSubfolder(token, rootFolderId, "Journal");
          driveFolderLink = `https://drive.google.com/drive/folders/${folderId}`;
        } catch {
          driveFolderLink = null;
        }
      }
      return {
        error: "Kin can only delete files it uploaded itself — this one was added directly in Drive.",
        driveFolderLink,
      };
    }
  }

  const { error } = await supabase.from("journal_media").delete().eq("id", mediaId);
  if (error) return { error: error.message };

  revalidatePath("/journal");
  return { error: null };
}

export async function createMilestoneAction(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const memberId = String(formData.get("member_id") ?? "") || null;
  if (!title) return { error: "Give the milestone a title." };

  const { error } = await supabase.from("milestones").insert({
    family_id: me.family_id,
    member_id: memberId,
    milestone_date: date,
    title,
    created_by: me.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/journal");
  return { error: null };
}
