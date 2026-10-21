import type { SupabaseClient } from "@supabase/supabase-js";
import { HOUSEHOLD_BUCKETS } from "@/lib/storage-sweep";
import { toCsv, withoutSecrets } from "@/lib/export/csv";

/** The "mine/" part of Download my data (21 October): what this person owns
 * or wrote, and their files themselves, read with their own session so
 * row-level security and Storage's policies decide what comes back. */

/** A phone has to hold the whole ZIP in memory; past this, files are listed
 * in the README instead of included. */
export const MY_FILES_MAX_BYTES = 25 * 1024 * 1024;

type Me = { id: string; person_id: string };
type ZipFile = { name: string; data: Uint8Array };

/** Every file under `prefix`, however deep (Storage lists a folder as an
 * entry with no id). Bounded, like the sweep. */
async function listFolder(db: SupabaseClient, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const out: string[] = [];
  for (const e of data) {
    if (e.id === null) out.push(...(await listFolder(db, bucket, `${prefix}/${e.name}`, depth + 1)));
    else out.push(`${prefix}/${e.name}`);
  }
  return out;
}

/** Where a path sits in the ZIP: under mine/files/<bucket>/, with only
 * characters every unzip tool accepts. */
export function zipPathFor(bucket: string, path: string): string {
  return `mine/files/${bucket}/${path.replace(/[^A-Za-z0-9._/-]+/g, "_").replace(/\.\.+/g, ".")}`;
}

export async function myData(db: SupabaseClient, me: Me): Promise<{ files: ZipFile[]; counts: string[]; leftOut: string[] }> {
  const enc = new TextEncoder();
  const files: ZipFile[] = [];
  const counts: string[] = [];
  const leftOut: string[] = [];

  const tables: [file: string, table: string, column: string, value: string][] = [
    ["mine/my-profile.csv", "members", "id", me.id],
    ["mine/personal-notes.csv", "personal_notes", "owner_person_id", me.person_id],
    ["mine/personal-journal.csv", "journal_entries", "owner_person_id", me.person_id],
    ["mine/personal-goals.csv", "goals", "owner_person_id", me.person_id],
    ["mine/saved-messages.csv", "saved_messages", "person_id", me.person_id],
  ];
  for (const [file, table, column, value] of tables) {
    const { data, error } = await db.from(table).select("*").eq(column, value).limit(10_000);
    if (error || !data || data.length === 0) continue;
    files.push({ name: file, data: enc.encode(toCsv(withoutSecrets(data as Record<string, unknown>[]))) });
    counts.push(`  ${file.padEnd(30)} ${data.length} row${data.length === 1 ? "" : "s"}`);
  }

  // Their files: the personal space's folder, and what they uploaded for the household.
  const wanted: { bucket: string; path: string }[] = [];
  for (const bucket of HOUSEHOLD_BUCKETS) {
    for (const path of await listFolder(db, bucket, `person/${me.person_id}`)) wanted.push({ bucket, path });
  }
  const uploaded: [table: string, column: string, bucket: string][] = [
    ["journal_media", "uploaded_by", "journal"],
    ["doc_files", "created_by", "documents"],
    ["event_photos", "created_by", "journal"],
    ["recipe_photos", "created_by", "recipe-photos"],
  ];
  for (const [table, column, bucket] of uploaded) {
    const { data } = await db.from(table).select("storage_path").eq(column, me.id).not("storage_path", "is", null).limit(5_000);
    for (const r of (data ?? []) as { storage_path: string }[]) wanted.push({ bucket, path: r.storage_path });
  }

  const seen = new Set<string>();
  let bytes = 0;
  for (const f of wanted) {
    const key = `${f.bucket}/${f.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (bytes >= MY_FILES_MAX_BYTES) {
      leftOut.push(key);
      continue;
    }
    const { data, error } = await db.storage.from(f.bucket).download(f.path);
    if (error || !data) continue;
    const buf = new Uint8Array(await data.arrayBuffer());
    if (bytes + buf.byteLength > MY_FILES_MAX_BYTES) {
      leftOut.push(key);
      continue;
    }
    bytes += buf.byteLength;
    files.push({ name: zipPathFor(f.bucket, f.path), data: buf });
  }
  const n = files.filter((f) => f.name.startsWith("mine/files/")).length;
  if (n > 0) counts.push(`  ${"mine/files/".padEnd(30)} ${n} file${n === 1 ? "" : "s"}`);
  return { files, counts, leftOut };
}
