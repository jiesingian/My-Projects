/** Password health in the Vault (19 October): after unlocking, which of the
 * household's passwords are used twice, easy to guess, or in a known breach.
 *
 * All of it happens on the phone, on the passwords the unlocked page already
 * holds. The breach check is Have I Been Pwned's range API, which Jonathan
 * approved for exactly its k-anonymity: the phone SHA-1s the password and
 * sends only the first five hex characters of the hash; the service answers
 * with every breached hash that starts that way (hundreds), padded with fake
 * ones so even the size of the answer says nothing, and the phone looks for
 * its own among them. Neither the password nor its full hash leaves the
 * phone, and nothing about the result is stored anywhere -- it is worked out
 * again each time the vault is opened.
 *
 * A door or gate code is a short run of digits by design, and every four-
 * digit number is in some breach list, so a code is only flagged when it is
 * reused or plainly guessable (1234, 0000), never as "breached" or "short". */

export const PWNED_RANGE_URL = "https://api.pwnedpasswords.com/range/";

export type HealthItem = { id: string; label: string; secret: string };
export type Finding = { id: string; label: string; reasons: string[] };

/** Digits only and no longer than a PIN: a code, not a password. */
export function isCode(secret: string): boolean {
  return /^\d{1,8}$/.test(secret);
}

// The handful everybody tries first. Lowercased; compared lowercased.
const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "qwerty", "qwerty123", "qwertyuiop", "abc123", "abcd1234",
  "iloveyou", "letmein", "welcome", "welcome1", "admin", "admin123", "monkey", "dragon", "sunshine", "princess",
  "football", "baseball", "master", "shadow", "superman", "michael", "jesus", "loveyou", "mahalkita", "iloveu",
  "123qwe", "1q2w3e4r", "zaq12wsx", "changeme", "default", "guest", "wifi", "wifipassword", "pldthomefiber",
]);

/** Each character one more (or one less) than the last: "1234", "abcd", "9876". */
function isRun(s: string): boolean {
  if (s.length < 3) return false;
  const step = s.charCodeAt(1) - s.charCodeAt(0);
  if (step !== 1 && step !== -1) return false;
  for (let i = 2; i < s.length; i++) if (s.charCodeAt(i) - s.charCodeAt(i - 1) !== step) return false;
  return true;
}

/** Why a password or code is easy to guess, or null when it isn't. */
export function weakness(secret: string): string | null {
  const s = secret.trim();
  const lower = s.toLowerCase();
  if (/^(.)\1*$/.test(s) || isRun(lower)) return "Easy to guess";
  if (isCode(s)) return ["123123", "121212", "112233", "123321", "696969"].includes(s) ? "Easy to guess" : null;
  if (COMMON.has(lower) || COMMON.has(lower.replace(/[!.?]+$/, ""))) return "One of the first passwords anyone tries";
  if (s.length < 8) return "Short -- 12 or more characters is much harder to guess";
  // One kind of character and not long: "sunflower" falls to a dictionary.
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(s)).length;
  if (kinds === 1 && s.length < 12) return "Short -- 12 or more characters is much harder to guess";
  return null;
}

/** Items that share a password with another, keyed by item id, with the
 * other labels: "Also used for Netflix". */
export function reuse(items: HealthItem[]): Map<string, string[]> {
  const bySecret = new Map<string, HealthItem[]>();
  for (const i of items) {
    if (!i.secret) continue;
    bySecret.set(i.secret, [...(bySecret.get(i.secret) ?? []), i]);
  }
  const out = new Map<string, string[]>();
  for (const group of bySecret.values()) {
    if (group.length < 2) continue;
    for (const i of group) out.set(i.id, group.filter((o) => o.id !== i.id).map((o) => o.label));
  }
  return out;
}

/** "Also used for Netflix", "Also used for Netflix and Globe". */
export function reuseReason(others: string[]): string {
  const names = others.length <= 2 ? others.join(" and ") : `${others.slice(0, 2).join(", ")} and ${others.length - 2} more`;
  return `Also used for ${names}`;
}

/** Upper-case hex SHA-1, the form the range API speaks. Web Crypto, so the
 * same code runs on the phone and in the tests. */
export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** The only part of the hash that is ever sent: its first five characters. */
export function rangePrefix(hash: string): string {
  return hash.slice(0, 5);
}

/** How many times the breach lists have seen this hash, from the range
 * answer ("SUFFIX:COUNT" lines). Padding lines have a count of 0. */
export function breachCount(rangeBody: string, hash: string): number {
  const suffix = hash.slice(5).toUpperCase();
  for (const line of rangeBody.split(/\r?\n/)) {
    const [s, n] = line.trim().split(":");
    if (s?.toUpperCase() === suffix) return Number(n) || 0;
  }
  return 0;
}

/** "Seen in known data breaches" with a rough count, never alarming. */
export function breachReason(count: number): string {
  const times = count >= 1_000_000 ? "millions of times" : count >= 1000 ? `${Math.floor(count / 1000).toLocaleString("en-US")},000+ times` : `${count} time${count === 1 ? "" : "s"}`;
  return `Seen in known data breaches (${times}), so it's on the lists people try`;
}

/** Everything about the household's passwords except the breach check,
 * which needs the network. `breached` is item id -> breach count. Items with
 * nothing to say are left out; the order is the vault's own. */
export function findings(items: HealthItem[], breached: Map<string, number> = new Map()): Finding[] {
  const reused = reuse(items);
  const out: Finding[] = [];
  for (const i of items) {
    const reasons: string[] = [];
    const weak = weakness(i.secret);
    const n = breached.get(i.id) ?? 0;
    if (n > 0) reasons.push(breachReason(n));
    else if (weak) reasons.push(weak);
    const others = reused.get(i.id);
    if (others) reasons.push(reuseReason(others));
    if (reasons.length) out.push({ id: i.id, label: i.label, reasons });
  }
  return out;
}

/** Which items go to the breach check: passwords, not codes. One request
 * per distinct hash prefix, so a password used twice is asked about once. */
export function breachCandidates(items: HealthItem[]): HealthItem[] {
  return items.filter((i) => i.secret && !isCode(i.secret.trim()));
}
