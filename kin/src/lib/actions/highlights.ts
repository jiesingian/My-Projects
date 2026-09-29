"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { HIGHLIGHT_MAX_SECONDS, HIGHLIGHT_PHOTO_BYTES, HIGHLIGHT_VIDEO_BYTES } from "@/lib/highlights";

/** Posts a highlight whose file has already been uploaded (upload kind
 * "highlight"). The file's real size is read back from Storage rather than
 * taken from the phone, and one over the limit is removed, not posted. */
export async function createHighlightAction(input: {
  storagePath: string;
  mediaType: "image" | "video";
  durationSeconds?: number | null;
}): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const folder = `${me.family_id}/highlights/`;
  if (!input.storagePath.startsWith(folder) || input.storagePath.includes("..")) return { error: "That file doesn't belong to this household." };
  if (input.mediaType !== "image" && input.mediaType !== "video") return { error: "A highlight is a photo or a video." };

  const name = input.storagePath.slice(folder.length);
  const { data: listed } = await supabase.storage.from("documents").list(folder.slice(0, -1), { search: name, limit: 1 });
  const size = Number(listed?.find((f) => f.name === name)?.metadata?.size ?? NaN);
  const cap = input.mediaType === "image" ? HIGHLIGHT_PHOTO_BYTES : HIGHLIGHT_VIDEO_BYTES;
  const seconds = input.mediaType === "video" && input.durationSeconds ? Math.min(input.durationSeconds, HIGHLIGHT_MAX_SECONDS + 1) : null;
  if (!Number.isFinite(size) || size > cap || (input.durationSeconds ?? 0) > HIGHLIGHT_MAX_SECONDS + 0.5) {
    await supabase.storage.from("documents").remove([input.storagePath]);
    return { error: Number.isFinite(size) ? "That's too large for a highlight." : "The file didn't arrive. Try again." };
  }

  const { error } = await supabase.from("highlights").insert({
    family_id: me.family_id,
    member_id: me.id,
    storage_path: input.storagePath,
    media_type: input.mediaType,
    duration_seconds: seconds,
  });
  if (error) {
    await supabase.storage.from("documents").remove([input.storagePath]);
    return { error: humanDatabaseError(error.message) };
  }
  after(() => sweepExpiredHighlights());
  revalidatePath("/chat", "layout");
  return { error: null };
}

/** Takes your own highlight down before its 24 hours are up. */
export async function deleteHighlightAction(id: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: row } = await supabase.from("highlights").select("storage_path").eq("id", id).eq("member_id", me.id).maybeSingle();
  if (!row) return { error: "That highlight has already gone." };
  const { error } = await supabase.from("highlights").delete().eq("id", id).eq("member_id", me.id);
  if (error) return { error: humanDatabaseError(error.message) };
  await supabase.storage.from("documents").remove([row.storage_path]);
  revalidatePath("/chat", "layout");
  return { error: null };
}

/** Removes the files of this household's expired highlights, then their
 * rows. Run as the signed-in member, whenever someone in the household opens
 * Chat or posts a highlight: the files go through the Storage API, which is
 * the only way a file is really removed, and the bucket's policies already
 * let a member delete in their own household's folder. Nothing expired is
 * ever shown in the meantime -- the table's read policy hides it on the
 * minute. Failures are logged and left for the next sweep. */
export async function sweepExpiredHighlights(): Promise<number> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: expired, error } = await supabase.rpc("expired_highlights");
  if (error) {
    // Most likely the migration hasn't run here yet; nothing to sweep.
    if (!/does not exist|Could not find/i.test(error.message)) console.error("Highlights: expired_highlights failed", error.message);
    return 0;
  }
  const mine = (expired ?? []).filter((h) => h.storage_path.startsWith(`${me.family_id}/highlights/`));
  if (mine.length === 0) return 0;
  const { error: removeError } = await supabase.storage.from("documents").remove(mine.map((h) => h.storage_path));
  if (removeError) {
    console.error("Highlights: removing expired files failed", removeError.message);
    return 0;
  }
  const { data: forgotten, error: forgetError } = await supabase.rpc("forget_expired_highlights", { p_ids: mine.map((h) => h.id) });
  if (forgetError) console.error("Highlights: forget_expired_highlights failed", forgetError.message);
  return forgotten ?? 0;
}
