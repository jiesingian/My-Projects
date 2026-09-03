import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Resolves the servable URL for a row that stores a photo via either
 * provider (member_avatars, family_backgrounds) — a Drive file is served
 * through our own proxy route since it isn't public, while a Supabase
 * Storage path resolves to that bucket's public URL. Exactly one of the two
 * columns is ever set (enforced by a DB check constraint). */
export function resolvePhotoUrl(
  supabase: SupabaseClient<Database>,
  row: { storage_path?: string | null; drive_file_id?: string | null },
): string | null {
  if (row.drive_file_id) return `/api/drive/file/${row.drive_file_id}`;
  if (row.storage_path) return supabase.storage.from("avatars").getPublicUrl(row.storage_path).data.publicUrl;
  return null;
}
