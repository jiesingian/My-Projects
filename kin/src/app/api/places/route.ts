import { getCurrentMember } from "@/lib/session";
import { nominatimUrl, normalizeQuery, parseNominatim, type Place } from "@/lib/places";

/** Place suggestions for a location field (components/place-input).
 *
 * Signed-in members only: otherwise this is a free Nominatim proxy for anyone,
 * spending the one-a-second allowance that Kin's own families share.
 *
 * Nominatim's policy is at most one request a second (lib/places). `queue`
 * holds this server instance to that: each call waits for the one before it
 * and then a second more. Most searches never reach it, because the fetch
 * layer caches every answer for a day. */
let queue: Promise<unknown> = Promise.resolve();
const GAP_MS = 1000;

function politely<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, GAP_MS)));
  return run;
}

export async function GET(request: Request) {
  const me = await getCurrentMember();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const q = normalizeQuery(new URL(request.url).searchParams.get("q"));
  if (!q) return Response.json({ places: [] });

  const origin = new URL(request.url).origin;
  let places: Place[] = [];
  try {
    const response = await politely(() =>
      fetch(nominatimUrl(q), {
        headers: { "User-Agent": `Kin family app (${origin})`, Referer: origin },
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(6000),
      }),
    );
    if (response.ok) places = parseNominatim(await response.json());
  } catch {
    // Down, slow or unreachable: no suggestions, and the field still takes
    // whatever was typed.
  }
  return Response.json({ places }, { headers: { "Cache-Control": "private, max-age=86400" } });
}
