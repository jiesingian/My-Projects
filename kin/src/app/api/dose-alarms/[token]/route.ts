import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { alarmSummary, readAlarmFeed } from "@/lib/dose-alarms";
import { sha256, toBase64Url } from "@/lib/security/crypto";
import { reportError } from "@/lib/report-error";

/** The "Kin Alarms" Shortcut's link: the member's dose times today, as JSON
 * the Shortcut turns into iPhone Clock alarms (lib/dose-alarms.ts). A
 * Shortcut sends no cookie, so the link's token is the only credential --
 * its own token, never the brief's, the list's or Send it to Kin's. It is
 * hashed here, and dose_alarms_by_link() answers with the times and labels
 * of that member's doses and nothing else (see its migration). Anon key
 * only, never the service role. Read-only. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  // The Shortcut shows `summary` either way, so a failure is a sentence too.
  // It clears and remakes its alarms only when `status` is "ok" (a text,
  // which a Shortcut's If compares reliably), so a failed read never leaves
  // a phone with no alarms.
  const unknown = () => json({ ok: false, status: "error", alarms: [], summary: "This Kin link isn't working any more. Make a new one in Kin, under Settings, Notifications, Medicine alarms." }, 404);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return unknown();

  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("dose_alarms_by_link", { p_token_hash: toBase64Url(sha256(token)) });
  if (error) {
    reportError("Dose alarms by link failed", error);
    return json({ ok: false, status: "error", alarms: [], summary: "Kin couldn't get your dose times just now. Your alarms are as they were. Try again in a minute." }, 503);
  }
  const feed = readAlarmFeed(data);
  if (!feed) return unknown();
  return json({ ok: true, status: "ok", name: feed.name, today: feed.today, alarms: feed.alarms, summary: alarmSummary(feed.alarms) });
}
