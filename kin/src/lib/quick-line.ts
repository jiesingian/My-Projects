import { addDays, weekdayOf, familyMidnight } from "@/lib/time";
import { UNITS, guessSection } from "@/lib/grocery";

/** One-line add (Today's Quick add, the Planner's Add sheet): a sentence like
 * "Ben dentist Tue 3pm" or "buy rice 2kg" read into the item it describes.
 *
 * Rules, not AI, on purpose: it is free, instant, works offline, and a person
 * can predict it. Whatever it reads is shown before anything is saved, so a
 * wrong guess costs one look, not a wrong row. The rules, in order:
 *
 *   1. A time ("3pm", "15:00", "at 3", "noon", "3-4pm") and a day ("today",
 *      "tomorrow", "Tue", "next Fri", "Oct 12", "12 Oct", "in 3 days") are
 *      taken out of the sentence wherever they are.
 *   2. Shopping: it starts with buy/get/need/grab/pick up, or ends with "to
 *      the list" -- and there is no day, no time and nobody's name in it
 *      ("get Ben from school 3pm" is a task, not groceries).
 *   3. Event: birthday, anniversary, trip/flight/vacation -- the all-day
 *      things the Events tab holds. A time in it is kept as the note.
 *   4. Anything else is a task (appointments, school, work).
 *
 * A day name means the next one on or after the starting day ("Tue" typed on
 * a Tuesday is that day); "next Tue" means strictly after it. A month date
 * already gone this year means next year. "at 3" with no am/pm means the
 * afternoon for 1 to 7, the morning otherwise -- nobody books a dentist at 3am.
 */

export type QuickMember = { id: string; name: string };

export type QuickParse =
  | { kind: "shopping"; name: string; quantity: number | null; unit: string | null; section: string }
  | { kind: "task"; title: string; date: string; from: string | null; to: string | null; who: string[]; wholeFamily: boolean }
  | { kind: "event"; title: string; date: string; eventKind: string; note: string | null; who: string[]; wholeFamily: boolean };

const WEEKDAYS: [RegExp, number][] = [
  [/^sun(day)?$/, 0],
  [/^mon(day)?$/, 1],
  [/^tue(s|sday)?$/, 2],
  [/^wed(nesday)?$/, 3],
  [/^thu(r|rs|rsday)?$/, 4],
  [/^fri(day)?$/, 5],
  [/^sat(urday)?$/, 6],
];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const EVENT_WORDS: [RegExp, string][] = [
  [/\b(birthday|bday|b-day)\b/i, "birthday"],
  [/\banniversary\b/i, "anniversary"],
  [/\b(trip|travel|flight|vacation|getaway)\b/i, "travel"],
];

const SHOP_LEAD = /^(buy|get|need|grab|pick up)\s+/i;
const SHOP_TAIL = /\s+(to|on) (the )?(shopping |grocery )?list$/i;
const FAMILY_WORDS = /\b(everyone|everybody|whole family|the family|all of us)\b/i;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function weekdayIndex(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, "");
  for (const [re, i] of WEEKDAYS) if (re.test(w)) return i;
  return null;
}

function realDay(y: number, m: number, d: number): string | null {
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return familyMidnight(iso) ? iso : null;
}

/** Takes the first match of `re` out of `text`, leaving single spaces. */
function cut(text: string, re: RegExp): { rest: string; m: RegExpExecArray | null } {
  const m = re.exec(text);
  if (!m) return { rest: text, m: null };
  return { rest: (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim(), m };
}

function clock(h: number, min: number, mer: string | undefined, bare: boolean): string | null {
  if (min > 59) return null;
  const ap = mer?.toLowerCase().replace(/\./g, "");
  if (ap === "pm" || ap === "p") {
    if (h < 1 || h > 12) return null;
    h = h === 12 ? 12 : h + 12;
  } else if (ap === "am" || ap === "a") {
    if (h < 1 || h > 12) return null;
    h = h === 12 ? 0 : h;
  } else if (bare && h >= 1 && h <= 7) {
    h += 12;
  }
  if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

function takeTime(text: string): { rest: string; from: string | null; to: string | null } {
  // A range first, so "3-4pm" is not read as "3" and a stray "4pm".
  const range = cut(text, /\b(?:from\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|until)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i);
  if (range.m) {
    const [, h1, m1, ap1, h2, m2, ap2] = range.m;
    const to = clock(Number(h2), Number(m2 ?? 0), ap2, false);
    // "3-4pm": the start borrows the end's pm when it has none of its own and
    // would otherwise land after it.
    let from = clock(Number(h1), Number(m1 ?? 0), ap1 ?? ap2, false);
    if (!ap1 && from && to && from > to) from = clock(Number(h1), Number(m1 ?? 0), "am", false);
    if (from && to) return { rest: range.rest, from, to };
  }
  const noon = cut(text, /\b(?:at\s+)?(noon|midday)\b/i);
  if (noon.m) return { rest: noon.rest, from: "12:00", to: null };
  const withMer = cut(text, /\b(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s|$|[,.!?])/i);
  if (withMer.m) {
    const t = clock(Number(withMer.m[1]), Number(withMer.m[2] ?? 0), withMer.m[3], false);
    if (t) return { rest: withMer.rest, from: t, to: null };
  }
  const h24 = cut(text, /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24.m) {
    const t = clock(Number(h24.m[1]), Number(h24.m[2]), undefined, false);
    if (t) return { rest: h24.rest, from: t, to: null };
  }
  const bareAt = cut(text, /\bat\s+(\d{1,2})(?:[:.](\d{2}))?\b(?!\s*(kg|g|l|ml|pc|pcs|%))/i);
  if (bareAt.m) {
    const t = clock(Number(bareAt.m[1]), Number(bareAt.m[2] ?? 0), undefined, true);
    if (t) return { rest: bareAt.rest, from: t, to: null };
  }
  return { rest: text, from: null, to: null };
}

function takeDay(text: string, today: string): { rest: string; date: string | null; evening: boolean } {
  const rel = cut(text, /\b(?:on\s+)?(today|tonight|this evening|tomorrow|tmrw|tmr|tom)\b/i);
  if (rel.m) {
    const w = rel.m[1].toLowerCase();
    const evening = w === "tonight" || w === "this evening";
    return { rest: rel.rest, date: w.startsWith("tod") || evening ? today : addDays(today, 1), evening };
  }
  const inDays = cut(text, /\bin\s+(\d{1,2})\s+days?\b/i);
  if (inDays.m) return { rest: inDays.rest, date: addDays(today, Number(inDays.m[1])), evening: false };
  const inWeek = cut(text, /\bnext week\b/i);
  if (inWeek.m) return { rest: inWeek.rest, date: addDays(today, 7), evening: false };

  const [ty, tm, td] = today.split("-").map(Number);
  const monthDate = (mon: string, day: number) => {
    const m = MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1;
    const thisYear = realDay(ty, m, day);
    if (!thisYear) return null;
    return thisYear >= today ? thisYear : realDay(ty + 1, m, day);
  };
  const md = cut(text, new RegExp(`\\b(?:on\\s+)?${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"));
  if (md.m) {
    const date = monthDate(md.m[1], Number(md.m[2]));
    if (date) return { rest: md.rest, date, evening: false };
  }
  const dm = cut(text, new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b\\.?`, "i"));
  if (dm.m) {
    const date = monthDate(dm.m[2], Number(dm.m[1]));
    if (date) return { rest: dm.rest, date, evening: false };
  }
  const nth = cut(text, /\bon the (\d{1,2})(?:st|nd|rd|th)\b/i);
  if (nth.m) {
    const d = Number(nth.m[1]);
    const thisMonth = realDay(ty, tm, d);
    const date = thisMonth && d >= td ? thisMonth : tm === 12 ? realDay(ty + 1, 1, d) : realDay(ty, tm + 1, d);
    if (date) return { rest: nth.rest, date, evening: false };
  }

  const wd = cut(text, /\b(?:on\s+)?(next|this)?\s*(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b\.?/i);
  if (wd.m) {
    const target = weekdayIndex(wd.m[2]);
    const now = weekdayOf(today);
    if (target !== null && now !== null) {
      let ahead = (target - now + 7) % 7;
      if (wd.m[1]?.toLowerCase() === "next" && ahead === 0) ahead = 7;
      return { rest: wd.rest, date: addDays(today, ahead), evening: false };
    }
  }
  return { rest: text, date: null, evening: false };
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPeople(text: string, members: QuickMember[]): string[] {
  const ids: string[] = [];
  for (const m of members) {
    const first = firstName(m.name);
    if (first.length < 2) continue;
    if (new RegExp(`(^|[^\\p{L}])${escapeRe(first)}('s)?(?![\\p{L}])`, "iu").test(text)) ids.push(m.id);
  }
  return ids;
}

function tidyTitle(text: string): string {
  const t = text
    .replace(/\s+(on|at|by|for)$/i, "")
    .replace(/^(on|at)\s+/i, "")
    .replace(/[\s,;-]+$/g, "")
    .replace(/^[\s,;-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

const UNIT_ALIASES: Record<string, string> = {
  kgs: "kg", kilo: "kg", kilos: "kg", grams: "g", gram: "g", gr: "g",
  l: "L", liter: "L", liters: "L", litre: "L", litres: "L", ml: "mL",
  pcs: "pc", piece: "pc", pieces: "pc", packs: "pack", cans: "can", bottles: "bottle",
  jars: "jar", boxes: "box", sachets: "sachet", bundles: "bundle", trays: "tray", sacks: "sack", tubs: "tub",
};

function unitOf(word: string): string | null {
  const w = word.toLowerCase();
  const exact = UNITS.find((u) => u.toLowerCase() === w);
  return exact ?? UNIT_ALIASES[w] ?? null;
}

function readShopping(text: string): { name: string; quantity: number | null; unit: string | null } {
  let rest = text;
  let quantity: number | null = null;
  let unit: string | null = null;
  // "2kg", "2 kg", "x12", "12x", "a dozen" -- anywhere in the line.
  const qty = /(?:^|\s)(?:x\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*x|(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?|(a|one)\s+(dozen))(?=\s|$)/i.exec(rest);
  if (qty) {
    const n = qty[1] ?? qty[2] ?? qty[3];
    const u = qty[4] ? unitOf(qty[4]) : qty[6] ? "dozen" : null;
    // "3 eggs": the word after the number is the item, not a unit, so only
    // the number comes out.
    const consumed = qty[4] && !u ? qty[0].slice(0, qty[0].indexOf(qty[3]) + qty[3].length) : qty[0];
    quantity = n ? Number(n) : 1;
    unit = u;
    rest = (rest.slice(0, qty.index) + " " + rest.slice(qty.index + consumed.length)).replace(/\s+/g, " ").trim();
  }
  rest = rest.replace(/^(of|some)\s+/i, "").replace(/\s+of\s*$/i, "");
  return { name: tidyTitle(rest), quantity, unit };
}

/** Reads one line. `today` and `defaultDate` are plain YYYY-MM-DD in the
 * household's zone; `defaultDate` is the day a line with no day lands on (the
 * Planner passes the day being looked at). Returns null for an empty line. */
export function parseQuickLine(input: string, opts: { today: string; defaultDate?: string; members: QuickMember[]; meId?: string }): QuickParse | null {
  const raw = input.replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const t = takeTime(raw);
  const d = takeDay(t.rest, opts.today);
  let rest = d.rest;
  const from = t.from ?? (d.evening ? "19:00" : null);
  const hasWhen = !!(t.from || d.date);
  const who = findPeople(raw, opts.members);
  const wholeFamily = FAMILY_WORDS.test(raw);

  const shopLead = SHOP_LEAD.test(raw);
  const shopTail = SHOP_TAIL.test(raw);
  if ((shopLead || shopTail) && !hasWhen && who.length === 0 && !wholeFamily) {
    const item = readShopping(raw.replace(SHOP_LEAD, "").replace(SHOP_TAIL, ""));
    if (item.name) return { kind: "shopping", ...item, section: guessSection(item.name) };
  }

  if (wholeFamily) rest = rest.replace(FAMILY_WORDS, " ").replace(/\s+/g, " ").trim();
  const date = d.date ?? opts.defaultDate ?? opts.today;
  const forWho = wholeFamily ? [] : who.length > 0 ? who : opts.meId ? [opts.meId] : [];
  const title = tidyTitle(rest) || "Untitled";

  for (const [re, eventKind] of EVENT_WORDS) {
    if (re.test(raw)) {
      const note = from ? `at ${from}${t.to ? `–${t.to}` : ""}` : null;
      return { kind: "event", title, date, eventKind, note, who: forWho, wholeFamily };
    }
  }
  return { kind: "task", title, date, from, to: t.to, who: forWho, wholeFamily };
}

/** "15:00" as "3:00 pm", the way the preview reads it back. */
export function readableClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${ap}`;
}
