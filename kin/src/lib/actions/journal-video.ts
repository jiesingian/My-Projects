"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";

const LOOKS = new Set(["warm", "classic", "lively"]);

/** Keeps a video made in the browser (see lib/video-maker) as the entry's
 * cover. The file and its poster are already in Storage -- uploaded straight
 * from the phone, like every photo -- so this only records where they are.
 *
 * One video per entry: making another replaces it, and the old files are
 * removed first so they stop counting against the household's storage. The
 * database checks the rest (20261006100500): the entry is this household's,
 * and the files sit in its folder or the maker's own. */
export async function saveEntryVideoAction(input: {
  entryId: string;
  videoPath: string;
  posterPath: string;
  mimeType: string;
  width: number;
  height: number;
  durationSeconds: number;
  look: string;
}): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("journal_entries")
    .select("id, visibility")
    .eq("id", input.entryId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!entry) return { error: "That entry is no longer there." };

  // Where uploadFileDirect("journal_video") put them, and nowhere else.
  const folder = entry.visibility === "personal" ? `person/${me.person_id}/videos/` : `${me.family_id}/videos/`;
  if (!input.videoPath.startsWith(folder) || !input.posterPath.startsWith(folder)) {
    return { error: "That video doesn't belong to this entry." };
  }
  const mimeType = input.mimeType.split(";")[0].trim();
  if (!/^video\/[\w.+-]+$/.test(mimeType)) return { error: "That isn't a video." };

  const { data: old } = await supabase.from("journal_entry_videos").select("storage_path, poster_path").eq("entry_id", input.entryId).maybeSingle();

  const { error } = await supabase.from("journal_entry_videos").upsert({
    entry_id: input.entryId,
    family_id: me.family_id,
    storage_path: input.videoPath,
    poster_path: input.posterPath,
    mime_type: mimeType,
    width: Math.round(input.width),
    height: Math.round(input.height),
    duration_seconds: Math.round(input.durationSeconds * 10) / 10,
    look: LOOKS.has(input.look) ? input.look : "warm",
    created_by: me.id,
  });
  if (error) return { error: humanDatabaseError(error.message) };

  // The old files go once the new video is safely recorded, never before: a
  // failed save keeps the video the entry already had. Deleting them can be
  // refused only for a video kept in someone else's own folder, which the
  // household may no longer reach once the row has moved on; that is logged.
  if (old && old.storage_path !== input.videoPath) {
    const { error: removeError } = await supabase.storage.from("journal").remove([old.storage_path, old.poster_path]);
    if (removeError) console.error(`The replaced video of entry ${input.entryId} was left in storage`, removeError.message);
  }

  revalidatePath("/journal");
  revalidatePath(`/journal/${input.entryId}`);
  return { error: null };
}

/** Takes the video off the entry and out of storage. The photos stay. */
export async function removeEntryVideoAction(entryId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  await removeFilesOf(supabase, entryId);
  const { error } = await supabase.from("journal_entry_videos").delete().eq("entry_id", entryId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/journal");
  revalidatePath(`/journal/${entryId}`);
  return { error: null };
}

/** The files first, while the row still points at them: the storage policy
 * that lets the household delete a video kept in its maker's folder goes by
 * that row. Best effort -- a file left behind is logged, not shown. */
async function removeFilesOf(supabase: Awaited<ReturnType<typeof createClient>>, entryId: string) {
  const { data: old } = await supabase.from("journal_entry_videos").select("storage_path, poster_path").eq("entry_id", entryId).maybeSingle();
  if (!old) return;
  const { error } = await supabase.storage.from("journal").remove([old.storage_path, old.poster_path]);
  if (error) console.error(`Entry video files for ${entryId} were left in storage`, error.message);
}
