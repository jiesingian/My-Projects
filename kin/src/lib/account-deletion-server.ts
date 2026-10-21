import type { SupabaseClient } from "@supabase/supabase-js";

/** When the signed-in person's account is due to be deleted, or null when
 * it isn't (20261021020000_delete_my_account.sql; the row is theirs to read).
 * Read on sign-in, so they are offered "Keep my account". */
export async function pendingDeletion(supabase: unknown): Promise<string | null> {
  const db = supabase as SupabaseClient;
  const { data } = await db.from("account_deletions").select("delete_after").maybeSingle();
  return (data as { delete_after?: string } | null)?.delete_after ?? null;
}
