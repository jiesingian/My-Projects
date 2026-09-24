/** What a pasted invitation link has to be before an event will keep it, and
 * how its site is named on the card. Pure, so the rules can be tested, and so
 * the server action and the card agree about both. */

const MAX_LENGTH = 2048;

/** A pasted link as it should be stored, or why it can't be.
 *
 * Forgiving about how it was pasted -- surrounding spaces, or "evite.com/abc"
 * with no https:// in front, which is how a link copied from an address bar
 * often arrives -- and strict about what it is: an http(s) address with a
 * real host and no login in it. Anything else, a javascript: URL above all,
 * would run or go somewhere unexpected when the card is tapped. */
export function normalizeInviteUrl(raw: string): { url: string | null; error: string | null } {
  const text = raw.trim();
  if (!text) return { url: null, error: null };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { url: null, error: "That invitation link doesn't look like a web address." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { url: null, error: "The invitation link has to be a web address (http or https)." };
  }
  if (!url.hostname.includes(".") || url.username || url.password) {
    return { url: null, error: "That invitation link doesn't look like a web address." };
  }
  const normalized = url.toString();
  if (normalized.length > MAX_LENGTH) return { url: null, error: "That invitation link is too long to keep." };
  return { url: normalized, error: null };
}

/** The site a link goes to, as the card names it: "evite.com", not
 * "www.evite.com". Always the real host, never the page's own og:site_name --
 * a card should say where tapping it actually takes you, and a page is free
 * to call itself anything. */
export function inviteHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
