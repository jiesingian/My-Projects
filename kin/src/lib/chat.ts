/** What may be said back to a message without saying anything.
 *
 * The six the composer offers, in one place, because the server has to check
 * them and the picker has to render them and the two must not drift -- the
 * same reason `household-prefs.ts` and `profile-fields.ts` exist.
 *
 * What went wrong without it, measured on 9 September against the throwaway
 * households: `reactToMessageAction` took its emoji as a plain string and
 * wrote it through. There is no CHECK on the column either, so the database
 * had no opinion. A whole sentence was accepted as a reaction, and so were
 * five thousand characters of X -- which then render in the reaction chip
 * under that message, on the thread, for everybody in the household.
 *
 * It is the same shape as the currency bug found in Settings the same day:
 * one public endpoint, no validation, and the result is stored where the
 * whole household has to look at it.
 */
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export type Reaction = (typeof REACTIONS)[number];

export function isReaction(value: string): value is Reaction {
  return (REACTIONS as readonly string[]).includes(value);
}

/** Split a message into shopping-list items: "we need milk, eggs and bread"
 * becomes three.
 *
 * Deliberately conservative. It splits on the separators people actually use
 * in a list -- new lines, commas, semicolons, a closing "and" -- strips the
 * bullets and numbering a pasted list carries, and drops the lead-in ("we
 * need", "pls buy") that is an instruction rather than an item. It does not
 * try to understand quantities or units: "2 dozen eggs" stays one item called
 * that, which the Buy list already knows how to show and anyone can edit.
 * Guessing wrong about a quantity would put a wrong number on the list, and
 * a list somebody shops from is the wrong place to be clever.
 */
export function splitShoppingItems(text: string): string[] {
  const LEAD_IN = /^(?:(?:pls|please|can\s+(?:you|someone|somebody)|could\s+(?:you|someone|somebody))\s+)?(?:we\s+need(?:\s+to\s+buy)?|need(?:\s+to\s+buy)?|buy|get|grab|pick\s+up|we'?re\s+out\s+of|out\s+of|add)\s*:?\s+/i;
  const items = text
    .split(/\r?\n|[,;]|\s+and\s+|\s*&\s*/i)
    .map((part) =>
      part
        // Bullets and numbering from a pasted list: "- milk", "• eggs", "3. bread", "1) rice".
        .replace(/^\s*(?:[-*•·]+|\d+[.)])\s*/, "")
        .replace(LEAD_IN, "")
        // Trailing punctuation and the "pls" people append.
        .replace(/[\s.!?]+$/, "")
        .replace(/\s+(?:pls|please|po)$/i, "")
        .trim(),
    )
    .filter((part) => part.length > 0 && part.length <= 150);
  // The same thing twice in one message is one thing on the list.
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

/** The amount in a message, if it states one with a currency: "Paid the
 * plumber ₱1,500" is 1500. A bare number is not an amount -- "pick up 2 kids
 * at 4" has two numbers and no money -- so without ₱, PHP, P, $ or USD in
 * front of it this returns null and the money form starts at zero. A wrong
 * figure pre-filled on a transaction is worse than an empty one.
 */
export function amountIn(text: string): number | null {
  const m = text.match(/(?:₱|\bphp\s?|\bp(?=\s?\d)|\$|\busd\s?)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d)/i);
  if (!m) return null;
  const whole = Number(m[1].replace(/,/g, ""));
  const cents = m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0;
  const value = whole + cents;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The first web address in a message, if there is one. Only http and https:
 * a preview is a fetch, and nothing else here is something we should fetch. */
export function firstUrl(text: string): string | null {
  const m = text.match(/\bhttps?:\/\/[^\s<>"'`]+/i);
  if (!m) return null;
  // Punctuation a sentence puts after a link is not part of the link.
  const url = m[0].replace(/[),.;:!?\]]+$/, "");
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export type LinkPreview = { url: string; site: string; title: string; description: string | null };

/** Title, description and site name from a page's head.
 *
 * Open Graph first, then the plain <title> and meta description, which is
 * what most pages actually have. A regular expression rather than an HTML
 * parser: this reads a handful of tags from the first 256KB of a page, and a
 * parser would be a dependency for that. What comes back is plain text --
 * entities decoded, tags gone, lengths capped -- because it is rendered in a
 * thread for the whole household and must never carry markup into it.
 *
 * No image. Showing a page's og:image would load it straight from that site,
 * for every member, every time they open the thread -- which hands every one
 * of their IP addresses to whoever posted the link, and makes any link a
 * tracking pixel. A messenger proxies those; Kin would have to, and does not.
 */
export function parseOpenGraph(html: string, url: string): LinkPreview | null {
  const head = html.slice(0, 256 * 1024);
  const meta = (key: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']*)["']|<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${key}["']`,
      "i",
    );
    const m = head.match(re);
    return m ? (m[1] ?? m[2] ?? "") : "";
  };
  const clean = (s: string, max: number) => {
    const text = decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  };

  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const title = clean(meta("og:title") || meta("twitter:title") || titleTag, 140);
  if (!title) return null;

  const description = clean(meta("og:description") || meta("twitter:description") || meta("description"), 220) || null;
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const site = clean(meta("og:site_name"), 60) || host;
  return { url, site, title, description };
}

function decodeEntities(s: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      // Control characters and anything past Unicode are dropped rather than
      // rendered.
      return Number.isFinite(n) && n >= 32 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return named[code.toLowerCase()] ?? whole;
  });
}

/** Whether an address is somewhere on the public internet, as opposed to this
 * machine, a private network, or the cloud metadata service a server-side
 * fetch is classically tricked into reading.
 *
 * Fetching a link preview is fetching a URL a household member chose, from
 * our server. Without this, "http://169.254.169.254/latest/meta-data/" or
 * "http://localhost:3000/api/…" in a message would have our server read it on
 * their behalf. Every hop of a redirect is checked too, since a public URL
 * that redirects to a private one is the usual way around a check made once.
 */
export function isPublicAddress(address: string): boolean {
  const v4 = (a: string) => {
    const p = a.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a0, a1] = p;
    if (a0 === 0 || a0 === 10 || a0 === 127) return false;
    if (a0 === 100 && a1 >= 64 && a1 <= 127) return false; // carrier-grade NAT
    if (a0 === 169 && a1 === 254) return false; // link-local, and the metadata service
    if (a0 === 172 && a1 >= 16 && a1 <= 31) return false;
    if (a0 === 192 && a1 === 168) return false;
    if (a0 === 192 && a1 === 0 && (p[2] === 0 || p[2] === 2)) return false;
    if (a0 === 198 && (a1 === 18 || a1 === 19)) return false; // benchmarking
    if (a0 === 198 && a1 === 51 && p[2] === 100) return false;
    if (a0 === 203 && a1 === 0 && p[2] === 113) return false;
    if (a0 >= 224) return false; // multicast and reserved
    return true;
  };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) return v4(address);

  const a = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!a.includes(":")) return false;
  // An IPv4 address wearing IPv6 clothes is judged as the IPv4 address.
  const embedded = a.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) return v4(embedded[1]);
  if (a === "::" || a === "::1") return false;
  if (/^f[cd]/.test(a)) return false; // unique local, fc00::/7
  if (/^fe[89ab]/.test(a)) return false; // link-local, fe80::/10
  if (/^ff/.test(a)) return false; // multicast
  if (/^2001:0?db8:/.test(a)) return false; // documentation
  if (/^::ffff:/.test(a)) return false; // mapped, in a form not matched above
  return true;
}
