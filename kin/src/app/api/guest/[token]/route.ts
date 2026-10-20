import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { GUEST_HEADCOUNT_MAX, GUEST_TOKEN, cleanGuestName } from "@/lib/event-guests";
import { isRsvpAnswer } from "@/lib/event-rsvp";
import { POTLUCK_LABEL_MAX, POTLUCK_WANTED_MAX } from "@/lib/potluck";
import { UUID } from "@/lib/ids";
import { sha256, toBase64Url } from "@/lib/security/crypto";

/** A guest's answers through a guest link (20261020231000): no session, the
 * link's token is the key. It is hashed here and each guest_* function
 * finds the event by it, writes in the guest's name under the host
 * household, and returns the guest's own state -- or raises in plain words,
 * which comes back as the error. Anon key only, never the service role. A
 * wrong, turned-off or expired link answers 404 whatever was asked. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const dead = () => json({ error: "This link isn't working any more. Ask the host for a new one." }, 404);
  if (!GUEST_TOKEN.test(token)) return dead();

  const raw = await request.text();
  if (raw.length > 4000) return json({ error: "That was too much at once." }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: "Kin didn't understand that." }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Kin didn't understand that." }, 400);
  const name = cleanGuestName(typeof body.name === "string" ? body.name : "");
  if (!name) return json({ error: "Write your name first: up to 40 letters, nothing fancy." }, 400);

  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const hash = toBase64Url(sha256(token));
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : NaN);

  let result: { data: unknown; error: { message: string; code?: string } | null };
  switch (body.action) {
    case "hello":
      result = await supabase.rpc("guest_hello", { p_token_hash: hash, p_name: name });
      break;
    case "answer": {
      const answer = body.answer === null ? null : typeof body.answer === "string" && isRsvpAnswer(body.answer) ? body.answer : undefined;
      if (answer === undefined) return json({ error: "Choose Going, Maybe or Can't go." }, 400);
      const headcount = int(body.headcount);
      if (answer !== null && (headcount < 1 || headcount > GUEST_HEADCOUNT_MAX)) return json({ error: `How many of you are coming? 1 to ${GUEST_HEADCOUNT_MAX}.` }, 400);
      result = await supabase.rpc("guest_answer", { p_token_hash: hash, p_name: name, p_answer: answer, p_headcount: answer === null ? null : headcount });
      break;
    }
    case "claim": {
      const qty = int(body.qty);
      if (typeof body.item !== "string" || !UUID.test(body.item)) return json({ error: "That item is no longer on the list." }, 400);
      if (qty < 0 || qty > POTLUCK_WANTED_MAX) return json({ error: "Choose how many you'll bring." }, 400);
      result = await supabase.rpc("guest_claim", { p_token_hash: hash, p_name: name, p_item: body.item, p_qty: qty });
      break;
    }
    case "dish": {
      const label = typeof body.label === "string" ? body.label.replace(/\s+/g, " ").trim().slice(0, POTLUCK_LABEL_MAX) : "";
      const wanted = int(body.wanted);
      if (!label) return json({ error: "Write what you'll bring, like “Leche flan x2”." }, 400);
      if (wanted < 1 || wanted > POTLUCK_WANTED_MAX) return json({ error: `How many? 1 to ${POTLUCK_WANTED_MAX}.` }, 400);
      result = await supabase.rpc("guest_add_dish", { p_token_hash: hash, p_name: name, p_label: label, p_wanted: wanted });
      break;
    }
    case "draw":
      result = await supabase.rpc("guest_join_draw", { p_token_hash: hash, p_name: name, p_in: body.in === true });
      break;
    default:
      return json({ error: "Kin didn't understand that." }, 400);
  }

  if (result.error) {
    // P0002 is the functions' own "this link is dead"; anything else they
    // raise is a sentence for the guest. A real failure is neither.
    if (result.error.code === "P0002") return dead();
    if (result.error.code?.startsWith("P0") || result.error.code === "23514") return json({ error: result.error.message }, 400);
    console.error("Guest link action failed", result.error.message);
    return json({ error: "Kin couldn't save that just now. Try again in a minute." }, 503);
  }
  return json({ state: result.data ?? null });
}
