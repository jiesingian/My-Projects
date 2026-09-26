import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sha256 } from "@/lib/security/crypto";
import { manilaToday, toSamples } from "@/lib/apple-health";

/** Where a member's iPhone Shortcut sends the day's Apple Health readings.
 *
 * The Shortcut has no Kin session, so the link's key is the credential, the
 * same way the private calendar feed works (api/calendar/feed): it is hashed
 * here and ingest_apple_health() writes readings for whoever made that key,
 * into their own record, and nothing else. Anon key only -- never the
 * service role. A key that matches nobody gets the same 404 as a link that
 * never existed. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const notFound = () => Response.json({ error: "This link isn't connected to anyone. Make a new one in Kin: Settings, Connected apps, Apple Health." }, { status: 404 });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return notFound();

  const text = await request.text();
  if (text.length > 16_000) return Response.json({ error: "Too much at once." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Kin expected the readings as JSON: set Request Body to JSON in the Shortcut." }, { status: 400 });
  }
  const samples = toSamples(body, manilaToday());
  if (samples.length === 0) return Response.json({ error: "No readings Kin recognises. Send steps, weight, heart_rate or sleep." }, { status: 400 });

  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("ingest_apple_health", { p_token_hash: sha256(token).toString("hex"), p_samples: samples });
  if (error) {
    console.error("Apple Health import failed", error.message);
    return Response.json({ error: "Kin couldn't save that just now. The Shortcut can try again later." }, { status: 503 });
  }
  if (data === -1) return notFound();
  return Response.json({ saved: data });
}
