import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";

/** An entry's video (journal_entry_videos), as a page needs it: signed links
 * to the file and its poster, and its shape so the space is held before it
 * loads. */
export type EntryVideo = {
  url: string;
  poster: string;
  mimeType: string;
  width: number;
  height: number;
  duration: number;
};

/** The videos of these entries, by entry id, signed with the reader's own
 * session -- so a video shows exactly where the storage policy lets it, which
 * is wherever its entry can be read. A video whose file could not be signed is
 * left out rather than shown broken.
 *
 * Asked as its own query rather than embedded in each entry query on purpose:
 * if the table is ever missing (a deploy landing minutes before its migration,
 * as happens on every merge) the answer is "no videos", not a journal that
 * fails to load. */
export async function getEntryVideos(entryIds: string[]): Promise<Map<string, EntryVideo>> {
  const out = new Map<string, EntryVideo>();
  if (entryIds.length === 0) return out;
  const supabase = await createClient();
  // A hundred ids at a time: a whole journal's worth in one address would
  // run past what the API accepts in a URL.
  const chunks = Array.from({ length: Math.ceil(entryIds.length / 100) }, (_, i) => entryIds.slice(i * 100, i * 100 + 100));
  const results = await Promise.all(
    chunks.map((ids) =>
      supabase.from("journal_entry_videos").select("entry_id, storage_path, poster_path, mime_type, width, height, duration_seconds").in("entry_id", ids),
    ),
  );
  const data = results.flatMap((r) => (r.error ? [] : (r.data ?? [])));
  if (!data.length) return out;
  const urls = await getSignedUrls(
    "journal",
    data.flatMap((r) => [r.storage_path, r.poster_path]),
  );
  for (const r of data) {
    const url = urls[r.storage_path];
    if (!url) continue;
    out.set(r.entry_id, {
      url,
      poster: urls[r.poster_path] ?? "",
      mimeType: r.mime_type,
      width: r.width,
      height: r.height,
      duration: Number(r.duration_seconds),
    });
  }
  return out;
}
