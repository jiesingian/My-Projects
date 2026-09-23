// Server only: it imports node:dns, so it cannot be bundled for the browser,
// and it is only ever reached through a server action.
import { lookup } from "node:dns/promises";
import { isPublicAddress, parseOpenGraph, type LinkPreview } from "@/lib/chat";

const TIMEOUT_MS = 3000;
const MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;

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

/** Reads at most MAX_BYTES of the body and then stops, rather than trusting a
 * Content-Length the other end chose. */
async function readCapped(res: Response) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const merged = new Uint8Array(Math.min(total, MAX_BYTES));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, merged.byteLength - offset);
    merged.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= merged.byteLength) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/** A preview for one link, or null. Never throws: a preview is decoration, and
 * no failure in fetching one should reach the thread as anything but its
 * absence.
 *
 * What stands between a member's message and our server reading an internal
 * address on their behalf, in order: the URL must be http(s) on a default
 * port with no credentials; every address its host resolves to must be
 * public; redirects are followed by hand, at most three, with both checks
 * repeated on every hop; three seconds and 256KB, then it stops; and only an
 * HTML response is read at all.
 *
 * One residual gap, stated rather than hidden: the name is resolved here and
 * again by fetch, and a hostile DNS server could answer differently the second
 * time. Closing that means connecting to the checked address directly, which
 * fetch does not offer. What it could reach is limited to a response parsed
 * for three text fields and shown to the household that posted the link.
 *
 * Cached by URL for a day through fetch's own data cache, so a link the whole
 * house scrolls past is fetched once, not once per person.
 */
export async function fetchLinkPreview(raw: string): Promise<LinkPreview | null> {
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
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // Some sites serve their Open Graph tags only to things that say
          // they are a link previewer.
          "user-agent": "Mozilla/5.0 (compatible; KinLinkPreview/1.0)",
          accept: "text/html,application/xhtml+xml",
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

    if (!res.ok || !/^\s*text\/html|application\/xhtml\+xml/i.test(res.headers.get("content-type") ?? "")) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    try {
      return parseOpenGraph(await readCapped(res), raw);
    } catch {
      return null;
    }
  }
  return null;
}
