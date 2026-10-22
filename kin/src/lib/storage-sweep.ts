import type { SupabaseClient } from "@supabase/supabase-js";

/** Every storage bucket that keeps a household's files under a first folder
 * named after the household. */
export const HOUSEHOLD_BUCKETS = ["journal", "trip-photos", "avatars", "recipe-photos", "documents"] as const;

/** Removes everything under `prefix`, however deep, except the paths in
 * `keep`, and returns how many files could not be removed. Storage lists a
 * folder as an entry with no id, so those are walked rather than deleted;
 * files go in batches of 100, and a page of 1000 is listed again until the
 * folder comes back empty or stops shrinking. Best effort, bounded: a household is never kept alive by a file.
 * Used by Delete household (its organizer's session) and by the account
 * deletion job (lib/actions/family.ts, app/api/cron/account-deletions). */
export async function removeFolder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  bucket: string,
  prefix: string,
  depth = 0,
  keep: ReadonlySet<string> = new Set(),
): Promise<number> {
  if (depth > 6) return 0;
  if (keep.size > 0) return removeFolderKeeping(supabase, bucket, prefix, depth, keep);
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

/** removeFolder with files to keep. Kept files never leave the listing, so
 * listing again from the top would see only them: the whole folder is
 * listed first, page by page (up to 50,000 entries), and only then are the
 * others removed. */
async function removeFolderKeeping(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  bucket: string,
  prefix: string,
  depth: number,
  keep: ReadonlySet<string>,
): Promise<number> {
  const entries: { id: string | null; name: string }[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset: page * 1000 });
    if (error || !data || data.length === 0) break;
    entries.push(...data);
    if (data.length < 1000) break;
  }
  let left = 0;
  for (const folder of entries.filter((e) => e.id === null)) {
    left += await removeFolder(supabase, bucket, `${prefix}/${folder.name}`, depth + 1, keep);
  }
  const files = entries.filter((e) => e.id !== null).map((e) => `${prefix}/${e.name}`).filter((path) => !keep.has(path));
  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(bucket).remove(batch);
    left += batch.length - (error ? 0 : (data?.length ?? 0));
  }
  return left;
}
