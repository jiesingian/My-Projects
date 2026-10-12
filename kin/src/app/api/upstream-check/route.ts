import { getCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { nagerUrl } from "@/lib/holidays";
import { nominatimHeaders, nominatimUrl, parseNominatim } from "@/lib/places";

/** Whether Kin's two keyless services answer from where Kin runs, and in the
 * shape Kin reads: { nager: {...}, nominatim: {...} }.
 *
 * Both fall back silently by design (lib/holidays, api/places), so a broken
 * one looked like a working one. This asks each once, with the same URL,
 * headers and day-long cache as the real calls -- one fixed question each,
 * never the caller's, so it is no proxy, and Nominatim hears from it at most
 * once a day.
 *
 * Grown-ups only in production. On a preview it answers without a session:
 * the preview is behind Vercel Authentication, and a session there would
 * need a real sign-in. */
const NOMINATIM_PROBE = "sm megamall mandaluyong";

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    const me = await getCurrentMember();
    if (!me) return new Response("Unauthorized", { status: 401 });
    if (!isGrownUp(me.role)) return new Response("Forbidden", { status: 403 });
  }
  const origin = new URL(request.url).origin;
  const year = new Date().getUTCFullYear();

  const [nager, nominatim] = await Promise.all([
    probe(nagerUrl(year, "PH"), {}, (json) => {
      const list = Array.isArray(json) ? (json as { date?: unknown; name?: unknown }[]) : [];
      const usable = list.filter((h) => typeof h.date === "string" && typeof h.name === "string");
      return { count: list.length, usable: usable.length, sample: usable.slice(0, 3).map((h) => `${h.date} ${h.name}`) };
    }),
    probe(nominatimUrl(NOMINATIM_PROBE), nominatimHeaders(origin), (json) => {
      const first = Array.isArray(json) ? (json[0] as { address?: Record<string, unknown> } | undefined) : undefined;
      const places = parseNominatim(json);
      return { count: Array.isArray(json) ? json.length : 0, parsed: places.length, addressKeys: Object.keys(first?.address ?? {}), first: places[0] ?? null };
    }),
  ]);
  return Response.json({ nager, nominatim }, { headers: { "Cache-Control": "private, no-store" } });
}

async function probe(url: string, headers: Record<string, string>, read: (json: unknown) => object) {
  try {
    const response = await fetch(url, { headers, next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return { ok: false, status: response.status, body: (await response.text()).slice(0, 300) };
    return { ok: true, status: response.status, ...read(await response.json()) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
