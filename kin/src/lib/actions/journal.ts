"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember, type CurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { getValidDriveAccessToken, ensureDriveFolderStructure, ensureNamedSubfolder, uploadFileToDrive } from "@/lib/google-drive";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Resolves a Drive access token + the household's "Journal" Drive folder,
 * if Drive is connected — null token means callers should fall back to
 * Supabase Storage. */
async function resolveJournalDriveFolder(me: CurrentMember): Promise<{ token: string; folderId: string } | null> {
  const token = await getValidDriveAccessToken(me.family_id);
  if (!token) return null;
  try {
    const { rootFolderId } = await ensureDriveFolderStructure(me.family_id, token, me.families.name);
    const folderId = await ensureNamedSubfolder(token, rootFolderId, "Journal");
    return { token, folderId };
  } catch {
    return null;
  }
}

async function uploadJournalMedia(
  supabase: SupabaseClient<Database>,
  me: CurrentMember,
  file: File,
  takenAt: string,
  drive: { token: string; folderId: string } | null,
) {
  const mediaType = file.type.startsWith("video") ? "video" : "photo";

  if (drive) {
    try {
      const uploaded = await uploadFileToDrive(drive.token, drive.folderId, file);
      const { data } = await supabase
        .from("journal_media")
        .insert({
          family_id: me.family_id,
          media_type: mediaType,
          taken_at: takenAt,
          uploaded_by: me.id,
          storage_provider: "google_drive",
          drive_file_id: uploaded.id,
          drive_view_link: uploaded.webViewLink ?? null,
          drive_thumbnail_link: uploaded.thumbnailLink ?? null,
        })
        .select()
        .single();
      return data;
    } catch {
      // Fall through to Supabase Storage below.
    }
  }

  const path = `${me.family_id}/${Date.now()}-${file.name}`;
  const { error: uploadErr } = await supabase.storage.from("journal").upload(path, file, { contentType: file.type || undefined });
  if (uploadErr) return null;
  const { data } = await supabase
    .from("journal_media")
    .insert({ family_id: me.family_id, storage_path: path, storage_provider: "supabase", media_type: mediaType, taken_at: takenAt, uploaded_by: me.id })
    .select()
    .single();
  return data;
}

export async function uploadGalleryPhotosAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one photo or video." };

  const drive = await resolveJournalDriveFolder(me);
  const today = new Date().toISOString().slice(0, 10);
  for (const file of files) {
    const media = await uploadJournalMedia(supabase, me, file, today, drive);
    if (!media) return { error: `"${file.name}" failed to upload.` };
  }

  revalidatePath("/journal");
  return { error: null };
}

export async function createJournalEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const note = String(formData.get("note") ?? "").trim() || null;
  const people = formData.getAll("people").map(String);
  if (!title) return { error: "Give the entry a title." };

  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert({ family_id: me.family_id, entry_date: date, title, note, source: "manual", created_by: me.id })
    .select()
    .single();
  if (error) return { error: error.message };

  if (people.length > 0) {
    await supabase.from("journal_entry_people").insert(people.map((memberId) => ({ entry_id: entry.id, member_id: memberId })));
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const drive = files.length > 0 ? await resolveJournalDriveFolder(me) : null;
  let order = 0;
  for (const file of files) {
    const media = await uploadJournalMedia(supabase, me, file, date, drive);
    if (media) {
      await supabase.from("journal_entry_media").insert({ entry_id: entry.id, media_id: media.id, sort_order: order++ });
    }
  }

  revalidatePath("/journal");
  redirect("/journal?seg=entries");
}

export async function createMilestoneAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
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
