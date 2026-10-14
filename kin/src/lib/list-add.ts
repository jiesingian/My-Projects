import { guessSection } from "@/lib/grocery";
import { readShopping } from "@/lib/quick-line";

/** "Hey Siri, add rice to Kin": what an iPhone Shortcut heard, read into
 * things for the shopping list, and the sentence it says back.
 *
 * The Shortcut asks "What do you need?", sends the answer to the member's
 * private add-to-list link (api/list-add), and speaks whatever comes back.
 * People answer the way they talk, so the words are split on commas, "and",
 * and the Filipino "at", "saka" and "tsaka": "rice 2kg, eggs at milk" is
 * three things. Each piece is then read by the same rules as one-line add
 * (quick-line.ts), so "2 kilos of rice" and "rice 2kg" land the same way, and
 * filed under a market section the way adding in the app files it.
 *
 * Rules, not AI, the same as one-line add: free, instant, and predictable.
 * The price is "mac and cheese" arriving as two things, which a person fixes
 * on the list in one tap. */

/** The most one send adds, and the most words it reads. The database holds
 * the same item limit (add_to_list_by_link) without trusting this file. */
export const LIST_ADD_MAX_ITEMS = 20;
export const LIST_ADD_MAX_CHARS = 500;

export type ListAddItem = { name: string; quantity: number | null; unit: string | null; section: string };

// "Add …", "We need …", "Pabili ng …": the asking, not the thing.
const LEAD = /^(?:(?:please|pls|hey kin|kin)[,\s]+)?(?:(?:can you|could you)\s+)?(?:add|buy|get|grab|pick up|we need|i need|need|we(?:'re| are) out of|out of|pabili(?:\s+ng)?|bili(?:\s+ng)?)\s+/i;
// "… to the list", "… to Kin", "… sa listahan".
const TAIL = /(?:^|\s+)(?:(?:to|on|onto)\s+(?:the\s+|my\s+|our\s+)?(?:shopping\s+|grocery\s+)?(?:list|kin)|sa\s+(?:listahan|lista))$/i;
// Where one thing ends and the next begins. "&" and "+" only with spaces
// round them, so "S&R hotdogs" and "M&M's" stay one thing.
const SPLIT = /\s*[,;]\s*|\s+[&+]\s+|\s+(?:and|at|saka|tsaka|pati|plus)\s+/i;
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/** One spoken piece as an item, or null when nothing is left of it. */
function readPiece(piece: string): ListAddItem | null {
  let text = piece
    .replace(/^(?:and|at|also|then|saka|tsaka)\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
  if (!text) return null;
  // Dictation writes small numbers as words: "two dozen eggs".
  text = text.replace(/^([a-z]+)(?=\s)/i, (w) => (NUMBER_WORDS[w.toLowerCase()] ? String(NUMBER_WORDS[w.toLowerCase()]) : w));
  // "A kilo of rice" is one kilo; "a banana" is just a banana.
  let read = readShopping(text);
  const article = /^an?\s+/i;
  if (article.test(text)) {
    const counted = readShopping(text.replace(article, "1 "));
    read = counted.unit ? counted : readShopping(text.replace(article, ""));
  }
  // By character, not UTF-16 unit, so an emoji at the cut isn't split in half
  // (half an emoji is not valid JSON for the database).
  const name = Array.from(read.name).slice(0, 150).join("").trim();
  if (!name) return null;
  // The database drops a quantity of 0 or past 10,000; drop it here too, so
  // what the iPhone says back is what was saved.
  const quantity = read.quantity !== null && read.quantity > 0 && read.quantity <= 10000 ? read.quantity : null;
  return { name, quantity, unit: quantity === null ? null : read.unit, section: guessSection(name) };
}

/** What was said, as items: duplicates (by name) kept once, and at most
 * LIST_ADD_MAX_ITEMS of them. `extra` is how many more there were. */
export function readSpokenList(spoken: string): { items: ListAddItem[]; extra: number } {
  const text = spoken
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(LEAD, "")
    .replace(TAIL, "");
  const items: ListAddItem[] = [];
  const seen = new Set<string>();
  for (const piece of text.split(SPLIT)) {
    const item = readPiece(piece);
    if (!item) continue;
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return { items: items.slice(0, LIST_ADD_MAX_ITEMS), extra: Math.max(0, items.length - LIST_ADD_MAX_ITEMS) };
}

// Units as they are said, one and many: the iPhone reads "pc" as "P C".
const SPOKEN_UNITS: Record<string, [string, string]> = {
  pc: ["piece", "pieces"], kg: ["kilo", "kilos"], g: ["gram", "grams"], L: ["litre", "litres"], mL: ["millilitre", "millilitres"],
  box: ["box", "boxes"], dozen: ["dozen", "dozen"],
};

/** An item the way it is said back: "2 kilos of rice", "3 eggs", "milk". */
export function sayItem(item: Pick<ListAddItem, "name" | "quantity" | "unit">): string {
  // "Rice" reads back as "rice"; "SM bags" keeps its capitals.
  const name = /^[A-Z][a-z]/.test(item.name) ? item.name[0].toLowerCase() + item.name.slice(1) : item.name;
  if (item.quantity === null) return name;
  if (!item.unit) return `${item.quantity} ${name}`;
  const [one, many] = SPOKEN_UNITS[item.unit] ?? [item.unit, `${item.unit}s`];
  // "A dozen eggs", but "2 kilos of rice".
  return `${item.quantity} ${item.quantity === 1 ? one : many}${item.unit === "dozen" ? "" : " of"} ${name}`;
}

/** "rice", "rice and eggs", "rice, eggs and milk". */
export function joinSpoken(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The sentence the iPhone speaks after a send. `saved` is what the database
 * says it added; if it skipped any, the count is said instead of the names. */
export function addedSentence(items: ListAddItem[], saved: number, extra: number): string {
  if (saved <= 0) return "Kin couldn't add that. Try saying it again, one thing at a time.";
  const what = saved === items.length ? joinSpoken(items.map(sayItem)) : `${saved} thing${saved === 1 ? "" : "s"}`;
  const more = extra > 0 ? ` That's the most at once, so ${extra} more ${extra === 1 ? "wasn't" : "weren't"} added. Say ${extra === 1 ? "it" : "them"} again.` : "";
  return `Added ${what} to the list.${more}`;
}

/** The words a Shortcut sent. Get Contents of URL can send JSON, a form or
 * plain text depending on how it was set up; any of them works, as long as
 * the words are in a field called "text" or are the whole body. */
export function shortcutText(body: string, contentType: string | null): string {
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("json")) {
    try {
      const v: unknown = JSON.parse(body);
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        if (typeof o.text === "string") return o.text;
        const first = Object.values(o).find((x) => typeof x === "string");
        return typeof first === "string" ? first : "";
      }
      return "";
    } catch {
      return "";
    }
  }
  if (type.includes("x-www-form-urlencoded")) return new URLSearchParams(body).get("text") ?? "";
  return body;
}
