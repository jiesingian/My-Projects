import type { SupabaseClient } from "@supabase/supabase-js";

/** Every storage bucket that keeps a household's files under a first folder
 * named after the household. */
export const HOUSEHOLD_BUCKETS = ["journal", "trip-photos", "avatars", "recipe-photos", "documents"] as const;

/** Removes everything under `prefix`, however deep, and returns how many
 * files could not be removed. Storage lists a folder as an entry with no id,
 * so those are walked rather than deleted; files go in batches of 100, and a
 * page of 1000 is listed again until the folder comes back empty or stops
 * shrinking. Best effort, bounded: a household is never kept alive by a file.
 * Used by Delete household (its organizer's session) and by the account
 * deletion job (lib/actions/family.ts, app/api/cron/account-deletions). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function removeFolder(supabase: SupabaseClient<any, any, any>, bucket: string, prefix: string, depth = 0): Promise<number> {
  if (depth > 6) return 0;
  let left = 0;
  for (let round = 0; round < 50; round++) {
    const { data: entries, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error || !entries || entries.length === 0) break;
    const files = entries.filter((e) => e.id !== null).map((e) => `${prefix}/${e.name}`);
    const folders = entries.filter((e) => e.id === null);
    for (const folder of folders) left += await removeFolder(supabase, bucket, `${prefix}/${folder.name}`, depth + 1);
    let removed = 0;
    for (let i = 0; i < files.length; i += 100) {
      const { data, error: removeError } = await supabase.storage.from(bucket).remove(files.slice(i, i + 100));
      if (!removeError) removed += data?.length ?? 0;
    }
    // Nothing more came off this round: whatever is left cannot be removed.
    if (removed === 0) {
      left += files.length;
      break;
    }
    if (entries.length < 1000 && removed === files.length) break;
  }
  return left;
}
