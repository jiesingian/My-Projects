import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SENT_MAX_BYTES, SENT_SAYS, sentImageType, sentOpenUrl } from "@/lib/send-to-kin";
import { sha256, toBase64Url } from "@/lib/security/crypto";
import { reportError } from "@/lib/report-error";

/** "Send it to Kin": the iPhone share sheet's Shortcut posts a screenshot
 * here (Get Contents of URL, body = the shared image), and what comes back
 * is the address of Planner -> Add with the screenshot waiting, which the
 * Shortcut opens (Open URLs). The Add page scans it there, on the flyer
 * scan's review screen; nothing is saved by this route.
 *
 * A Shortcut sends no cookie, so the link's token is the only credential --
 * its own token, never "Today in Kin"'s or "Add to Kin"'s. It is hashed here
 * and send_to_kin_by_link() keeps the picture for whoever made the link, as
 * them, for a day at most (see its migration). Anon key only, never the
 * service role. Kin Plus: the function says so for a Free household. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const text = (body: string, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return text(SENT_SAYS.unknown, 404);

  // The picture: the raw body of an image type, or the first file of a
  // multipart form (either is one tap in Shortcuts).
  const contentType = request.headers.get("content-type");
  let mime = sentImageType(contentType);
  let bytes: ArrayBuffer | null = null;
  if (mime) {
    bytes = await request.arrayBuffer();
  } else if ((contentType ?? "").toLowerCase().startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return text(SENT_SAYS.picture, 400);
    }
    for (const value of form.values()) {
      if (value instanceof File && value.size > 0) {
        mime = sentImageType(value.type);
        if (mime) bytes = await value.arrayBuffer();
        break;
      }
    }
  }
  if (!mime || !bytes || bytes.byteLength === 0) return text(SENT_SAYS.picture, 400);
  if (bytes.byteLength > SENT_MAX_BYTES) return text(SENT_SAYS.picture, 413);

  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("send_to_kin_by_link", {
    p_token_hash: toBase64Url(sha256(token)),
    p_mime: mime,
    p_data_base64: Buffer.from(bytes).toString("base64"),
  });
  if (error) {
    reportError("Send to Kin by link failed", error);
    return text(SENT_SAYS.busy, 503);
  }
  const result = data as { ok?: boolean; id?: string; why?: string } | null;
  if (!result?.ok || !result.id) {
    const why = result?.why === "plus" ? "plus" : result?.why === "picture" ? "picture" : "unknown";
    return text(SENT_SAYS[why], why === "unknown" ? 404 : why === "plus" ? 402 : 400);
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return text(sentOpenUrl(host, result.id));
}
