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
