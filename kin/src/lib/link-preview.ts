// Server only: it imports node:dns, so it cannot be bundled for the browser,
// and it is only ever reached through a server action or a route handler.
import { lookup } from "node:dns/promises";
import { isPublicAddress, parseOpenGraph, type LinkPreview } from "@/lib/chat";

const TIMEOUT_MS = 3000;
const MAX_BYTES = 256 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** The image types the thumbnail proxy will pass on. Raster only, and SVG
 * above all excluded: it is served from Kin's own origin, and an SVG opened
 * directly in a tab runs its scripts there. */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

export function isAllowedImageType(contentType: string | null): string | null {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return IMAGE_TYPES.includes(type) ? type : null;
}

/** A URL we are willing to fetch at all: http or https, no credentials in it,
 * the default port. Everything else -- ftp, a login baked into the URL, an
 * admin panel on port 8080 -- is not a web page somebody meant to share. */
function acceptable(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  return true;
}

/** Every address the host resolves to must be public. All of them, not the
 * first: a name that resolves to one public and one private address is
 * exactly the shape of an attempt to get past a check that looked at one. */
async function resolvesPublicly(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  // A literal address in the URL is judged as itself.
  if (/^[\d.]+$/.test(host) || host.includes(":")) return isPublicAddress(host);
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((a) => isPublicAddress(a.address));
  } catch {
    return false;
  }
}

/** Reads at most `max` bytes of the body and then stops, rather than trusting
 * a Content-Length the other end chose. `overflow` says whether there was
 * more: a page cut short still has its head, an image cut short is broken. */
async function readCapped(res: Response, max: number): Promise<{ bytes: Uint8Array; overflow: boolean }> {
  if (!res.body) return { bytes: new Uint8Array(0), overflow: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let overflow = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
    if (total > max) {
      overflow = true;
      break;
    }
  }
  await reader.cancel().catch(() => {});
  const merged = new Uint8Array(Math.min(total, max));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, merged.byteLength - offset);
    merged.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= merged.byteLength) break;
  }
  return { bytes: merged, overflow };
}

/** Fetches a URL a household member chose, from our server, and hands back
 * the final response only if every hop was safe to make. Never throws.
 *
 * What stands between a member's link and our server reading an internal
 * address on their behalf, in order: the URL must be http(s) on a default
 * port with no credentials; every address its host resolves to must be
 * public; redirects are followed by hand, at most three, with both checks
 * repeated on every hop; and there is a time limit on each.
 *
 * One residual gap, stated rather than hidden: the name is resolved here and
 * again by fetch, and a hostile DNS server could answer differently the second
 * time. Closing that means connecting to the checked address directly, which
 * fetch does not offer. What it could reach is limited to what the callers do
 * with the response: three text fields parsed out of HTML, or an image that
 * must declare a raster type and fit in 3MB.
 *
 * Cached by URL for a day through fetch's own data cache, so a link the whole
 * house scrolls past is fetched once, not once per person.
 */
async function guardedFetch(raw: string, accept: string, timeoutMs: number): Promise<Response | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!acceptable(url) || !(await resolvesPublicly(url.hostname))) return null;

    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          // Some sites serve their Open Graph tags only to things that say
          // they are a link previewer.
          "user-agent": "Mozilla/5.0 (compatible; KinLinkPreview/1.0)",
          accept,
        },
        next: { revalidate: 60 * 60 * 24 },
      });
    } catch {
      return null;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) return null;
      try {
        url = new URL(location, url);
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    return res;
  }
  return null;
}

/** A preview for one link, or null. Never throws: a preview is decoration, and
 * no failure in fetching one should reach the page as anything but its
 * absence. Only an HTML response is read at all, and only its first 256KB. */
export async function fetchLinkPreview(raw: string): Promise<LinkPreview | null> {
  const res = await guardedFetch(raw, "text/html,application/xhtml+xml", TIMEOUT_MS);
  if (!res) return null;
  if (!/^\s*text\/html|application\/xhtml\+xml/i.test(res.headers.get("content-type") ?? "")) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  try {
    const { bytes } = await readCapped(res, MAX_BYTES);
    return parseOpenGraph(new TextDecoder("utf-8", { fatal: false }).decode(bytes), raw);
  } catch {
    return null;
  }
}

/** A page's preview image, fetched by our server so the member's browser never
 * contacts the site itself -- see parseOpenGraph for why that matters. Null
 * for anything but a raster image of at most 3MB. The type is Kin's own
 * reading of the header against a short list, never whatever the site said. */
export async function fetchPreviewImage(raw: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const res = await guardedFetch(raw, IMAGE_TYPES.join(","), 5000);
  if (!res) return null;
  const contentType = isAllowedImageType(res.headers.get("content-type"));
  if (!contentType) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  try {
    const { bytes, overflow } = await readCapped(res, MAX_IMAGE_BYTES);
    return overflow || bytes.byteLength === 0 ? null : { bytes, contentType };
  } catch {
    return null;
  }
}
