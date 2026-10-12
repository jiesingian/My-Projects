import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Removes the files of a household's expired highlights, then their rows.
 * Run as the signed-in member, whenever someone in the household opens Chat
 * or posts a highlight: the files go through the Storage API, which is the
 * only way a file is really removed, and the bucket's policies already let a
 * member delete in their own household's folder. Nothing expired is ever
 * shown in the meantime -- the table's read policy hides it on the minute.
 * Failures are logged and left for the next sweep.
 *
 * Takes the client and household rather than reading the session itself, so
 * a page can hand them to after(): a Server Component may not read cookies
 * inside after(), and until 10 October the household chat's sweep threw on
 * every open for exactly that reason -- expired highlights were hidden but
 * their files were never removed. */
export async function sweepExpiredHighlightsFor(supabase: SupabaseClient<Database>, familyId: string): Promise<number> {
  const { data: expired, error } = await supabase.rpc("expired_highlights");
  if (error) {
    // Most likely the migration hasn't run here yet; nothing to sweep.
    if (!/does not exist|Could not find/i.test(error.message)) console.error("Highlights: expired_highlights failed", error.message);
    return 0;
  }
  const mine = (expired ?? []).filter((h) => h.storage_path.startsWith(`${familyId}/highlights/`));
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
