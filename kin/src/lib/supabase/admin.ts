import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Service-role client — server-only, never imported from a Client Component.
 * Used exclusively by the Drive OAuth route handlers to read/write
 * drive_tokens, a table RLS deliberately hides from anon/authenticated. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
