"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";

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
