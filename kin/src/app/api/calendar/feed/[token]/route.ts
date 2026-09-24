import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildIcs, type FeedRow } from "@/lib/ics";
import { sha256, toBase64Url } from "@/lib/security/crypto";

/** A member's private calendar feed, for Apple Calendar, Outlook and the
 * rest. Apple fetches it with no cookie, so the link's token is the only
 * credential: it is hashed here and the database's calendar_feed() returns
 * what that member could see in the Planner (see the migration for what that
 * is, and is not). Anon key only -- never the service role. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  const notFound = () => new Response("Not found", { status: 404 });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return notFound();

  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("calendar_feed", { feed_hash: toBase64Url(sha256(token)) });
  if (error) {
    console.error("Calendar feed failed", error.message);
    return new Response("Try again later", { status: 503 });
  }
  // A link that matches nobody gets the same answer as one that never
  // existed, so the feed says nothing about which links are live.
  if (!data || data.length === 0) return notFound();

  return new Response(buildIcs("Kin — family", data as FeedRow[]), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="kin.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
