import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { LIST_ADD_MAX_BODY_BYTES, LIST_ADD_MAX_CHARS, addedSentence, declaredTooLarge, readSpokenList, shortcutText } from "@/lib/list-add";
import { sha256, toBase64Url } from "@/lib/security/crypto";

/** "Hey Siri, add rice to Kin": the "Add to Kin" Shortcut asks "What do you
 * need?" and posts the answer here (Get Contents of URL), then speaks what
 * comes back (Speak Text).
 *
 * A Shortcut sends no cookie, so the link's token is the only credential --
 * its own token, never the "Today in Kin" one, so a leaked read link cannot
 * write. It is hashed here and add_to_list_by_link() adds the items to the
 * shopping list of whoever made the link, as them, and nothing else (see its
 * migration). Anon key only, never the service role. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const text = (body: string, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  // Said, not shown: whatever this returns is read aloud, so even the
  // failures are sentences. The same words as the brief link's.
  const unknown = () => text("This Kin link isn't working any more. Make a new one in Kin, under Settings, Action Button and widget.", 404);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return unknown();

  // The size first, then the body: a declared Content-Length over the limit
  // is refused unread, and a body with none declared is read only up to the
  // limit and cut off there. Room for the JSON around the words; the words
  // themselves are held to LIST_ADD_MAX_CHARS below.
  const tooMuch = () => text("That was a lot at once. Say up to 20 things at a time.", 413);
  if (declaredTooLarge(request.headers.get("content-length"))) return tooMuch();
  const body = await readBodyUpTo(request, LIST_ADD_MAX_BODY_BYTES);
  if (body === null) return tooMuch();
  const said = shortcutText(body, request.headers.get("content-type")).trim();
  if (said.length > LIST_ADD_MAX_CHARS) return text("That was a lot at once. Say up to 20 things at a time.", 413);
  const { items, extra } = readSpokenList(said);
  if (items.length === 0) return text("Kin didn't catch anything to add. Try again, and say what you need, like rice and eggs.", 400);

  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("add_to_list_by_link", { p_token_hash: toBase64Url(sha256(token)), p_items: items });
  if (error) {
    console.error("Add to list by link failed", error.message);
    return text("Kin couldn't add that just now. Try again in a minute.", 503);
  }
  if (data === -1) return unknown();
  return text(addedSentence(items, data ?? 0, extra));
}

/** The body as text, or null once it passes `max` bytes: the stream is
 * cancelled there rather than read to the end and measured after. */
async function readBodyUpTo(request: Request, max: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
