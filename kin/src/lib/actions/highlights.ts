"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { sweepExpiredHighlightsFor } from "@/lib/highlights-sweep";
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

/** The sweep, as the signed-in member (lib/highlights-sweep). Safe inside
 * after() here: a Server Action may read cookies there; a page may not. */
export async function sweepExpiredHighlights(): Promise<number> {
  const me = await requireCurrentMember();
  return sweepExpiredHighlightsFor(await createClient(), me.family_id);
}
