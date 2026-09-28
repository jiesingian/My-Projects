import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildBrief, type BriefItem } from "@/lib/brief";
import { sha256, toBase64Url } from "@/lib/security/crypto";

/** A member's plan for today, as plain sentences for the iPhone to speak:
 * the "Today in Kin" Shortcut fetches this (Get Contents of URL) and reads it
 * aloud (Speak Text). A Shortcut sends no cookie, so the link's token is the
 * only credential -- hashed here, and today_brief() returns what that
 * member's calendar link could see (see its migration). Anon key only, never
 * the service role. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const text = (body: string, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  // Said, not shown: whatever this returns is read aloud, so even the
  // failures are sentences.
  const unknown = () => text("This Kin link isn't working any more. Make a new one in Kin, under Settings, Action Button and widget.", 404);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return unknown();

  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("today_brief", { p_hash: toBase64Url(sha256(token)) });
  if (error) {
    console.error("Today brief failed", error.message);
    return text("Kin couldn't get today's plan just now. Try again in a minute.", 503);
  }
  const brief = data as { name: string; items: BriefItem[] } | null;
  if (!brief) return unknown();
  return text(buildBrief(brief.name, brief.items ?? []));
}
