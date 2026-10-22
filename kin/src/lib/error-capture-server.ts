import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { errorReport, type ErrorKind, type ErrorReport } from "@/lib/error-capture";

/** Sends one scrubbed error to public.log_app_error (lib/error-capture.ts
 * says what is kept). With the anon key and no session: the function is the
 * only way in, it rate-limits and scrubs again, and nothing reads the table
 * back but the weekly check. Never throws: a failure to record an error must
 * not become a second error. */
export async function recordError(kind: ErrorKind, route: unknown, message: unknown, stack: unknown): Promise<void> {
  await recordReport(errorReport(kind, route, message, stack));
}

/** The same, for a report already made (lib/report-error.ts). */
let client: SupabaseClient<Database> | null = null;

export async function recordReport(r: ErrorReport): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    client ??= createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const supabase = client;
    await supabase.rpc("log_app_error", { p_fingerprint: r.fingerprint, p_kind: r.kind, p_route: r.route, p_message: r.message, p_version: r.version });
  } catch {
    // Nowhere left to report it.
  }
}
