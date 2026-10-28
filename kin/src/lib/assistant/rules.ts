/** Ask Kin's rule layer (Jonathan, 28 October): the household's structured
 * questions answered from its own records with no model call, no API key and
 * no allowance use. Only what the rules cannot read goes on to Claude.
 *
 * Pure. `matchRule` takes the member's latest message, today in the
 * household's zone, the members' names and the currency, and says which
 * existing assistant tool to run with what input (tools.ts, the same
 * executors the model calls, so the same scoping to the household, kid view,
 * roles and health privacy applies -- there is no second path to the data)
 * and how to phrase the answer from the tool's result (`say`). Or null: the
 * route hands the question to the model, as before.
 *
 * Nothing here touches the network or the database; the route runs the tool.
 * The logic spec (e2e/assistant-rules.logic.spec.ts) holds every shape below
 * to the tool and input it must resolve to, the relative dates, the names,
 * and the phrasings that must stay the model's. A rule added here gets a
 * line there. */

import { addDays, weekdayOf, readableDay, daysBetween, familyClock, familyTime } from "@/lib/time";
import { formatCurrency } from "@/lib/format";
import { EXPENSE_CATEGORIES, GOAL_CATEGORY, TRANSFER_CATEGORY } from "@/lib/wealth";
import { UNITS, formatQuantity, guessSection } from "@/lib/grocery";
import { parseQuickLine, readShopping } from "@/lib/quick-line";

export type Lang = "en" | "tl";

export type RuleContext = {
  /** YYYY-MM-DD in the household's zone (familyDay). */
  today: string;
  /** Full names of the household's members, as get_family would list them. */
  members: string[];
  /** The household's currency code, e.g. "PHP". */
  currency: string;
  /** Whether the asker may hear health details (mayAskHealth): a grown-up
   * who is not in kid view. A health question from anyone else is never a
   * rule's to answer; it returns null. */
  canAskHealth: boolean;
  /** The household's zone, for the times in a schedule answer. */
  timeZone?: string;
  /** The asker's full name: who an activity with nobody named is for, as
   * Today's one-line add does it. Absent, it is the whole family's. */
  me?: string;
  /** The clock, for "what time is it". Absent, only the date is answered. */
  now?: Date;
};

/** What a rule remembers between a question of its own and the answer
 * (28 October, second PR): which rule asked, the slots it already has, and
 * the language. The console sends it back with the member's next message;
 * `resumeRule` finishes the job. Slots come back from the client, so they
 * are read as loosely as a model's tool input: the tool validates them. */
export type Pending = { rule: string; slots: Record<string, string | number>; lang: Lang; asked: number };

/** A rule that needs one more detail, or a choice between records, asks for
 * it instead of guessing or handing the question to the model. `choices`
 * are shown as chips; a free-text answer works too. */
export type Ask = { ask: string; choices?: string[]; pending: Pending };

export type RuleMatch = {
  /** Which rule matched, for the spec and the logs. */
  rule: string;
  /** The assistant tool to run (ASSISTANT_TOOLS by name) ... */
  tool: string;
  /** ... with this input, as the model would have passed it. */
  input: Record<string, unknown>;
  /** The reply, phrased from the tool's parsed JSON result, in the member's
   * language. A tool's `{ error }` is relayed as it is: the tools already
   * speak plainly. When the result holds two records that both answer
   * ("Globe Fiber" and "Globe Postpaid"), an Ask with the choices instead. */
  say: (result: unknown) => string | Ask;
  lang: Lang;
};

export type RuleOutcome = RuleMatch | Ask;

export function isAsk(outcome: RuleOutcome | string | null | undefined): outcome is Ask {
  return !!outcome && typeof outcome === "object" && "ask" in outcome;
}

/* ------------------------------------------------------------------ words */

/** Words that mark Filipino or Taglish. One is enough: a member who writes
 * "magkano ang Meralco" hears back the way a relative texts. */
const TAGALOG_MARKERS = [
  "magkano", "kailan", "kelan", "ano", "anong", "anu", "sino", "sinong", "saan", "nasaan", "ilan", "ilang",
  "ba", "ng", "ni", "kay", "sa", "ang", "mga", "natin", "namin", "ko", "niya", "nila", "kami", "tayo",
  "bukas", "ngayon", "ngayong", "kahapon", "linggo", "buwan", "araw", "susunod", "makalawa",
  "gastos", "nagastos", "ginastos", "bayad", "bayaran", "babayaran", "utang", "pera", "laman", "natitira", "natira",
  "ulam", "hapunan", "tanghalian", "almusal", "listahan", "bilihin", "pabili", "pakibili",
  "pa-add", "paadd", "paki-add", "pakiadd", "idagdag", "dagdag", "pakidagdag", "dagdagan",
  "meron", "mayroon", "wala", "walang", "lakad", "pamilya", "kaarawan", "gamot", "doktor",
  "pamasahe", "kuryente", "tubig", "upa", "regalo", "nasa", "para", "kasi", "lang", "na", "pa", "din", "rin",
];

const WEEKDAYS_EN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAYS_TL = ["linggo", "lunes", "martes", "miyerkules", "huwebes", "biyernes", "sabado"];
const WEEKDAY_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTHS_TL = ["enero", "pebrero", "marso", "abril", "mayo", "hunyo", "hulyo", "agosto", "setyembre", "oktubre", "nobyembre", "disyembre"];
const MONTH_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Each spending category, with the words a family uses for it. Saved
 * category names never change (lib/wealth.ts), so this list is stable. */
const CATEGORY_WORDS: Record<(typeof EXPENSE_CATEGORIES)[number], string[]> = {
  Groceries: ["groceries", "grocery", "supermarket", "sm", "puregold"],
  Market: ["market", "palengke", "talipapa", "wet market"],
  Dining: ["dining", "eating out", "restaurant", "restaurants", "food", "kain", "jollibee", "delivery"],
  Utilities: ["utilities", "utility", "electric", "electricity", "kuryente", "meralco", "water", "tubig", "internet", "wifi"],
  Housing: ["housing", "rent", "upa", "house", "bahay", "condo", "amortization"],
  Transport: ["transport", "transportation", "gas", "gasolina", "fuel", "grab", "commute", "pamasahe", "toll", "parking"],
  "Household help": ["household help", "kasambahay", "yaya", "helper", "driver"],
  Health: ["health", "medical", "medicine", "medicines", "gamot", "doctor", "doktor", "hospital", "clinic"],
  Education: ["education", "school", "tuition", "eskwela", "paaralan", "books"],
  "Kids & baby": ["kids", "baby", "diapers", "formula", "toys"],
  "Personal care": ["personal care", "salon", "haircut", "toiletries", "skincare"],
  Shopping: ["shopping", "clothes", "damit", "shoes", "lazada", "shopee", "online"],
  Subscriptions: ["subscriptions", "subscription", "netflix", "spotify", "streaming"],
  Entertainment: ["entertainment", "movies", "cinema", "games", "fun"],
  Travel: ["travel", "trip", "trips", "vacation", "flights", "hotel", "biyahe"],
  Insurance: ["insurance", "hmo", "premium"],
  Debt: ["debt", "loan", "loans", "utang", "credit card"],
  "Family support": ["family support", "padala", "allowance to family", "support"],
  "Church & donations": ["church", "donations", "donation", "simbahan", "tithes", "offering"],
  Gifts: ["gifts", "gift", "regalo", "aguinaldo", "presents"],
  Pets: ["pets", "pet", "dog", "cat", "aso", "pusa", "vet"],
  "Bank & service fees": ["fees", "bank fees", "service fees", "charges"],
  Other: ["other", "others", "misc", "miscellaneous"],
};

/** What a household calls its bills, so "kuryente" finds "Meralco" among the
 * unpaid bills. Only for matching a question to a bill's name. */
const BILL_WORDS: string[][] = [
  ["electric", "electricity", "kuryente", "meralco", "ilaw", "light", "power"],
  ["water", "tubig", "maynilad", "manila water", "primewater"],
  ["internet", "wifi", "pldt", "globe", "converge", "sky", "fiber", "broadband"],
  ["phone", "cellphone", "mobile", "postpaid", "load", "plan"],
  ["rent", "upa", "renta"],
  ["gas", "lpg", "gasul"],
  ["tuition", "school", "eskwela"],
  ["credit card", "card", "cc", "bpi card", "visa", "mastercard"],
  ["insurance", "hmo", "premium"],
  ["cable", "tv"],
  ["association", "hoa", "dues", "condo dues"],
];

/** The category a bill most likely files under, from the words a household
 * uses for it (BILL_WORDS), when the message named none. */
function billCategory(name: string): (typeof EXPENSE_CATEGORIES)[number] | null {
  const words = name.toLowerCase().split(/\s+/);
  const index = BILL_WORDS.findIndex((g) => g.some((w) => words.includes(w) || name.toLowerCase() === w));
  if (index < 0) return null;
  const first = BILL_WORDS[index][0];
  if (first === "rent") return "Housing";
  if (first === "tuition") return "Education";
  if (first === "credit card") return "Debt";
  if (first === "insurance") return "Insurance";
  return "Utilities";
}

/* ------------------------------------------------------------------ setup */

type Query = {
  raw: string;
  /** Lowercase, apostrophes and punctuation normalised, spaces collapsed. */
  text: string;
  words: string[];
  lang: Lang;
};

/** Short forms and the spellings a thumb produces, put back into the words
 * the rules know (28 October, fifth PR). Whole words only, so "n" between
 * two items is "and" but "n" inside a word is left alone. */
const SPELLINGS: [RegExp, string][] = [
  [/\b(tmrw|tmr|tom|2moro|tomorow|tommorow|tomorro)\b/g, "tomorrow"],
  [/\b(tdy|2day)\b/g, "today"],
  [/\bwk\b/g, "week"],
  [/\b(wat|wats|whats|wht)\b/g, "what is"],
  [/\b(wen|whn)\b/g, "when"],
  [/\b(wer|whr)\b/g, "where"],
  [/\b(hw much|hm|hmuch)\b/g, "how much"],
  [/\b(sked|sched|skedyul|iskedyul)\b/g, "schedule"],
  [/\b(pls|plz|pz)\b/g, "please"],
  [/\b(bday|b-day|bdae)\b/g, "birthday"],
  [/\b(meds|gamots)\b/g, "medicines"],
  [/\bn\b/g, "and"],
  [/\b(nasan|nsan)\b/g, "nasaan"],
  [/\b(san|saan ba)\b/g, "saan"],
  [/\b(anung|anu|ano ba|anong ba|anung ba)\b/g, "ano"],
  [/\b(magkno|mgkano|mgkno|magkanu)\b/g, "magkano"],
  [/\b(kelan|kelan ba|kailan ba)\b/g, "kailan"],
  [/\b(ung|yng)\b/g, "yung"],
  [/\b(nmn|nman)\b/g, "naman"],
  [/\b(bkit)\b/g, "bakit"],
  [/\b(pano|paano ba)\b/g, "paano"],
  [/\b(sinu|cno)\b/g, "sino"],
  [/\b(d2|dto)\b/g, "dito"],
  [/\b(ngaun|ngyon|ngayn)\b/g, "ngayon"],
  [/\b(bkas|bukas na)\b/g, "bukas"],
  [/\b(lst)\b/g, "list"],
  [/\b(groc|grocer)\b/g, "grocery"],
  [/\bbal\b/g, "balance"],
  [/\b(acct|accnt)\b/g, "account"],
];

function normalise(message: string): string {
  let text = message
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\b(what|wat)'s\b/g, "what is")
    .replace(/\bwhen's\b/g, "when is")
    .replace(/\bwho's\b/g, "who is")
    .replace(/\bhow's\b/g, "how is")
    .replace(/\bwhere's\b/g, "where is")
    .replace(/[?!.]+$/g, "")
    .replace(/[?!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, word] of SPELLINGS) text = text.replace(re, word);
  return text.replace(/\s+/g, " ").trim();
}

function detectLang(text: string): Lang {
  const words = text.replace(/[^a-z0-9'\- ]/g, " ").split(/\s+/).filter(Boolean);
  return words.some((w) => TAGALOG_MARKERS.includes(w)) ? "tl" : "en";
}

function query(message: string): Query {
  const text = normalise(message);
  return { raw: message.trim(), text, words: text.split(" ").filter(Boolean), lang: detectLang(text) };
}

const has = (q: Query, re: RegExp) => re.test(q.text);

/* ------------------------------------------------------------------ dates */

export type DayRange = { from: string; to: string; label: { en: string; tl: string }; single: boolean };

function endOfMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function firstOfNextMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

/** Monday of the week `day` is in. */
function mondayOf(day: string): string {
  const w = weekdayOf(day) ?? 1;
  return addDays(day, -((w + 6) % 7)) ?? day;
}

function single(day: string, en: string, tl: string): DayRange {
  return { from: day, to: day, label: { en, tl }, single: true };
}

function dayLabel(day: string): string {
  return readableDay(day);
}

/** Which day or days a message names, from today. Nothing named: null, and
 * each rule decides its own default (a schedule question means today; a bills
 * question means every unpaid bill).
 *
 * "next Friday" is the Friday of next week; "Friday", "this Friday", "on
 * Friday", "sa Biyernes" are the coming Friday, today included. "This week"
 * runs from today to Sunday; "next week" Monday to Sunday; "this month" from
 * today to the month's end; "the 15th" is the next 15th, this month if it has
 * not passed. A month and day ("Nov 15", "15 Nobyembre") is this year unless
 * it has passed, then next year. */
export function resolveRange(text: string, today: string): DayRange | null {
  const t = ` ${text.toLowerCase()} `;
  // Two days or ranges joined ("today and tomorrow", "Monday to Friday",
  // "this month and next month", "Dec 20 to Dec 23"): one range, first to last.
  const dayWordsRe = `(?:today|tonight|tomorrow|bukas|ngayon|this week|next week|this month|next month|this weekend|${[...WEEKDAYS_EN, ...WEEKDAYS_TL, ...WEEKDAY_SHORT].join("|")}|(?:${[...MONTHS_EN, ...MONTHS_TL, ...MONTH_SHORT].join("|")})\\.? \\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}(?:st|nd|rd|th)? (?:ng |of )?(?:${[...MONTHS_EN, ...MONTHS_TL, ...MONTH_SHORT].join("|")})|the \\d{1,2}(?:st|nd|rd|th)|\\d{4}-\\d{2}-\\d{2})`;
  const span = new RegExp(`\\b(?:from |mula )?(${dayWordsRe})\\s+(?:and|at|to|until|hanggang|-|–)\\s+(?:next |this |the |sa )?(${dayWordsRe})\\b`).exec(t);
  if (span) {
    const a = resolveRange(span[1], today);
    const b = resolveRange(span[2], today);
    if (a && b && b.to >= a.from) {
      return { from: a.from, to: b.to, label: { en: `${a.label.en} to ${b.label.en}`, tl: `${a.label.tl} hanggang ${b.label.tl}` }, single: false };
    }
  }
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t);
  if (iso && addDays(iso[1], 0)) return single(iso[1], dayLabel(iso[1]), dayLabel(iso[1]));

  if (/\b(day after tomorrow|sa makalawa)\b/.test(t)) {
    const d = addDays(today, 2)!;
    return single(d, `the day after tomorrow (${dayLabel(d)})`, `sa makalawa (${dayLabel(d)})`);
  }
  if (/\b(tomorrow|tmrw|bukas)\b/.test(t)) {
    const d = addDays(today, 1)!;
    return single(d, `tomorrow (${dayLabel(d)})`, `bukas (${dayLabel(d)})`);
  }
  if (/\b(yesterday|kahapon)\b/.test(t)) {
    const d = addDays(today, -1)!;
    return single(d, `yesterday (${dayLabel(d)})`, `kahapon (${dayLabel(d)})`);
  }
  if (/\b(tonight|today|ngayon|ngayong araw|mamaya)\b/.test(t)) {
    return single(today, `today (${dayLabel(today)})`, `ngayon (${dayLabel(today)})`);
  }
  if (/\b(this weekend|the weekend|sa weekend|weekend)\b/.test(t)) {
    const w = weekdayOf(today) ?? 0;
    const sat = w === 0 ? today : addDays(today, (6 - w) % 7)!;
    const sun = w === 0 ? today : addDays(sat, 1)!;
    return { from: w === 6 || w === 0 ? today : sat, to: sun, label: { en: "this weekend", tl: "ngayong weekend" }, single: false };
  }
  if (/\b(next week|sa susunod na linggo|sa isang linggo|next wk)\b/.test(t)) {
    const from = addDays(mondayOf(today), 7)!;
    return { from, to: addDays(from, 6)!, label: { en: "next week", tl: "sa susunod na linggo" }, single: false };
  }
  if (/\b(this week|ngayong linggo|this wk|the week)\b/.test(t)) {
    const sunday = addDays(mondayOf(today), 6)!;
    return { from: today, to: sunday, label: { en: "this week", tl: "ngayong linggo" }, single: false };
  }
  if (/\b(next month|sa susunod na buwan|sa isang buwan)\b/.test(t)) {
    const from = firstOfNextMonth(today);
    return { from, to: endOfMonth(from), label: { en: "next month", tl: "sa susunod na buwan" }, single: false };
  }
  if (/\b(this month|ngayong buwan|the month)\b/.test(t)) {
    return { from: today, to: endOfMonth(today), label: { en: "this month", tl: "ngayong buwan" }, single: false };
  }

  // A month and a day, either order, in English or Filipino.
  const monthIndex = (word: string): number => {
    const w = word.replace(/\.$/, "");
    let i = MONTHS_EN.indexOf(w);
    if (i < 0) i = MONTHS_TL.indexOf(w);
    if (i < 0) i = MONTH_SHORT.indexOf(w.slice(0, 3));
    if (i < 0 && w.length >= 3) i = MONTHS_EN.findIndex((m) => m.startsWith(w));
    return i;
  };
  const monthWord = "(?:" + [...MONTHS_EN, ...MONTHS_TL, ...MONTH_SHORT].join("|") + ")\\.?";
  const md = new RegExp(`\\b(${monthWord})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(t) ?? new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:ng\\s+|of\\s+)?(${monthWord})\\b`).exec(t);
  if (md) {
    const [a, b] = [md[1], md[2]];
    const month = monthIndex(/^\d/.test(a) ? b : a);
    const dayNum = Number(/^\d/.test(a) ? a : b);
    if (month >= 0 && dayNum >= 1 && dayNum <= 31) {
      const year = Number(today.slice(0, 4));
      const make = (y: number) => `${y}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      let d = make(year);
      if (!addDays(d, 0)) return null;
      if (d < today) d = make(year + 1);
      if (!addDays(d, 0)) return null;
      return single(d, dayLabel(d), dayLabel(d));
    }
  }

  // A month on its own ("in May", "sa Nobyembre", "December"): the whole
  // month, this year's unless it has ended, then next year's. "May" needs a
  // preposition, being also the Filipino "there is".
  const bareMonth = new RegExp(`\\b(in|sa|ng|this|next|for|ngayong|of|during|susunod na)\\s+(${monthWord})\\b(?!\\s*\\d)`).exec(t) ?? new RegExp(`\\b((?:${[...MONTHS_EN, ...MONTHS_TL].filter((m) => m !== "may").join("|")}))\\b(?!\\s*\\d)`).exec(t);
  if (bareMonth) {
    const word = bareMonth[2] ?? bareMonth[1];
    const month = monthIndex(word);
    if (month >= 0) {
      const year = Number(today.slice(0, 4));
      const first = (y: number) => `${y}-${String(month + 1).padStart(2, "0")}-01`;
      let from = first(year);
      if (endOfMonth(from) < today) from = first(year + 1);
      const name = MONTHS_EN[month][0].toUpperCase() + MONTHS_EN[month].slice(1);
      const current = from.slice(0, 7) === today.slice(0, 7);
      return { from: current ? today : from, to: endOfMonth(from), label: { en: current ? "this month" : `in ${name}`, tl: current ? "ngayong buwan" : `sa ${name}` }, single: false };
    }
  }

  // "the 15th", "sa 15", "on the 15", "sa a-15": the next such day.
  const dom = /\b(?:the|on the|sa|sa a-|every|tuwing|a-)\s?(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*(?:kg|kilo|g|pcs?|%|k\b|,\d|\d))/.exec(t) ?? /\b(\d{1,2})(?:st|nd|rd|th)\b/.exec(t);
  if (dom) {
    const n = Number(dom[1]);
    if (n >= 1 && n <= 31) {
      const month = today.slice(0, 7);
      let d = `${month}-${String(n).padStart(2, "0")}`;
      if (!addDays(d, 0) || d < today) {
        const next = firstOfNextMonth(today).slice(0, 7);
        d = `${next}-${String(n).padStart(2, "0")}`;
      }
      if (addDays(d, 0)) return single(d, `the ${n}${ordinal(n)} (${dayLabel(d)})`, `sa ${n} (${dayLabel(d)})`);
    }
  }

  // A weekday, this week or next.
  const dayWord = "(?:" + [...WEEKDAYS_EN, ...WEEKDAYS_TL, ...WEEKDAY_SHORT].join("|") + ")";
  const wd = new RegExp(`\\b(next|this|on|sa|susunod na|every|tuwing)?\\s?(${dayWord})\\b`).exec(t);
  if (wd) {
    const w = wd[2];
    let i = WEEKDAYS_EN.indexOf(w);
    if (i < 0) i = WEEKDAYS_TL.indexOf(w);
    if (i < 0) i = WEEKDAY_SHORT.indexOf(w);
    if (i >= 0) {
      const todayW = weekdayOf(today) ?? 0;
      const ahead = (i - todayW + 7) % 7;
      const coming = addDays(today, ahead)!;
      const nextWeek = wd[1] === "next" || wd[1] === "susunod na";
      const d = nextWeek ? addDays(mondayOf(today), 7 + ((i + 6) % 7))! : coming;
      const name = WEEKDAYS_EN[i][0].toUpperCase() + WEEKDAYS_EN[i].slice(1);
      return single(d, `${nextWeek ? "next " : ""}${name} (${dayLabel(d)})`, `${nextWeek ? "sa susunod na " : "sa "}${name} (${dayLabel(d)})`);
    }
  }

  // 11/15, m/d, as a phone writes it.
  const slash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (slash) {
    const m = Number(slash[1]);
    const dayNum = Number(slash[2]);
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : Number(today.slice(0, 4));
    if (m >= 1 && m <= 12 && dayNum >= 1 && dayNum <= 31) {
      const d = `${year}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      if (addDays(d, 0)) return single(d, dayLabel(d), dayLabel(d));
    }
  }
  return null;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/* ------------------------------------------------------------------ names */

/** The member a message names, by first name, case-insensitively; a full
 * name or a word of it works too. Null when nobody in the list is named. */
export function resolveMember(text: string, members: string[]): string | null {
  const words = text.toLowerCase().replace(/[^a-z0-9'\- ]/g, " ").replace(/'s\b/g, "").split(/\s+/).filter(Boolean);
  for (const full of members) {
    const parts = full.toLowerCase().split(/\s+/);
    const first = parts[0];
    if (first && words.includes(first)) return full;
  }
  for (const full of members) {
    if (text.toLowerCase().includes(full.toLowerCase())) return full;
  }
  return null;
}

const firstName = (full: string) => full.split(" ")[0];

/* --------------------------------------------------------------- phrasing */

type Say = (en: string, tl: string) => string;

function pick(lang: Lang): Say {
  return (en, tl) => (lang === "tl" ? tl : en);
}

function money(amount: unknown, currency: string): string {
  return formatCurrency(Number(amount) || 0, currency);
}

function isError(result: unknown): result is { error: string } {
  return !!result && typeof result === "object" && typeof (result as { error?: unknown }).error === "string";
}

function rows<T>(result: unknown, key: string): T[] {
  const v = result && typeof result === "object" ? (result as Record<string, unknown>)[key] : undefined;
  return Array.isArray(v) ? (v as T[]) : [];
}

function field(result: unknown, key: string): unknown {
  return result && typeof result === "object" ? (result as Record<string, unknown>)[key] : undefined;
}

const joinList = (items: string[], max = 8) => (items.length > max ? `${items.slice(0, max).join(", ")} +${items.length - max}` : items.join(", "));

/** "in 3 days" / "3 days ago" / "today", from a plain date. */
function distance(day: string, today: string, lang: Lang): string {
  const n = daysBetween(today, day);
  const t = pick(lang);
  if (n === null) return "";
  if (n === 0) return t("today", "ngayon");
  if (n === 1) return t("tomorrow", "bukas");
  if (n === -1) return t("yesterday", "kahapon");
  if (n > 0) return t(`in ${n} days`, `${n} days pa`);
  return t(`${-n} days ago`, `${-n} days na`);
}

type Bill = { name: string; amount: number; due_date: string; status: string };

/** Whether a bill's name answers to the words a member used for it. */
function billMatches(bill: Bill, wanted: string): boolean {
  const name = bill.name.toLowerCase();
  const asked = wanted.toLowerCase().trim();
  if (!asked) return false;
  if (name.includes(asked) || asked.includes(name)) return true;
  const askedWords = asked.split(/\s+/);
  if (askedWords.some((w) => w.length > 2 && name.includes(w))) return true;
  const group = BILL_WORDS.find((g) => g.some((w) => asked === w || askedWords.includes(w)));
  return !!group && group.some((w) => name.includes(w));
}

/* ------------------------------------------------------------------ rules */

type Rule = (q: Query, ctx: RuleContext) => RuleOutcome | null;

/** A question that reads as advice, a plan, a why, a how-to, several things at
 * once, or a change to a record is the model's. The rules answer only what a
 * record holds. */
function isForTheModel(q: Query): boolean {
  if (q.text.length > 140) return true;
  if (/\b(then|tapos|and then|after that|also|at saka|pati|and also)\b/.test(q.text) && /\b(add|pa-?add|idagdag|tell|show|what|ano|magkano|how much)\b.*\b(add|pa-?add|idagdag|tell|show|what|ano|magkano|how much)\b/.test(q.text)) return true;
  if (/\b(should (?!(?:i|we) call)|why|bakit|paano|how do i|how can|how to|advice|advise|suggest|recommend|best|better|ideas?|plan for|help me|can you help|tips?|dapat|pwede ba|can we afford|afford|compare|explain|summar(?:y|ise|ize)|remind me|reminder)\b/.test(q.text)) return true;
  // Two questions in one ("what's due and what's for dinner"), or one
  // question about two people's separate things.
  const questionWords = q.text.match(/\b(what is|what|ano|anong|how much|magkano|when|kailan|who|sino|how many|ilan)\b/g) ?? [];
  if (questionWords.length >= 2 && /\s(and|at|saka|tsaka)\s/.test(q.text)) return true;
  if (/^(what|when|kailan|how|magkano|who|sino|ano|anong)\b/.test(q.text) && /\s(and|at)\s/.test(q.text) && /'s\b.*\s(and|at)\s.*'s\b/.test(q.text)) return true;
  // "Pay Meralco" is an instruction to move money, not a question and not a
  // mark of a payment made: the model's, with record_money's own checks.
  if (/^(pay|settle|bayaran|bayad|magbayad|pls pay|please pay)\b/.test(q.text) && !/\b(paid|na|already)\b/.test(q.text)) return true;
  if (/\b(delete|remove|edit|change|update|rename|cancel|move|tanggalin|burahin|palitan|alisin)\b/.test(q.text)) return true;
  if (/\b(record|received|got paid|spent \d|gastos ko \d|transfer|ilipat)\b/.test(q.text)) return true;
  return false;
}

/* bills */

const billsOverdue: Rule = (q, ctx) => {
  if (!/\b(bill|bills|due|bayarin|babayaran)\b/.test(q.text) && !/\boverdue\b/.test(q.text)) return null;
  if (!/\b(overdue|past due|late|lampas|lagpas na)\b/.test(q.text)) return null;
  const t = pick(q.lang);
  return {
    rule: "bills.overdue",
    tool: "get_money",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const late = rows<Bill>(result, "unpaid_bills").filter((b) => b.due_date < ctx.today).sort((a, b) => a.due_date.localeCompare(b.due_date));
      if (late.length === 0) return t("No overdue bills.", "Walang overdue na bill.");
      const lines = late.map((b) => `${b.name} ${money(b.amount, ctx.currency)}, ${t("due", "due")} ${readableDay(b.due_date)} (${distance(b.due_date, ctx.today, q.lang)})`);
      const total = late.reduce((s, b) => s + Number(b.amount), 0);
      return t(`Overdue (${late.length}): ${lines.join("; ")}. Total ${money(total, ctx.currency)}.`, `Overdue (${late.length}): ${lines.join("; ")}. Total ${money(total, ctx.currency)}.`);
    },
  };
};

/** The answer to "when is X due" / "how much is the X bill", from the unpaid
 * bills. `exact` is a name the member picked from a choice: only that bill. */
function billDueMatch(name: string, lang: Lang, ctx: RuleContext, exact: string | null): RuleMatch {
  const t = pick(lang);
  return {
    rule: "bills.due_when",
    tool: "get_money",
    input: {},
    lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const bills = rows<Bill>(result, "unpaid_bills")
        .filter((b) => (exact ? b.name.toLowerCase() === exact.toLowerCase() : billMatches(b, name)))
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      if (bills.length === 0) {
        return t(`No unpaid bill called "${name}" in Kin. Paid and other bills are under Wealth → Expenses.`, `Walang unpaid na bill na "${name}" sa Kin. Nasa Wealth → Expenses ang mga bayad na.`);
      }
      // Two different bills answer to the word ("Globe Fiber", "Globe
      // Postpaid"): ask which, rather than pick.
      const names = [...new Set(bills.map((b) => b.name))];
      if (names.length > 1 && !exact) {
        return {
          ask: t(`Which one: ${names.join(" or ")}?`, `Alin: ${names.join(" o ")}?`),
          choices: names,
          pending: { rule: "bills.due_when", slots: { name }, lang, asked: 1 },
        };
      }
      const b = bills[0];
      const when = `${readableDay(b.due_date)} (${distance(b.due_date, ctx.today, lang)})`;
      const late = b.due_date < ctx.today;
      return t(
        `${b.name} (${money(b.amount, ctx.currency)}) ${late ? "was due" : "is due"} ${when}.`,
        `${late ? "Due na ang" : "Due ang"} ${b.name} (${money(b.amount, ctx.currency)}) ${late ? "noong" : "sa"} ${when}.`,
      );
    },
  };
}

const billDue: Rule = (q, ctx) => {
  // "when is X due", "kailan due ang X", "X due when", "kailan ang bayad ng X";
  // also "how much is the X bill", "magkano ang Meralco": the same answer,
  // the amount and the day, from the unpaid bills.
  const hasRange = !!resolveRange(q.text, ctx.today);
  const whenDue =
    (/\b(when|kailan|kelan)\b/.test(q.text) && /\b(due|bayad|bayaran|babayaran|deadline)\b/.test(q.text)) ||
    // "Meralco due date", "due date ng Meralco", "due ng Meralco": a bill named, no day named.
    (!hasRange && !/\bbills\b/.test(q.text) && (/\bdue date\b/.test(q.text) || /^due\s+(?:ng|ni|ang|of|the)\b/.test(q.text) || /\b[a-z]+\s+due$/.test(q.text)) && !/\b(any|may|meron|overdue|anong|what|ano)\b/.test(q.text));
  const namesABill = /\b(bill|bills)\b/.test(q.text) || BILL_WORDS.some((g) => g.some((w) => ` ${q.text} `.includes(` ${w} `)));
  const notAnAmount = /\b(spend|spent|gastos|nagastos|budget|owe|utang|unpaid|overdue|due)\b/.test(q.text) || !!resolveRange(q.text, ctx.today);
  const howMuch = /\b(how much|magkano|what is|ano ang|anong)\b/.test(q.text) && namesABill && !notAnAmount;
  if (!whenDue && !howMuch) return null;
  const name = q.text
    .replace(/\b(when|kailan|kelan|how much|magkano|what|ano|anong|is|are|the|our|my|ang|ng|ni|sa|ba|na|naman|natin|namin|ko|due|date|deadline|bayad|bayaran|babayaran|bill|bills|payment|for|of|this|next|do|we|have|to|pay|kailangan|dapat|month|buwan|ngayong)\b/g, " ")
    .replace(/'s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  return billDueMatch(name, q.lang, ctx, null);
};

const billsOwed: Rule = (q, ctx) => {
  if (!/\b(how much|magkano|ilan|what do we owe|ano ang utang natin)\b/.test(q.text)) return null;
  if (!/\b(owe|owed|utang|debts?|bayarin|to pay|babayaran|bills? (?:do we|does the family|natin)|unpaid)\b/.test(q.text)) return null;
  if (resolveRange(q.text, ctx.today)) return null; // "how much is due this week" is the ranged rule
  const t = pick(q.lang);
  return {
    rule: "bills.owed",
    tool: "get_money",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const bills = rows<Bill>(result, "unpaid_bills");
      const total = bills.reduce((s, b) => s + Number(b.amount), 0);
      const debts = Number(field(result, "liabilities_total")) || 0;
      const billsLine = bills.length === 0 ? t("No unpaid bills", "Walang unpaid na bill") : t(`Unpaid bills: ${money(total, ctx.currency)} (${bills.length})`, `Unpaid bills: ${money(total, ctx.currency)} (${bills.length})`);
      const debtLine = debts > 0 ? t(` Loans and other debts: ${money(debts, ctx.currency)}.`, ` Loans at ibang utang: ${money(debts, ctx.currency)}.`) : "";
      return `${billsLine}.${debtLine}`;
    },
  };
};

const billsInRange: Rule = (q, ctx) => {
  if (!/\b(bill|bills|due|bayarin|babayaran|bayaran)\b/.test(q.text)) return null;
  if (/\b(when|kailan|kelan)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|idagdag|dagdag)\b/.test(q.text)) return null;
  const range = resolveRange(q.text, ctx.today);
  const t = pick(q.lang);
  const wantsTotal = /\b(how much|magkano)\b/.test(q.text);
  if (!range) {
    // "any bills due?", "may due ba?", "what bills do we have": every unpaid bill, soonest first.
    return {
      rule: "bills.unpaid",
      tool: "get_money",
      input: {},
      lang: q.lang,
      say: (result) => {
        if (isError(result)) return result.error;
        const bills = rows<Bill>(result, "unpaid_bills").sort((a, b) => a.due_date.localeCompare(b.due_date));
        if (bills.length === 0) return t("No unpaid bills.", "Walang unpaid na bill.");
        const total = bills.reduce((s, b) => s + Number(b.amount), 0);
        const lines = bills.slice(0, 6).map((b) => `${b.name} ${money(b.amount, ctx.currency)} ${readableDay(b.due_date)}`);
        const more = bills.length > 6 ? ` +${bills.length - 6}` : "";
        return t(`Unpaid (${bills.length}): ${lines.join("; ")}${more}. Total ${money(total, ctx.currency)}.`, `Unpaid (${bills.length}): ${lines.join("; ")}${more}. Total ${money(total, ctx.currency)}.`);
      },
    };
  }
  return {
    rule: "bills.range",
    tool: "get_schedule",
    input: { from: range.from, to: range.to },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const bills = rows<Bill>(result, "bills_due").filter((b) => b.status !== "paid").sort((a, b) => a.due_date.localeCompare(b.due_date));
      const label = q.lang === "tl" ? range.label.tl : range.label.en;
      if (bills.length === 0) return t(`Nothing due ${label}.`, `Walang due ${label}.`);
      const total = bills.reduce((s, b) => s + Number(b.amount), 0);
      const lines = bills.map((b) => (range.single ? `${b.name} ${money(b.amount, ctx.currency)}` : `${b.name} ${money(b.amount, ctx.currency)} ${readableDay(b.due_date)}`));
      if (wantsTotal) return t(`Due ${label}: ${money(total, ctx.currency)} (${lines.join("; ")}).`, `Due ${label}: ${money(total, ctx.currency)} (${lines.join("; ")}).`);
      return t(`Due ${label}: ${lines.join("; ")}. Total ${money(total, ctx.currency)}.`, `Due ${label}: ${lines.join("; ")}. Total ${money(total, ctx.currency)}.`);
    },
  };
};

/* spending and budget */

function categoriesIn(text: string): (typeof EXPENSE_CATEGORIES)[number][] {
  const padded = ` ${text} `;
  const found: (typeof EXPENSE_CATEGORIES)[number][] = [];
  for (const cat of EXPENSE_CATEGORIES) {
    if (CATEGORY_WORDS[cat].some((w) => padded.includes(` ${w} `))) found.push(cat);
  }
  return found;
}

function categoryIn(text: string): (typeof EXPENSE_CATEGORIES)[number] | null {
  return categoriesIn(text)[0] ?? null;
}

/** Every member a message names, in the order named. */
function resolveMembers(text: string, members: string[]): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9'\- ]/g, " ").replace(/'s\b/g, "").split(/\s+/).filter(Boolean);
  return members.filter((full) => {
    const first = full.toLowerCase().split(/\s+/)[0];
    return !!first && words.includes(first);
  });
}

/** This month's spending by category, Transfer and Goal left out: neither is
 * money that left the household. */
function spentByCategory(result: unknown): Map<string, number> {
  const raw = field(result, "this_month_out_by_category");
  const out = new Map<string, number>();
  if (raw && typeof raw === "object") {
    for (const [cat, amount] of Object.entries(raw as Record<string, unknown>)) {
      if (cat === TRANSFER_CATEGORY || cat === GOAL_CATEGORY) continue;
      out.set(cat, Number(amount) || 0);
    }
  }
  return out;
}

const monthName = (today: string) => MONTHS_EN[Number(today.slice(5, 7)) - 1].replace(/^./, (c) => c.toUpperCase());

const budgetLeft: Rule = (q, ctx) => {
  if (!/\b(left|natitira|natira|remaining|remains|balance (?:of|ng) (?:the |our |ang )?budget|budget)\b/.test(q.text)) return null;
  if (!/\b(left|natitira|natira|remaining|remains|how much|magkano|what is|ano|anong|kumusta|how is|how are|status|ok ba|okay ba)\b/.test(q.text)) return null;
  if (/\b(set|add|pa-?add|idagdag|change|palitan)\b/.test(q.text)) return null;
  if (/\b(last month|nakaraang buwan|next month|susunod na buwan)\b/.test(q.text)) return null;
  // "how much is left in GCash" is a balance, not the budget.
  if (!/\bbudget\b/.test(q.text) && !/\b(this month|ngayong buwan|the month|for the month|sa buwan)\b/.test(q.text)) return null;
  const category = categoryIn(q.text);
  const t = pick(q.lang);
  const who = resolveMember(q.text, ctx.members);
  return {
    rule: category ? "budget.left_category" : "budget.left",
    tool: "get_money",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const spent = spentByCategory(result);
      const budgets = (field(result, "budgets_this_month") ?? {}) as Record<string, unknown>;
      const byCat = (budgets.by_category ?? {}) as Record<string, unknown>;
      const month = monthName(ctx.today);
      if (category) {
        const b = Number(byCat[category]) || 0;
        const s = spent.get(category) ?? 0;
        if (!b) return t(`No ${category} budget set for ${month}. Spent so far: ${money(s, ctx.currency)}.`, `Walang ${category} budget para sa ${month}. Nagastos na: ${money(s, ctx.currency)}.`);
        if (s > b) return t(`${category} is over by ${money(s - b, ctx.currency)}: ${money(s, ctx.currency)} spent of ${money(b, ctx.currency)}.`, `Lagpas na ng ${money(s - b, ctx.currency)} ang ${category}: ${money(s, ctx.currency)} nagastos sa ${money(b, ctx.currency)}.`);
        return t(`${money(b - s, ctx.currency)} left of the ${money(b, ctx.currency)} ${category} budget (${money(s, ctx.currency)} spent).`, `${money(b - s, ctx.currency)} pa ang natitira sa ${money(b, ctx.currency)} ${category} budget (${money(s, ctx.currency)} nagastos).`);
      }
      const total = Number(budgets.total) || 0;
      const spentTotal = [...spent.values()].reduce((a, b) => a + b, 0);
      if (!total) {
        const moneyIn = Number(field(result, "this_month_in")) || 0;
        const moneyOut = Number(field(result, "this_month_out")) || 0;
        return t(
          `No budget set for ${month}. In so far: ${money(moneyIn, ctx.currency)}, out: ${money(moneyOut, ctx.currency)}, so ${money(moneyIn - moneyOut, ctx.currency)} of this month's money in is left.`,
          `Walang budget para sa ${month}. Pasok: ${money(moneyIn, ctx.currency)}, labas: ${money(moneyOut, ctx.currency)}, kaya ${money(moneyIn - moneyOut, ctx.currency)} pa ang natitira sa pumasok ngayong buwan.`,
        );
      }
      const whoNote = who ? t(` (every budget you can see, not only ${firstName(who)}'s)`, ` (lahat ng budget na nakikita mo, hindi lang kay ${firstName(who)})`) : "";
      if (spentTotal > total) return t(`Over budget by ${money(spentTotal - total, ctx.currency)} for ${month}: ${money(spentTotal, ctx.currency)} spent of ${money(total, ctx.currency)}${whoNote}.`, `Lagpas na ng ${money(spentTotal - total, ctx.currency)} sa budget ng ${month}: ${money(spentTotal, ctx.currency)} nagastos sa ${money(total, ctx.currency)}${whoNote}.`);
      return t(`${money(total - spentTotal, ctx.currency)} left of ${month}'s ${money(total, ctx.currency)} budget (${money(spentTotal, ctx.currency)} spent)${whoNote}.`, `${money(total - spentTotal, ctx.currency)} pa ang natitira sa ${money(total, ctx.currency)} budget ng ${month} (${money(spentTotal, ctx.currency)} nagastos)${whoNote}.`);
    },
  };
};

const spending: Rule = (q, ctx) => {
  const incomeWords = /\b(income|earn|earned|kinita|kita|money in|pumasok|came in|save|saved|savings this month|net income|net this month|left over)\b/.test(q.text) && !/\b(goal|fund|budget|net worth)\b/.test(q.text);
  const biggest = /\b(biggest|largest|top|most|where did the money go|saan napunta|where does the money go|breakdown)\b/.test(q.text);
  const spendWords = /\b(spend|spent|spending|gastos|nagastos|ginastos|gumastos|nagagastos|expenses?|paid for)\b/.test(q.text);
  if (!spendWords && !incomeWords && !biggest) return null;
  // A question, a bare "gastos natin this month" / "spent on food this month", or "Lia's spending".
  const asks = /\b(how much|magkano|what|ano|anong|total|ilan|where|saan)\b/.test(q.text) || /^(?:gastos|nagastos|spent|spending|expenses?|total|income|kita|biggest|top|net)\b/.test(q.text) || /\bspending$/.test(q.text);
  if (!asks) return null;
  // get_money reads this month only. Other months are get_spending's (spendingPast).
  if (/\b(last month|nakaraang buwan|noong|last week|yesterday|kahapon|last year|this week|ngayong linggo|today|ngayon|bukas|tomorrow|in \w+ \d{4})\b/.test(q.text)) return null;
  if (pastRange(q.text, ctx.today)) return null;
  const categories = categoriesIn(q.text);
  const members = resolveMembers(q.text, ctx.members);
  // get_money splits the month by category and by member, not both at once.
  if (members.length > 0 && categories.length > 0) return null;
  const t = pick(q.lang);
  const month = monthName(ctx.today);
  if (incomeWords && !spendWords) {
    return {
      rule: "spending.income",
      tool: "get_money",
      input: {},
      lang: q.lang,
      say: (result) => {
        if (isError(result)) return result.error;
        const moneyIn = Number(field(result, "this_month_in")) || 0;
        const out = [...spentByCategory(result).values()].reduce((a, b) => a + b, 0);
        return t(`In ${month} so far: ${money(moneyIn, ctx.currency)} in, ${money(out, ctx.currency)} out, so ${money(moneyIn - out, ctx.currency)} kept.`, `Ngayong ${month}: ${money(moneyIn, ctx.currency)} pumasok, ${money(out, ctx.currency)} lumabas, kaya ${money(moneyIn - out, ctx.currency)} ang natira.`);
      },
    };
  }
  if (members.length > 0) {
    return {
      rule: "spending.member",
      tool: "get_money",
      input: {},
      lang: q.lang,
      say: (result) => {
        if (isError(result)) return result.error;
        const byMember = (field(result, "this_month_out_by_member") ?? {}) as Record<string, unknown>;
        const amountOf = (who: string) => {
          const key = Object.keys(byMember).find((k) => k.toLowerCase() === who.toLowerCase() || k.toLowerCase().split(" ")[0] === firstName(who).toLowerCase());
          return key ? Number(byMember[key]) || 0 : 0;
        };
        if (members.length === 1) return t(`${firstName(members[0])}'s spending in ${month} so far: ${money(amountOf(members[0]), ctx.currency)} (from accounts you can see).`, `Nagastos ni ${firstName(members[0])} ngayong ${month}: ${money(amountOf(members[0]), ctx.currency)} (sa mga account na nakikita mo).`);
        return t(`Spending in ${month} so far: ${members.map((m) => `${firstName(m)} ${money(amountOf(m), ctx.currency)}`).join("; ")} (from accounts you can see).`, `Nagastos ngayong ${month}: ${members.map((m) => `${firstName(m)} ${money(amountOf(m), ctx.currency)}`).join("; ")} (sa mga account na nakikita mo).`);
      },
    };
  }
  return {
    rule: categories.length > 0 ? "spending.category" : "spending.total",
    tool: "get_money",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const spent = spentByCategory(result);
      if (categories.length === 1) {
        const amount = spent.get(categories[0]) ?? 0;
        return t(`${categories[0]} in ${month} so far: ${money(amount, ctx.currency)}.`, `${categories[0]} ngayong ${month}: ${money(amount, ctx.currency)}.`);
      }
      if (categories.length > 1) {
        const sum = categories.reduce((a, c) => a + (spent.get(c) ?? 0), 0);
        return t(`${month} so far: ${categories.map((c) => `${c} ${money(spent.get(c) ?? 0, ctx.currency)}`).join("; ")}. Together ${money(sum, ctx.currency)}.`, `Ngayong ${month}: ${categories.map((c) => `${c} ${money(spent.get(c) ?? 0, ctx.currency)}`).join("; ")}. Kabuuan ${money(sum, ctx.currency)}.`);
      }
      const total = [...spent.values()].reduce((a, b) => a + b, 0);
      const top = [...spent.entries()].filter(([, a]) => a > 0).sort((a, b) => b[1] - a[1]).slice(0, biggest ? 5 : 3).map(([c, a]) => `${c} ${money(a, ctx.currency)}`);
      const topLine = top.length > 0 ? t(` Top: ${top.join(", ")}.`, ` Pinakamalaki: ${top.join(", ")}.`) : "";
      return t(`Spent in ${month} so far: ${money(total, ctx.currency)}.${topLine}`, `Nagastos ngayong ${month}: ${money(total, ctx.currency)}.${topLine}`);
    },
  };
};

/* balances */

type Account = { name: string; institution: string | null; scope: string; balance: number };

const totalCash: Rule = (q, ctx) => {
  const bareAccounts = /^(?:list |show |what |our |my |all |the |mga )*(?:bank )?(?:accounts|account list|mga account)(?: natin| namin| ko| do we have| meron tayo)?$/.test(q.text);
  if (!bareAccounts && !/\b(how much|magkano|total|what is|ano|anong|ilan)\b/.test(q.text)) return null;
  if (!bareAccounts && !/\b(cash|money|pera|balance|balances|total|all accounts|accounts|lahat ng account|net worth|savings|bank|bangko)\b/.test(q.text)) return null;
  // accountBalance runs first, so "in GCash" never reaches here; what does
  // is "in the bank", "in total", "in all accounts": the whole.
  if (/\b(spend|spent|gastos|budget|owe|utang|bill|bills|due)\b/.test(q.text)) return null;
  if (/\d/.test(q.text)) return null;
  const netWorth = /\bnet worth\b/.test(q.text);
  const t = pick(q.lang);
  return {
    rule: netWorth ? "balances.net_worth" : "balances.total",
    tool: "get_money",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const accounts = rows<Account>(result, "accounts");
      const cash = Number(field(result, "combined_balance")) || 0;
      if (netWorth) {
        const nw = Number(field(result, "net_worth")) || 0;
        return t(`Net worth: ${money(nw, ctx.currency)} (cash ${money(cash, ctx.currency)}, assets ${money(field(result, "assets_total"), ctx.currency)}, debts ${money(field(result, "liabilities_total"), ctx.currency)}).`, `Net worth: ${money(nw, ctx.currency)} (cash ${money(cash, ctx.currency)}, assets ${money(field(result, "assets_total"), ctx.currency)}, utang ${money(field(result, "liabilities_total"), ctx.currency)}).`);
      }
      if (accounts.length === 0) return t("No accounts in Kin yet.", "Wala pang account sa Kin.");
      const lines = accounts.map((a) => `${a.name} ${money(a.balance, ctx.currency)}`);
      return t(`Cash across ${accounts.length} account${accounts.length === 1 ? "" : "s"}: ${money(cash, ctx.currency)} (${joinList(lines, 6)}).`, `Total cash sa ${accounts.length} account: ${money(cash, ctx.currency)} (${joinList(lines, 6)}).`);
    },
  };
};

const accountBalance: Rule = (q, ctx) => {
  if (!/\b(how much|magkano|balance|laman|ilan|pera)\b/.test(q.text)) return null;
  if (/\b(spend|spent|gastos|budget|owe|utang|bill|bills|due)\b/.test(q.text)) return null;
  // "how much is in GCash", "magkano laman ng BPI", "GCash balance", "balance ng Maya", "pera sa GCash"
  const m =
    /\b(?:in|sa|ng|nasa|laman ng)\s+(?:the |our |my |ang |aking |ating )?([a-z][a-z0-9 &'\-]*?)(?:\s+(?:account|acct|wallet|ngayon|now|right now|ba|natin|namin|ko))*$/.exec(q.text) ??
    /^(?:what is |ano ang |anong |ano )?(?:the |our |my |ang )?([a-z0-9][a-z0-9 &'\-]*?)\s+balance\b/.exec(q.text) ??
    /^(?:pera|laman|balance)\s+(?:sa|ng|ni|in|of)\s+(?:the |our |my |ang )?([a-z][a-z0-9 &'\-]*?)$/.exec(q.text);
  if (!m) return null;
  const name = m[1].replace(/\b(the|our|my|ang|account|acct|wallet|natin|namin|ko|ba|now|ngayon)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!name || /^(total|all|everything|lahat|cash|money|pera|bank|left|natitira)$/.test(name)) return null;
  if (/\d/.test(name) || /\b(ref|fridge|pantry|bahay|kusina|kitchen|cabinet|baguio|goal|fund)\b/.test(name)) return null;
  const t = pick(q.lang);
  return {
    rule: "balances.account",
    tool: "get_money",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const accounts = rows<Account>(result, "accounts");
      const wanted = name.toLowerCase();
      const found = accounts.filter((a) => a.name.toLowerCase() === wanted) .concat(accounts.filter((a) => a.name.toLowerCase() !== wanted && (a.name.toLowerCase().includes(wanted) || (a.institution ?? "").toLowerCase().includes(wanted))));
      if (found.length === 0) return t(`No account called "${name}" that you can see. Accounts: ${joinList(accounts.map((a) => a.name)) || "none yet"}.`, `Walang account na "${name}" na nakikita mo. Accounts: ${joinList(accounts.map((a) => a.name)) || "wala pa"}.`);
      if (found.length === 1) return `${found[0].name}: ${money(found[0].balance, ctx.currency)}.`;
      return found.map((a) => `${a.name}: ${money(a.balance, ctx.currency)}`).join("; ") + ".";
    },
  };
};

/* schedule */

type Activity = { title: string; when: string; location: string | null; who: string | string[] };
type Event = { title: string; event_date: string; kind: string };
type Meal = { dish: string; plan_date: string };
type GoalDeadline = { title: string; target_date: string; target_amount: number; current_amount: number };

function scheduleLines(result: unknown, range: DayRange, ctx: RuleContext, lang: Lang): string[] {
  const t = pick(lang);
  const tz = ctx.timeZone;
  const lines: { day: string; text: string }[] = [];
  for (const a of rows<Activity>(result, "activities")) {
    const at = new Date(a.when);
    const day = Number.isNaN(at.getTime()) ? range.from : new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
    const clock = Number.isNaN(at.getTime()) ? "" : familyClock(at, tz);
    const who = Array.isArray(a.who) ? (a.who.length > 0 ? ` (${a.who.map(firstName).join(", ")})` : "") : "";
    lines.push({ day, text: `${clock ? `${clock} ` : ""}${a.title}${who}${a.location ? `, ${a.location}` : ""}` });
  }
  for (const e of rows<Event>(result, "events")) lines.push({ day: e.event_date, text: e.kind === "birthday" ? t(`${e.title} (birthday)`, `${e.title} (birthday)`) : e.title });
  for (const b of rows<Bill>(result, "bills_due")) if (b.status !== "paid") lines.push({ day: b.due_date, text: t(`${b.name} due ${money(b.amount, ctx.currency)}`, `${b.name} due ${money(b.amount, ctx.currency)}`) });
  for (const m of rows<Meal>(result, "meals")) lines.push({ day: m.plan_date, text: t(`meal: ${m.dish}`, `ulam: ${m.dish}`) });
  for (const g of rows<GoalDeadline>(result, "goal_deadlines")) lines.push({ day: g.target_date, text: t(`goal ${g.title} due`, `deadline ng goal na ${g.title}`) });
  lines.sort((a, b) => a.day.localeCompare(b.day) || a.text.localeCompare(b.text));
  if (range.single) return lines.map((l) => l.text);
  return lines.map((l) => `${readableDay(l.day)}: ${l.text}`);
}

const whatsOn: Rule = (q, ctx) => {
  if (/\b(bill|bills|due|bayarin|spend|spent|gastos|budget|balance|list|listahan|bibilhin|buy|dinner|lunch|ulam|hapunan|tanghalian|almusal|breakfast|meal|meals|birthday|kaarawan|allerg|gamot|medicine)\b/.test(q.text)) return null;
  // A day on its own ("bukas", "tomorrow?", "this week", "schedule today",
  // "sked natin sa sabado") is a schedule question.
  const dayOnly = (() => {
    const r = resolveRange(q.text, ctx.today);
    if (!r) return false;
    const rest = q.text
      .replace(/\b(schedule|agenda|plans?|lakad|natin|namin|ko|ang|the|my|our|for|sa|on|ba|tayo|kami|what is|ano|anong|meron|may)\b/g, " ")
      .replace(new RegExp(`\\b(${[...WEEKDAYS_EN, ...WEEKDAYS_TL, ...WEEKDAY_SHORT, ...MONTHS_EN, ...MONTHS_TL, ...MONTH_SHORT].join("|")})\\b`, "g"), " ")
      .replace(/\b(today|tonight|tomorrow|bukas|ngayon|ngayong|araw|mamaya|this|next|week|weekend|month|linggo|buwan|susunod|na|sa|the|day after|makalawa|kahapon|yesterday|in)\b/g, " ")
      .replace(/\b\d{1,2}(?:st|nd|rd|th)?\b|\b\d{4}-\d{2}-\d{2}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return rest === "";
  })();
  if (!dayOnly && ADD_VERB.test(q.text)) return null;
  if (!dayOnly && !/\b(what is on|whats on|what is happening|what do we have|what is (?:the )?(?:schedule|plan|agenda)|schedule|agenda|plans?|anong meron|ano meron|ano ang meron|may lakad|anong lakad|ano ang lakad|anong schedule|ano ang schedule|anong nakaschedule|anything on|anything (?:happening|scheduled)|what is up|calendar|busy|free)\b/.test(q.text)) return null;
  if (/\b(when|kailan|kelan)\b/.test(q.text)) return null;
  const range = resolveRange(q.text, ctx.today) ?? single(ctx.today, `today (${dayLabel(ctx.today)})`, `ngayon (${dayLabel(ctx.today)})`);
  const t = pick(q.lang);
  const who = resolveMember(q.text, ctx.members);
  return {
    rule: "schedule.range",
    tool: "get_schedule",
    input: { from: range.from, to: range.to },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const label = q.lang === "tl" ? range.label.tl : range.label.en;
      let filtered = result;
      if (who) {
        const first = firstName(who).toLowerCase();
        const activities = rows<Activity>(result, "activities").filter((a) => a.who === "whole family" || (Array.isArray(a.who) && a.who.some((n) => n.toLowerCase().startsWith(first))));
        filtered = { ...(result as object), activities, events: [], bills_due: [], goal_deadlines: [], meals: [] };
      }
      const lines = scheduleLines(filtered, range, ctx, q.lang);
      const forWho = who ? t(` for ${firstName(who)}`, ` ni ${firstName(who)}`) : "";
      if (lines.length === 0) return t(`Nothing on ${label}${forWho}.`, `Walang nakaschedule ${label}${forWho}.`);
      return t(`${label[0].toUpperCase()}${label.slice(1)}${forWho}: ${lines.join("; ")}.`, `${label[0].toUpperCase()}${label.slice(1)}${forWho}: ${lines.join("; ")}.`);
    },
  };
};

const whenIs: Rule = (q, ctx) => {
  const nextOf = /^(?:(?:\w+'s )?(?:next|upcoming|susunod na)\s+)(.+)$/.test(q.text) || /^(?:\w+'s )?(?:dentist|checkup|appointment|recital|game|practice|trip|flight)\s+(?:next|susunod)$/.test(q.text);
  if (!nextOf && !/\b(when|kailan|kelan|what time|anong oras)\b/.test(q.text)) return null;
  if (/\b(due|bayad|bayaran|birthday|kaarawan|bday)\b/.test(q.text)) return null;
  const who = resolveMember(q.text, ctx.members);
  const name = q.text
    .replace(/'s\b/g, "")
    .replace(/\b(when|kailan|kelan|what time|anong oras|is|are|the|our|my|ang|ng|ni|sa|ba|na|naman|natin|namin|ko|next|upcoming|susunod|again|ulit|scheduled|schedule|appointment|of|for|this|do|we|have|yung|iyong|yun|un|kaya|today|tomorrow|bukas|ngayon|mamaya|week|month|linggo|buwan)\b/g, " ")
    .replace(who ? new RegExp(`\\b${firstName(who).toLowerCase()}\\b`, "g") : /$^/, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length < 3) return null;
  const t = pick(q.lang);
  return {
    rule: "schedule.when_is",
    tool: "search",
    input: { query: name },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const tz = ctx.timeZone;
      const activities = rows<{ title: string; start_at: string; location: string | null }>(result, "activities")
        .map((a) => ({ title: a.title, day: new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(a.start_at)), clock: familyClock(new Date(a.start_at), tz), location: a.location }))
        .filter((a) => a.day >= ctx.today)
        .sort((a, b) => a.day.localeCompare(b.day));
      const events = rows<{ title: string; event_date: string; kind: string }>(result, "events").filter((e) => e.event_date >= ctx.today).sort((a, b) => a.event_date.localeCompare(b.event_date));
      const meals = rows<{ dish: string; plan_date: string }>(result, "meal_plans").filter((m) => m.plan_date >= ctx.today).sort((a, b) => a.plan_date.localeCompare(b.plan_date));
      if (activities[0]) {
        const a = activities[0];
        return t(`${a.title}: ${readableDay(a.day)} ${a.clock}${a.location ? `, ${a.location}` : ""} (${distance(a.day, ctx.today, q.lang)}).`, `${a.title}: ${readableDay(a.day)} ${a.clock}${a.location ? `, ${a.location}` : ""} (${distance(a.day, ctx.today, q.lang)}).`);
      }
      if (events[0]) {
        const e = events[0];
        return `${e.title}: ${readableDay(e.event_date)} (${distance(e.event_date, ctx.today, q.lang)}).`;
      }
      if (meals[0]) return t(`${meals[0].dish} is planned for ${readableDay(meals[0].plan_date)}.`, `${meals[0].dish}: ${readableDay(meals[0].plan_date)}.`);
      return t(`Nothing coming up called "${name}" in Kin's plans.`, `Walang paparating na "${name}" sa plans sa Kin.`);
    },
  };
};

const checkups: Rule = (q, ctx) => {
  if (!/\b(check-?ups?|check-?up|health checks?|vaccines?|vaccination|bakuna|due for)\b/.test(q.text)) return null;
  const bare = /^(?:upcoming |next |mga )?(?:check-?ups?|health checks?|vaccines?|bakuna)(?: natin| namin| ko)?(?: (?:this|next) (?:week|month)| ngayong (?:linggo|buwan))?$/.test(q.text);
  if (!bare && !/\b(who|sino|any|may|meron|due|what|ano|anong|when|kailan|kelan)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|idagdag|schedule a|book)\b/.test(q.text)) return null;
  const who = resolveMember(q.text, ctx.members);
  // "when is the checkup" with nobody named is a plan, not a health check due.
  if (/\b(when|kailan|kelan)\b/.test(q.text) && !who) return null;
  const t = pick(q.lang);
  return {
    rule: "family.checkups",
    tool: "get_family",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      let due = rows<{ who: string | null; what: string; when: string | null; status: string }>(result, "health_due");
      if (who) due = due.filter((d) => d.who === who || (d.who ?? "").toLowerCase().startsWith(firstName(who).toLowerCase()));
      if (due.length === 0) return who ? t(`No health check due for ${firstName(who)}.`, `Walang due na health check si ${firstName(who)}.`) : t("No health checks due.", "Walang due na health check.");
      const lines = due.map((d) => `${d.who ? firstName(d.who) : "?"}: ${d.what}${d.when ? `, ${readableDay(d.when)}` : ""}`);
      return t(`Due: ${lines.join("; ")}.`, `Due: ${lines.join("; ")}.`);
    },
  };
};

/* shopping and meals */

type BuyItem = { name: string; quantity: number | null; unit: string | null; section: string; checked: boolean };

const shoppingList: Rule = (q, ctx) => {
  if (!/\b(list|listahan|to-?buy|shopping|grocery list|groceries list|bibilhin|need to buy|kailangan bilhin|what do we need|anong kailangan|anong bibilhin|ano bibilhin)\b/.test(q.text)) return null;
  const bare = /^(?:the |our |ang |yung )?(?:shopping |grocery |groceries |to-?buy )?(?:list|listahan|bibilhin)(?: natin| namin| ko)?$/.test(q.text);
  if (!bare && !/\b(what|ano|anong|show|whats|nasa|on the|sa|how many|ilan|is there|may|meron)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|idagdag|dagdag|pabili|remove|tanggalin|check|clear)\b/.test(q.text)) return null;
  const t = pick(q.lang);
  return {
    rule: "household.list",
    tool: "get_household",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const items = rows<BuyItem>(result, "shopping_list").filter((i) => !i.checked);
      if (items.length === 0) return t("The list is empty.", "Walang laman ang list.");
      const names = items.map((i) => {
        const qty = formatQuantity(i.quantity, i.unit);
        return qty ? `${qty} ${i.name}` : i.name;
      });
      return t(`To buy (${items.length}): ${joinList(names, 12)}.`, `Bibilhin (${items.length}): ${joinList(names, 12)}.`);
    },
    // ctx is unused here but keeps every rule the same shape.
    ...(ctx ? {} : {}),
  };
};

const meals: Rule = (q, ctx) => {
  if (!/\b(dinner|lunch|breakfast|meal|meals|ulam|hapunan|tanghalian|almusal|menu|cook|cooking|luto|lutuin|lulutuin|niluto|eating|kain|merienda|snack|meal plan)\b/.test(q.text)) return null;
  const bareMeal = /^(?:the |ang |yung )?(?:dinner|lunch|breakfast|meal|meals|ulam|hapunan|tanghalian|almusal|menu|merienda|snack|meal plan)(?: natin| namin| ko)?(?: (?:for |sa |ng |this |ngayong )?[a-z0-9 ]+)?$/.test(q.text) && q.words.length <= 5;
  if (!bareMeal && !/\b(what|ano|anong|whats|plan|planned|nakaplano|meron|may)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|idagdag|dagdag|cost|magkano|how much|recipe)\b/.test(q.text)) return null;
  const range = resolveRange(q.text, ctx.today) ?? single(ctx.today, `tonight (${dayLabel(ctx.today)})`, `ngayon (${dayLabel(ctx.today)})`);
  const t = pick(q.lang);
  return {
    rule: "household.meals",
    tool: "get_schedule",
    input: { from: range.from, to: range.to },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const planned = rows<Meal>(result, "meals").sort((a, b) => a.plan_date.localeCompare(b.plan_date));
      const label = q.lang === "tl" ? range.label.tl : range.label.en;
      if (planned.length === 0) return t(`No meal planned for ${label}.`, `Walang nakaplanong ulam ${label}.`);
      if (range.single) return t(`${label[0].toUpperCase()}${label.slice(1)}: ${planned.map((m) => m.dish).join(", ")}.`, `Ulam ${label}: ${planned.map((m) => m.dish).join(", ")}.`);
      return t(`Meals ${label}: ${planned.map((m) => `${readableDay(m.plan_date)} ${m.dish}`).join("; ")}.`, `Ulam ${label}: ${planned.map((m) => `${readableDay(m.plan_date)} ${m.dish}`).join("; ")}.`);
    },
  };
};

/* family */

type Member = { full_name: string; relationship: string | null; role: string; dob: string | null; status: string };

const whoIsInFamily: Rule = (q, ctx) => {
  const bareMembers = /^(?:the |our |ang |mga )?(?:family |household |pamilya )?members?(?: natin| namin| ng pamilya| ng household)?$/.test(q.text) || /^(?:sino sino|sinu-sino|sino-sino)(?: (?:ang|sa|dito))*(?: (?:pamilya|bahay|household|family))*$/.test(q.text);
  if (!bareMembers && !/\b(who|sino|sinu-sino|sino-sino|list|ilan|how many)\b/.test(q.text)) return null;
  if (!bareMembers && !/\b(family|household|pamilya|members?|kasama sa bahay|sa bahay|in kin)\b/.test(q.text)) return null;
  if (/\b(birthday|kaarawan|checkup|check-up|allerg|spend|gastos|owe|utang)\b/.test(q.text)) return null;
  const t = pick(q.lang);
  return {
    rule: "family.members",
    tool: "get_family",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const members = rows<Member>(result, "members");
      if (members.length === 0) return t("Nobody is listed yet.", "Wala pang nakalista.");
      const lines = members.map((m) => `${firstName(m.full_name)}${m.relationship ? ` (${m.relationship})` : ""}`);
      return t(`${members.length} in the household: ${lines.join(", ")}.`, `${members.length} sa pamilya: ${lines.join(", ")}.`);
    },
    ...(ctx ? {} : {}),
  };
};

const birthday: Rule = (q, ctx) => {
  if (!/\b(birthday|bday|kaarawan|born|how old|ilang taon|age)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|idagdag|party|gift|regalo)\b/.test(q.text)) return null;
  const who = resolveMember(q.text, ctx.members);
  if (!who) return null;
  const wantsAge = /\b(how old|ilang taon|age)\b/.test(q.text);
  const t = pick(q.lang);
  return {
    rule: wantsAge ? "family.age" : "family.birthday",
    tool: "get_family",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const m = rows<Member>(result, "members").find((r) => r.full_name === who) ?? rows<Member>(result, "members").find((r) => firstName(r.full_name).toLowerCase() === firstName(who).toLowerCase());
      const name = firstName(who);
      if (!m || !m.dob) return t(`${name}'s date of birth isn't recorded in Kin. Family → ${name} → Edit adds it.`, `Hindi pa nakarecord ang birthday ni ${name} sa Kin. Family → ${name} → Edit.`);
      const [y, mo, d] = m.dob.split("-").map(Number);
      const year = Number(ctx.today.slice(0, 4));
      const thisYear = `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const next = thisYear >= ctx.today ? thisYear : `${year + 1}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const turning = Number(next.slice(0, 4)) - y;
      const ageNow = turning - 1;
      const when = `${readableDay(next)} (${distance(next, ctx.today, q.lang)})`;
      if (wantsAge) return t(`${name} is ${ageNow}, turning ${turning} on ${when}.`, `${ageNow} si ${name}, magi-${turning} sa ${when}.`);
      return t(`${name}'s birthday is ${d} ${MONTHS_EN[mo - 1].replace(/^./, (c) => c.toUpperCase())}: turning ${turning} on ${when}.`, `Birthday ni ${name}: ${d} ${MONTHS_EN[mo - 1].replace(/^./, (c) => c.toUpperCase())}, magi-${turning} sa ${when}.`);
    },
  };
};

/* health */

const HEALTH_FACTS: { re: RegExp; key: string; en: string; tl: string }[] = [
  { re: /\b(allerg(?:y|ies|ic)|allergies)\b/, key: "allergies", en: "allergies", tl: "allergy" },
  { re: /\b(blood pressure|bp|weight|timbang|height|taas|sugar|glucose|temperature|lagnat|readings?|vitals?)\b/, key: "recent_readings_90_days", en: "recent readings", tl: "mga huling reading" },
  { re: /\b(blood ?type|dugo|type of blood)\b/, key: "blood_type", en: "blood type", tl: "blood type" },
  { re: /\b(medicines?|medication|meds|gamot|iniinom|dose|doses|dosage)\b/, key: "medicines_now", en: "medicines now", tl: "gamot ngayon" },
  { re: /\b(hmo|insurance|maxicare|intellicare|medicard|philcare)\b/, key: "hmo_or_insurance", en: "HMO or insurance", tl: "HMO o insurance" },
  { re: /\b(philhealth)\b/, key: "philhealth", en: "PhilHealth", tl: "PhilHealth" },
  { re: /\b(doctor|doktor|physician|pedia|pediatrician)\b/, key: "usual_doctor", en: "usual doctor", tl: "doktor" },
  { re: /\b(conditions?|sakit|diagnos(?:is|ed)|illness(?:es)?)\b/, key: "conditions", en: "conditions", tl: "mga sakit" },
  { re: /\b(who to call|who (?:should|do) (?:i|we) call|emergency contacts?|emergency numbers?|emergency|tawagan|tatawagan)\b/, key: "who_to_call", en: "who to call", tl: "tatawagan" },
  { re: /\b(vaccines?|vaccination|bakuna|shots)\b/, key: "vaccines_given", en: "vaccines", tl: "bakuna" },
];

function healthValue(v: unknown): string {
  if (v === undefined || v === null) return "not recorded";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          if (typeof o.name === "string") {
            const dose = typeof o.dose === "string" ? ` ${o.dose}` : "";
            const times = Array.isArray(o.times) ? ` at ${o.times.join(", ")}` : typeof o.times === "string" ? ` ${o.times}` : "";
            const notes = typeof o.notes === "string" ? ` (${o.notes})` : "";
            const phone = typeof o.phone === "string" ? ` ${o.phone}` : "";
            const rel = typeof o.relationship === "string" ? ` (${o.relationship})` : "";
            return `${o.name}${dose}${times}${notes}${rel}${phone}`;
          }
          return JSON.stringify(o);
        }
        return String(item);
      })
      .join("; ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const health: Rule = (q, ctx) => {
  const fact = HEALTH_FACTS.find((f) => f.re.test(q.text));
  if (!fact) return null;
  // A health question is never a rule's unless the asker may hear the
  // answer; otherwise it is left to the model, whose tool refuses it too.
  if (!ctx.canAskHealth) return null;
  if (/\b(add|pa-?add|idagdag|record|log|took|uminom|given|binigay)\b/.test(q.text)) return null;
  // The emergency list is the household's: with nobody named, the asker's own
  // card has it.
  const who = resolveMember(q.text, ctx.members) ?? (fact.key === "who_to_call" ? ctx.me ?? null : null);
  if (!who) return null;
  const t = pick(q.lang);
  return {
    rule: `health.${fact.key}`,
    tool: "get_health",
    input: { member_name: firstName(who) },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const value = healthValue(field(result, fact.key));
      const name = firstName(who);
      return t(`${name}'s ${fact.en}: ${value}.`, `${fact.tl[0].toUpperCase()}${fact.tl.slice(1)} ni ${name}: ${value}.`);
    },
  };
};

/* adds */

const UNIT_WORDS: Record<string, (typeof UNITS)[number]> = {
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  g: "g", gram: "g", grams: "g", gramo: "g",
  l: "L", liter: "L", liters: "L", litre: "L", litres: "L", litro: "L",
  ml: "mL",
  pc: "pc", pcs: "pc", piece: "pc", pieces: "pc", piraso: "pc",
  pack: "pack", packs: "pack", pakete: "pack",
  can: "can", cans: "can", lata: "can",
  bottle: "bottle", bottles: "bottle", bote: "bottle",
  jar: "jar", jars: "jar",
  box: "box", boxes: "box", kahon: "box",
  sachet: "sachet", sachets: "sachet",
  dozen: "dozen", dozens: "dozen", dosena: "dozen",
  bundle: "bundle", bundles: "bundle", tali: "bundle",
  tray: "tray", trays: "tray",
  sack: "sack", sacks: "sack", sako: "sack",
  tub: "tub", tubs: "tub",
};

function parseItem(raw: string): { name: string; quantity?: number; unit?: string } | null {
  const text = raw
    .replace(/^(?:some|a few|a|an|ng|mga|yung|the)\s+/, "")
    .replace(/\s+(?:bukas|tomorrow|today|ngayon|mamaya|later|please|naman|nga|po|ha|na|din|rin)$/g, "")
    .trim();
  if (!text) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(?:([a-z]+)\s+)?(?:of\s+|ng\s+|na\s+)?(.+)$/.exec(text);
  if (m) {
    const quantity = Number(m[1]);
    const unitWord = m[2]?.toLowerCase();
    const unit = unitWord ? UNIT_WORDS[unitWord] : undefined;
    const name = (unit || !unitWord ? m[3] : `${unitWord} ${m[3]}`).trim();
    if (!name) return null;
    return { name, quantity, ...(unit ? { unit } : {}) };
  }
  // "rice 5kg", "eggs x12": the quantity after the item, as Quick add reads it.
  const trailing = readShopping(text);
  if (trailing.quantity !== null && trailing.name) {
    const name = trailing.name[0].toLowerCase() === text[0] ? trailing.name[0].toLowerCase() + trailing.name.slice(1) : trailing.name;
    return { name, quantity: trailing.quantity, ...(trailing.unit ? { unit: trailing.unit } : {}) };
  }
  return { name: text };
}

/** Whether the list would know where to file this: a market section other
 * than Other, for the word or its singular. */
function looksLikeGrocery(name: string): boolean {
  const n = name.toLowerCase();
  return guessSection(n) !== "Other" || guessSection(n.replace(/(ie)?s$/, (m) => (m === "ies" ? "y" : ""))) !== "Other";
}

const addToList: Rule = (q, ctx) => {
  // "we need milk", "need eggs and bread", "kailangan natin ng gatas": the
  // list, as Today's one-line add reads them.
  const need = /^(?:we |i )?(?:need|needs|kailangan(?: natin| namin| ko)?(?: ng| bumili ng| pa ng)?)\s+(?:some |more |to buy |ng )?(.+)$/.exec(q.text);
  if (need && !/\b(money|pera|help|tulong|to|ba|ba tayo|plan|advice|budget|time|oras)\b/.test(need[1]) && need[1].split(" ").length <= 6) {
    const items = need[1].split(/\s*,\s*|\s+(?:and|at|&)\s+/).map(parseItem).filter((i): i is NonNullable<typeof i> => i !== null).map((i) => ({ ...i, name: asTyped(i.name, q.raw) }));
    // "We need a new car" is not groceries: every item has to land in a
    // market section the list knows, not Other.
    if (items.length > 0 && items.every((i) => looksLikeGrocery(i.name))) {
      const t = pick(q.lang);
      return {
        rule: "add.list",
        tool: "add_buy_items",
        input: { items },
        lang: q.lang,
        say: (result) => {
          if (isError(result)) return result.error;
          const added = rows<{ name: string; quantity?: string }>(result, "items").map((i) => (i.quantity ? `${i.quantity} ${i.name}` : i.name));
          const names = added.length > 0 ? added : items.map((i) => i.name);
          return t(`Added to the list: ${names.join(", ")}.`, `Na-add sa list: ${names.join(", ")}.`);
        },
      };
    }
  }
  // "gatas pa-add": the verb at the end, the Filipino way. "list: eggs",
  // "eggs to the list": the list named, no verb.
  const tail = /^(.+?)\s+(pa-?add|paki-?add|idagdag|pabili|pakibili)(?:\s+(?:sa|to)\s+(?:the\s+)?(?:list|listahan))?$/.exec(q.text);
  const listFirst = /^(?:shopping |grocery )?(?:list|listahan|to-?buy)\s*[:\-–]\s*(.+)$/.exec(q.text) ?? /^(.+?)\s+(?:to|sa|on)\s+(?:the\s+|ang\s+)?(?:shopping |grocery )?(?:list|listahan)$/.exec(q.text);
  const text = tail ? `${tail[2]} ng ${tail[1]}` : listFirst && !/^(?:please |paki |pwede )?(?:add|pa-?add|paki-?add|i-?add|idagdag|dagdag|put|ilagay|what|ano|anong|tick|bought|is|are|may|meron|do)\b/.test(q.text) ? `add ${listFirst[1]} to the list` : q.text;
  // The verb: add / pa-add / idagdag / pabili ...
  const verb = /^(?:please\s+|paki\s+|pwede\s+|kin\s+|hey kin\s+|hi kin\s+)?(add|pa-?add|paki-?add|i-?add|idagdag|dagdag|dagdagan|pakidagdag|ilagay|put|pabili|pakibili|pa-?bili|bili)\b\s*(?:(?:ng|ang|mo|mo ng|nga|please|naman|nyo|ninyo|niyo|of|tayo|kami|na|muna|din|rin)\s+)*(.*)$/.exec(text);
  if (!verb) return null;
  let rest = verb[2].trim();
  if (!rest) return null;
  if (/\b(bill|bills|due|event|activity|appointment|goal|trip|journal|meal|dinner|lunch|calendar|schedule|planner|budget|account|reminder|note|task|chore|ulam|lakad|birthday|kaarawan|holiday)\b/.test(rest)) return null;
  if (/\b(₱|php|\d{3,})\b/.test(rest) && /\b(for|sa|due|worth)\b/.test(rest)) return null;
  // Where it goes. English needs the list named; Filipino "pa-add ng gatas" is the list.
  const target = /\s+(?:to|on|onto|in|into|sa)\s+(?:the\s+|our\s+|my\s+|ang\s+|aming\s+|ating\s+)?(?:shopping\s+|grocery\s+|groceries\s+|to-?buy\s+|market\s+|palengke\s+|grocery\s+)?(?:list|listahan|bilihin|to-?buy|groceries|cart)\b(?:\s+(?:please|naman|nga|po|ha|na|ngayon|today|bukas|tomorrow))*$/;
  const leading = /^(?:to |sa |on )?(?:the |our |ang )?(?:shopping |grocery |groceries )?(?:list|listahan|bilihin|to-?buy)\s*[:\-–]?\s*(.+)$/.exec(rest);
  if (leading) rest = leading[1].trim();
  const named = !!leading || target.test(rest);
  const filipino = /^(pa-?add|paki-?add|idagdag|dagdag|dagdagan|pakidagdag|pabili|pakibili|pa-?bili|bili)$/.test(verb[1]) || q.lang === "tl";
  // "add 5 kg rice", "add egg": no list named, but every item is a grocery
  // the list knows where to file, and nothing says a day or a time.
  const groceryOnly = !named && !filipino && !resolveRange(rest, ctx.today) && !/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/.test(rest) && rest.split(/\s*,\s*|\s+(?:and|&)\s+/).every((part) => {
    const item = parseItem(part);
    return !!item && looksLikeGrocery(item.name);
  });
  if (!named && !filipino && !groceryOnly) return null;
  rest = rest.replace(target, "").replace(/\s+(?:please|naman|nga|po|ha|na|din|rin)$/g, "").trim();
  if (!rest) return null;
  // "milk and eggs", "gatas at itlog", "milk, eggs, bread"
  const parts = rest.split(/\s*,\s*|\s+(?:and|at|&|tsaka|saka|pati)\s+/).map((p) => p.trim()).filter(Boolean);
  const items = parts.map(parseItem).filter((i): i is NonNullable<typeof i> => i !== null).map((i) => ({ ...i, name: asTyped(i.name, q.raw) }));
  if (items.length === 0 || items.length > 12) return null;
  if (items.some((i) => i.name.split(" ").length > 5)) return null;
  const t = pick(q.lang);
  return {
    rule: "add.list",
    tool: "add_buy_items",
    input: { items },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const added = rows<{ name: string; quantity?: string }>(result, "items").map((i) => (i.quantity ? `${i.quantity} ${i.name}` : i.name));
      const names = added.length > 0 ? added : items.map((i) => i.name);
      return t(`Added to the list: ${names.join(", ")}.`, `Na-add sa list: ${names.join(", ")}.`);
    },
  };
};

/** A peso amount in a line: ₱3,200 / 3200 / php 3200 / 3.2k / 850 pesos. */
function readAmount(text: string): number | null {
  const m = /(?:₱|\bphp|\bp)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k\b)?(?:\s*(?:pesos|php|piso))?/.exec(text);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  return amount > 0 ? amount : null;
}

const BILL_RECURRENCE = (text: string): "monthly" | "once" | "yearly" | "quarterly" | "weekly" | undefined =>
  /\b(yearly|annual|annually|every year|taon-taon|per year)\b/.test(text)
    ? "yearly"
    : /\b(quarterly|every quarter|every 3 months)\b/.test(text)
      ? "quarterly"
      : /\b(weekly|every week|linggo-linggo|lingguhan)\b/.test(text)
        ? "weekly"
        : /\b(monthly|every month|buwan-buwan|buwanang|every|tuwing)\b/.test(text)
          ? "monthly"
          : /\b(once|one-?time|isang beses|lang)\b/.test(text)
            ? "once"
            : undefined;

/** The add_bill match once name, amount and due date are all known. */
function addBillMatch(name: string, amount: number, dueDate: string, lang: Lang, ctx: RuleContext, extra: { category?: string; recurrence?: string }): RuleMatch {
  const t = pick(lang);
  const titled = name.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return {
    rule: "add.bill",
    tool: "add_bill",
    input: { name: titled, amount, due_date: dueDate, ...(extra.category ? { category: extra.category } : {}), ...(extra.recurrence ? { recurrence: extra.recurrence } : {}) },
    lang,
    say: (result) => {
      if (isError(result)) return result.error;
      return t(`Added ${titled}, ${money(amount, ctx.currency)} due ${readableDay(dueDate)}.`, `Na-add ang ${titled}, ${money(amount, ctx.currency)}, due sa ${readableDay(dueDate)}.`);
    },
  };
}

/** The question for whatever a bill still lacks, with what is known kept. */
function askForBill(name: string, amount: number | null, dueDate: string | null, lang: Lang, asked: number, extra: { category?: string; recurrence?: string }): Ask {
  const t = pick(lang);
  const titled = name.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const ask =
    amount === null && dueDate === null
      ? t(`How much is the ${titled} bill, and when is it due?`, `Magkano ang ${titled}, at kailan ang due?`)
      : amount === null
        ? t(`How much is the ${titled} bill?`, `Magkano ang ${titled}?`)
        : t(`When is ${titled} due?`, `Kailan due ang ${titled}?`);
  const slots: Record<string, string | number> = { name };
  if (amount !== null) slots.amount = amount;
  if (dueDate) slots.due_date = dueDate;
  if (extra.category) slots.category = extra.category;
  if (extra.recurrence) slots.recurrence = extra.recurrence;
  return { ask, pending: { rule: "add.bill", slots, lang, asked } };
}

const addBill: Rule = (q, ctx) => {
  if (!/^(?:please\s+|paki\s+|pwede\s+)?(?:add|pa-?add|paki-?add|i-?add|idagdag|dagdag|track|new|record)\b/.test(q.text)) return null;
  if (!/\b(bill|bills|due|babayaran|bayarin|subscription)\b/.test(q.text)) return null;
  const beforeDue = q.text.replace(/\bdue\b.*$/, "");
  const amount = readAmount(beforeDue);
  // The date: after "due" (or "sa"/"on" when "due" sits before the amount).
  const dueText = /\bdue\b(.*)$/.exec(q.text)?.[1] ?? /\b(?:on|sa|every|tuwing)\b(.*)$/.exec(q.text)?.[1];
  const range = dueText ? resolveRange(dueText.trim(), ctx.today) : null;
  const dueDate = range && range.single ? range.from : null;
  // The name: what is left once the verb, the amount, the date and the filler go.
  const name = beforeDue
    .replace(/(?:₱|\bphp|\bp)?\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*k?(?:\s*(?:pesos|php|piso))?|(?:₱|\bphp|\bp)?\s*\d+(?:\.\d+)?\s*k?(?:\s*(?:pesos|php|piso))?/, " ")
    .replace(/^(?:please\s+|paki\s+|pwede\s+)?(?:add|pa-?add|paki-?add|i-?add|idagdag|dagdag|track|new|record)\b/, " ")
    .replace(/\b(a|an|the|new|bill|bills|subscription|of|for|ng|ang|na|sa|our|my|natin|namin|ko|worth|amount|amounting|to|please|naman|nga|po|babayaran|bayarin|this month|ngayong buwan|monthly|every month)\b/g, " ")
    .replace(/[:\-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  const extra = { category: categoryIn(q.text) ?? billCategory(name) ?? undefined, recurrence: BILL_RECURRENCE(q.text) };
  // A bill is money due on a day: a missing amount or day is asked for, not
  // guessed and not handed on.
  if (amount === null || !dueDate) return askForBill(name, amount, dueDate, q.lang, 1, extra);
  return addBillMatch(name, amount, dueDate, q.lang, ctx, extra);
};

/* plain adds through the one-line parser (lib/quick-line.ts): an activity
 * with a day and a time, an event, a meal for a day. Filipino day words are
 * put into English first; the parser's grammar is English. */

const TL_TO_EN: [RegExp, string][] = [
  [/\bsa makalawa\b/g, "in 2 days"],
  [/\bbukas\b/g, "tomorrow"],
  [/\b(ngayon|ngayong araw|mamaya)\b/g, "today"],
  [/\bsa susunod na linggo\b/g, "next week"],
  [/\bsa susunod na\b/g, "next"],
  [/\b(?:sa |tuwing )?(linggo)\b/g, "sunday"],
  [/\b(?:sa |tuwing )?lunes\b/g, "monday"],
  [/\b(?:sa |tuwing )?martes\b/g, "tuesday"],
  [/\b(?:sa |tuwing )?miyerkules\b/g, "wednesday"],
  [/\b(?:sa |tuwing )?huwebes\b/g, "thursday"],
  [/\b(?:sa |tuwing )?biyernes\b/g, "friday"],
  [/\b(?:sa |tuwing )?sabado\b/g, "saturday"],
  [/\benero\b/g, "jan"], [/\bpebrero\b/g, "feb"], [/\bmarso\b/g, "mar"], [/\babril\b/g, "apr"], [/\bmayo\b/g, "may"], [/\bhunyo\b/g, "jun"],
  [/\bhulyo\b/g, "jul"], [/\bagosto\b/g, "aug"], [/\bsetyembre\b/g, "sep"], [/\boktubre\b/g, "oct"], [/\bnobyembre\b/g, "nov"], [/\bdisyembre\b/g, "dec"],
  [/\balas[- ](\d{1,2})\b/g, "at $1"],
  [/\bng (umaga)\b/g, "am"], [/\bng (hapon|gabi)\b/g, "pm"],
  [/\b(ulam|hapunan)\b/g, "dinner"], [/\btanghalian\b/g, "lunch"], [/\b(almusal|agahan)\b/g, "breakfast"],
  [/\bkaarawan\b/g, "birthday"],
  [/\b(ni|kay|para kay|para sa)\s+/g, ""],
  [/\b(ng|ang|na|sa|yung|si)\s+/g, ""],
];

const ADD_VERB = /^(?:please\s+|paki\s+|pwede\s+|kin\s+)?(add|pa-?add|paki-?add|i-?add|idagdag|dagdag|pakidagdag|schedule|pa-?schedule|i-?schedule|book|put|ilagay|lagay|set|plan|note down|isulat)\b\s*(?:a |an |the |ng |ang |mo |mo ng |nga |naman |to |on |in |sa )*(.*)$/;

/** The words of `text` as the member typed them: the parser works on the
 * lowercased line, and "Lola Nena's birthday" should read back as written. */
function asTyped(text: string, raw: string): string {
  return text
    .split(" ")
    .map((word) => {
      const m = new RegExp(`(^|[^\\p{L}])(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![\\p{L}])`, "iu").exec(raw);
      return m ? m[2] : word;
    })
    .join(" ");
}

function withRawCase(text: string, raw: string): string {
  return asTyped(text, raw).replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** A title without the people it is for: "Lia dentist" is Dentist, for Lia. */
function withoutNames(title: string, names: string[]): string {
  let t = title;
  for (const n of names) t = t.replace(new RegExp(`(^|\\s)${firstName(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:'s)?(?=\\s|$)`, "i"), " ");
  t = t.replace(/\s+/g, " ").trim();
  // "Swimming for Lia and Ben" leaves "for and" behind: peel the joiners off
  // both ends until none is left.
  for (let i = 0; i < 4; i++) t = t.replace(/^(for|with|and|at|to|para|kasama)\s+/i, "").replace(/\s+(for|with|and|at|to|para|kasama)$/i, "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

const addPlain: Rule = (q, ctx) => {
  const verb = ADD_VERB.exec(q.text);
  if (!verb) return null;
  let rest = verb[2].trim();
  if (!rest) return null;
  // The adds with their own rule, and the ones the model keeps.
  if (/\b(bill|bills|due|list|listahan|bilihin|to-?buy|goal|journal|diary|trip|budget|account|reminder|chore|routine|allowance|₱|php|pesos|piso)\b/.test(rest) || /\d{3,}/.test(rest)) return null;
  // Something that repeats is a routine, which the add tools do not write.
  if (/\b(every|tuwing|weekly|daily|monthly|araw-araw|linggo-linggo|buwan-buwan|each)\b/.test(rest)) return null;
  for (const [re, en] of TL_TO_EN) rest = rest.replace(re, en);
  rest = rest.replace(/\s+/g, " ").trim();
  const members = ctx.members.map((name) => ({ id: name, name }));
  const parsed = parseQuickLine(rest, { today: ctx.today, members, meId: ctx.me });
  if (!parsed) return null;
  const t = pick(q.lang);
  const hasDay = !!resolveRange(rest, ctx.today);
  if (parsed.kind === "meal") {
    if (!hasDay) return null;
    return {
      rule: "add.meal",
      tool: "add_meal_plan",
      input: { date: parsed.date, dish: withRawCase(parsed.dish, q.raw) },
      lang: q.lang,
      say: (result) => (isError(result) ? result.error : t(`Planned ${withRawCase(parsed.dish, q.raw)} for ${readableDay(parsed.date)}.`, `Nakaplano na ang ${withRawCase(parsed.dish, q.raw)} sa ${readableDay(parsed.date)}.`)),
    };
  }
  if (parsed.kind === "event") {
    if (!hasDay || parsed.title === "Untitled") return null;
    const title = withRawCase(parsed.title, q.raw);
    return {
      rule: "add.event",
      tool: "add_event",
      input: { title, date: parsed.date, kind: parsed.eventKind, ...(parsed.note ? { note: parsed.note } : {}) },
      lang: q.lang,
      say: (result) => (isError(result) ? result.error : t(`Added ${title} on ${readableDay(parsed.date)}.`, `Na-add ang ${title} sa ${readableDay(parsed.date)}.`)),
    };
  }
  if (parsed.kind === "task") {
    if (parsed.title === "Untitled") return null;
    const wholeFamily = parsed.wholeFamily || /\b(family|pamilya|everyone|lahat)\b/i.test(parsed.title);
    const who = wholeFamily ? [] : parsed.who.map(firstName);
    const title = withRawCase(withoutNames(parsed.title, parsed.who), q.raw);
    if (!title) return null;
    // An activity needs a day and a time. Missing, ask for just that.
    if (!hasDay || !parsed.from) return askForActivity(title, hasDay ? parsed.date : null, who, wholeFamily, q.lang, 1);
    return activityMatch(title, parsed.date, parsed.from, parsed.to, who, wholeFamily, q.lang);
  }
  return null;
};

function activityMatch(title: string, date: string, from: string, to: string | null, who: string[], wholeFamily: boolean, lang: Lang): RuleMatch {
  const t = pick(lang);
  return {
    rule: "add.activity",
    tool: "add_activity",
    input: { title, date, start_time: from, ...(to ? { end_time: to } : {}), whole_family: wholeFamily || who.length === 0, ...(who.length > 0 ? { member_names: who } : {}) },
    lang,
    say: (result) => (isError(result) ? result.error : t(`Added ${title}, ${readableDay(date)} ${from}${who.length > 0 ? ` (${who.join(", ")})` : ""}.`, `Na-add ang ${title}, ${readableDay(date)} ${from}${who.length > 0 ? ` (${who.join(", ")})` : ""}.`)),
  };
}

function askForActivity(title: string, date: string | null, who: string[], wholeFamily: boolean, lang: Lang, asked: number): Ask {
  const t = pick(lang);
  const forWho = who.length > 0 ? ` (${who.join(", ")})` : "";
  return {
    ask: date ? t(`What time is ${title} on ${readableDay(date)}${forWho}?`, `Anong oras ang ${title} sa ${readableDay(date)}${forWho}?`) : t(`When is ${title}${forWho}? Give me the day and the time.`, `Kailan ang ${title}${forWho}? Araw at oras.`),
    pending: { rule: "add.activity", slots: { title, ...(date ? { date } : {}), who: who.join("|"), whole_family: wholeFamily ? 1 : 0 }, lang, asked },
  };
}

const addGoal: Rule = (q, ctx) => {
  const m = /^(?:please\s+|paki\s+)?(?:add|pa-?add|i-?add|idagdag|set|new|create|start|gumawa ng|mag-?set ng)\s+(?:a |an |ng |ang |new |bagong )*(?:savings |money |ipon )?(?:goal|target|ipon|fund)\b\s*[:\-–]?\s*(.*)$/.exec(q.text) ?? /^(?:please\s+)?(?:add|pa-?add|set|create|start)\s+(.+?\bfund)\b\s*(.*)$/.exec(q.text);
  if (!m) return null;
  const body = m[2] !== undefined && /\bfund\b/.test(m[1]) ? `${m[1]} ${m[2]}` : m[1];
  const amount = readAmount(body.replace(/\b\d{1,2}(?:st|nd|rd|th)\b/g, " "));
  if (!amount || amount < 100) return null;
  const byText = /\b(?:by|before|until|hanggang|bago|sa)\s+(.*)$/.exec(body)?.[1];
  const target = byText ? resolveRange(byText, ctx.today) : null;
  const title = body
    .replace(/(?:₱|\bphp|\bp)?\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*k?(?:\s*(?:pesos|php|piso))?|(?:₱|\bphp|\bp)?\s*\d+(?:\.\d+)?\s*k?(?:\s*(?:pesos|php|piso))?/, " ")
    .replace(/\b(?:by|before|until|hanggang|bago|sa)\s+.*$/, " ")
    .replace(/\b(for|of|na|para|worth|target|goal|the|a|an|ng|ang|called|named)\b/g, " ")
    .replace(/[:\-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;
  const titled = withRawCase(title, q.raw);
  const t = pick(q.lang);
  const targetDate = target?.single ? target.from : target ? target.to : null;
  return {
    rule: "add.goal",
    tool: "add_goal",
    input: { title: titled, target_amount: amount, ...(targetDate ? { target_date: targetDate } : {}) },
    lang: q.lang,
    say: (result) => (isError(result) ? result.error : t(`Goal set: ${titled}, ${money(amount, ctx.currency)}${targetDate ? ` by ${readableDay(targetDate)}` : ""}.`, `Set na ang goal: ${titled}, ${money(amount, ctx.currency)}${targetDate ? ` hanggang ${readableDay(targetDate)}` : ""}.`)),
  };
};

const addJournal: Rule = (q, ctx) => {
  const m = /^(?:please\s+|paki\s+)?(?:(?:add|pa-?add|write|isulat|put|note|log|record)\s+(?:this |it |ito )?(?:to |in |into |sa )?(?:the |ang )?)?(?:journal|diary|talaarawan)(?:\s+entry)?\s*[:\-–]\s*(.+)$/.exec(q.text) ?? /^(?:add|pa-?add|write|isulat)\s+(?:a |an |ng )?(?:journal|diary)\s+entry\s+(?:about |na |tungkol sa )?(.+)$/.exec(q.text);
  if (!m) return null;
  const title = m[1].trim();
  if (title.length < 3) return null;
  const range = resolveRange(title, ctx.today);
  const t = pick(q.lang);
  // Kept as typed: the sentence is the entry. The casing of a diary line is
  // the writer's.
  const titled = q.raw.slice(q.raw.toLowerCase().indexOf(title)).trim() || title;
  return {
    rule: "add.journal",
    tool: "add_journal_entry",
    input: { title: titled, ...(range?.single ? { date: range.from } : {}) },
    lang: q.lang,
    say: (result) => (isError(result) ? result.error : t(`Written in the journal${range?.single ? ` for ${readableDay(range.from)}` : ""}.`, `Nakasulat na sa journal${range?.single ? ` para sa ${readableDay(range.from)}` : ""}.`)),
  };
};

const addTrip: Rule = (q, ctx) => {
  const m = /^(?:please\s+|paki\s+)?(?:add|pa-?add|plan|book|schedule|i-?plan|mag-?plan ng)\s+(?:a |an |ng |ang |our |the )?(?:trip|travel|vacation|biyahe|bakasyon|getaway)\s+(?:to |sa |papuntang )?(.+)$/.exec(q.text);
  if (!m) return null;
  const body = m[1];
  // "Dec 20 to Dec 23", "Dec 20-23", "from the 20th to the 23rd"
  const span = /^(.*?)\s+(?:from\s+)?(.+?)\s*(?:-|–|to|until|hanggang)\s*(.+)$/.exec(body);
  const start = span ? resolveRange(span[2], ctx.today) : resolveRange(body, ctx.today);
  if (!start || !start.single) return null;
  let end: string | null = null;
  if (span) {
    const endText = span[3].trim();
    const endRange = resolveRange(endText, ctx.today) ?? (/^\d{1,2}$/.test(endText) ? resolveRange(`${start.from.slice(5, 7) ? MONTHS_EN[Number(start.from.slice(5, 7)) - 1] : ""} ${endText}`, ctx.today) : null);
    if (!endRange || !endRange.single || endRange.from < start.from) return null;
    end = endRange.from;
  }
  const dateWords = new RegExp(`\\b(${[...MONTHS_EN, ...MONTH_SHORT, ...WEEKDAYS_EN, ...WEEKDAY_SHORT, "next", "this", "week", "weekend", "month", "the", "from", "to", "until", "on", "in"].join("|")})\\b`, "g");
  const title = (span ? span[1] : body)
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\b/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(dateWords, " ")
    .replace(/[,\-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;
  const titled = withRawCase(title, q.raw);
  const t = pick(q.lang);
  return {
    rule: "add.trip",
    tool: "add_trip",
    input: { title: titled, start_date: start.from, ...(end ? { end_date: end } : {}) },
    lang: q.lang,
    say: (result) => (isError(result) ? result.error : t(`Trip planned: ${titled}, ${readableDay(start.from)}${end ? ` to ${readableDay(end)}` : ""}.`, `Nakaplano na ang trip: ${titled}, ${readableDay(start.from)}${end ? ` hanggang ${readableDay(end)}` : ""}.`)),
  };
};


/* ------------------------------------------------ the wider lookups (PR 3) */

type Goal = { title: string; target_amount: number | null; current_amount: number; target_date: string | null };

const goals: Rule = (q, ctx) => {
  if (!/\b(goal|goals|fund|ipon|savings|saved|saving|target|kulang|how much more)\b/.test(q.text)) return null;
  const bare = /^(?:our |the |mga )?(?:savings )?(?:goals?|ipon|funds?)(?: natin| namin| ko| progress| list)?$/.test(q.text);
  if (!bare && !/\b(how far|how much|magkano|progress|how is|how are|kumusta|what are|ano ang|anong|list|status|close|malapit|na ba|have we|did we|is the|is our|kulang|short|more|pa)\b/.test(q.text)) return null;
  if (/\b(spend|spent|gastos|budget|bill|bills|add|pa-?add|set|create|chore|chores|this month|ngayong buwan|last month|account|in (?:our |my |the )?savings|sa savings|net worth)\b/.test(q.text)) return null;
  const name = q.text
    .replace(/\b(how far|how much|magkano|progress|how is|how are|kumusta|what are|ano ang|anong|list|status|close|malapit|na ba|have we|did we|is the|is our|are we|along|with|the|our|my|ang|ng|ni|sa|na|ba|natin|namin|ko|goal|goals|fund|savings|saving|saved|for|to|on|of|ipon|target|towards?|so far|already|pa|lang|yet|kulang|short|more|do we need|need|still|para|trip)\b/g, " ")
    .replace(/'s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const t = pick(q.lang);
  const line = (g: Goal) => {
    const target = Number(g.target_amount) || 0;
    const pct = target > 0 ? Math.round((Number(g.current_amount) / target) * 100) : null;
    const when = g.target_date ? `, target ${readableDay(g.target_date)}` : "";
    return `${g.title}: ${money(g.current_amount, ctx.currency)}${target > 0 ? ` of ${money(target, ctx.currency)} (${pct}%)` : ""}${when}`;
  };
  return {
    rule: name ? "goals.one" : "goals.list",
    tool: "get_money",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const all = rows<Goal>(result, "goals");
      if (all.length === 0) return t("No savings goals in Kin yet.", "Wala pang savings goal sa Kin.");
      if (name) {
        const words = name.split(" ").filter((w) => w.length > 2);
        const hits = all.filter((g) => words.some((w) => g.title.toLowerCase().includes(w)));
        if (hits.length === 0) return t(`No goal called "${name}". Goals: ${joinList(all.map((g) => g.title))}.`, `Walang goal na "${name}". Goals: ${joinList(all.map((g) => g.title))}.`);
        return hits.map(line).join("; ") + ".";
      }
      return `Goals (${all.length}): ${all.slice(0, 5).map(line).join("; ")}${all.length > 5 ? ` +${all.length - 5}` : ""}.`;
    },
  };
};

type Lending = { person: string; amount: number; paid: number; left: number; due: string | null };

const debts: Rule = (q, ctx) => {
  if (!/\b(owe|owes|owed|utang|loan|loans|debt|debts|hulugan|amortization|borrowed|lent|pautang|inutang|inutangan|pinahiram|hiniram|humiram|nagpahiram|credit card|card balance)\b/.test(q.text)) return null;
  if (/\b(bill|bills|add|pa-?add|record|log|paid|bayad na|nagbayad)\b/.test(q.text)) return null;
  const whoOwesUs = /\b(who owes|who borrowed|sino (?:ang )?(?:may utang|humiram|nakautang|umutang)|owes us|owe us|owes? me|utang sa (?:atin|amin|akin)|lent|pinahiram|pautang|sino may utang|does \w+(?: \w+)? owe|how much does|utang (?:ni|ng) (?!natin|namin|ko)\w+|owes?$)\b/.test(q.text) && !/\b(do we owe|do i owe)\b/.test(q.text);
  // "How much do we owe", "what do we owe": the bills rule's (unpaid bills plus debts).
  if (/\b(how much|what|magkano|ano) do we owe$/.test(q.text) || /^(?:how much|magkano) (?:ang )?utang natin$/.test(q.text)) return null;
  const owePerson = /\bdo (?:we|i) owe\s+(?!on\b|for\b|in\b|the\b|our\b|any\b|this\b)([a-z]+(?: [a-z]+)?)$/.exec(q.text);
  const weOwe = /\b(do i owe anyone|do i owe anybody|do we owe anyone|do we owe anybody|whom do (?:we|i) owe|who do (?:we|i) owe|sino (?:ang )?(?:inutangan|pinagkakautangan)|we borrowed|hiniram|humiram (?:tayo|kami|ako)|utang (?:ko|natin|namin) kay)\b/.test(q.text) || (!!owePerson && !/\b(loan|loans|debt|debts|hulugan|card)\b/.test(q.text));
  const loanWords = /\b(loan|loans|hulugan|amortization|car|house|condo|motor|credit card|liability|liabilities|debts?)\b/.test(q.text);
  const who = resolveMember(q.text, ctx.members);
  // A plain "how much do we owe" is the bills rule's (unpaid bills plus debts).
  if (!whoOwesUs && !weOwe && !loanWords) return null;
  const person = q.text
    .replace(/\b(how much|magkano|does|do|did|is|are|what|ano|anong|who|sino|sinong|owe|owes|owed|owing|utang|loan|loans|debt|debts|left|pa|on|the|our|my|ang|ng|ni|kay|sa|na|ba|natin|namin|ko|to|us|me|we|i|still|balance|remaining|hulugan|amortization|much|ilan|may|meron|mayroon|atin|amin|akin|kanila|tayo|kami|anyone|anybody|borrowed|lent|pinahiram|hiniram|humiram|pautang|inutang|inutangan|nagpahiram|have|has|got)\b/g, " ")
    .replace(/'s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const t = pick(q.lang);
  const lineOf = (u: Lending) => `${u.person} ${money(u.left, ctx.currency)}${u.due ? ` (due ${readableDay(u.due)})` : ""}`;
  return {
    rule: whoOwesUs ? "debts.owed_to_us" : weOwe ? "debts.we_owe" : "debts.loans",
    tool: "get_debts",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const owedToUs = rows<Lending>(result, "owed_to_us");
      const weOweList = rows<Lending>(result, "we_owe");
      const liabilities = rows<{ name: string; balance: number }>(result, "liabilities");
      if (whoOwesUs) {
        const hits = person && !who ? owedToUs.filter((u) => u.person.toLowerCase().includes(person)) : owedToUs;
        if (hits.length === 0) return person && !who ? t(`${person} owes nothing recorded in Kin.`, `Walang nakarecord na utang ni ${person}.`) : t("Nobody owes the family anything recorded in Kin.", "Walang may utang sa atin na nakarecord.");
        const total = hits.reduce((s, u) => s + Number(u.left), 0);
        return t(`Owed to us (${hits.length}): ${hits.map(lineOf).join("; ")}. Total ${money(total, ctx.currency)}.`, `May utang sa atin (${hits.length}): ${hits.map(lineOf).join("; ")}. Total ${money(total, ctx.currency)}.`);
      }
      if (weOwe) {
        if (weOweList.length === 0) return t("No lending owed to anyone recorded in Kin.", "Walang nakarecord na utang natin sa iba.");
        const total = weOweList.reduce((s, u) => s + Number(u.left), 0);
        return t(`We owe (${weOweList.length}): ${weOweList.map(lineOf).join("; ")}. Total ${money(total, ctx.currency)}.`, `Utang natin (${weOweList.length}): ${weOweList.map(lineOf).join("; ")}. Total ${money(total, ctx.currency)}.`);
      }
      // Whole words: "car" is the car loan, not the credit card.
      const words = person.split(" ").filter((w) => w.length > 2);
      const hits = words.length > 0 ? liabilities.filter((l) => words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(l.name.toLowerCase()) && !new RegExp(`\\b${w}[a-z]`).test(l.name.toLowerCase()))) : liabilities;
      if (hits.length === 0) return liabilities.length === 0 ? t("No loans or other debts in Kin.", "Walang loan o utang sa Kin.") : t(`No loan called "${person}". Loans: ${joinList(liabilities.map((l) => l.name))}.`, `Walang loan na "${person}". Loans: ${joinList(liabilities.map((l) => l.name))}.`);
      const total = hits.reduce((s, l) => s + Number(l.balance), 0);
      if (hits.length === 1) return t(`${hits[0].name}: ${money(hits[0].balance, ctx.currency)} left.`, `${hits[0].name}: ${money(hits[0].balance, ctx.currency)} pa ang natitira.`);
      return t(`Loans and debts (${hits.length}): ${hits.map((l) => `${l.name} ${money(l.balance, ctx.currency)}`).join("; ")}. Total ${money(total, ctx.currency)}.`, `Loans at utang (${hits.length}): ${hits.map((l) => `${l.name} ${money(l.balance, ctx.currency)}`).join("; ")}. Total ${money(total, ctx.currency)}.`);
    },
  };
};

type Charge = { name: string; amount: number; repeat: string; per_month: number; next: string | null; overdue: boolean };

const REPEAT_WORD: Record<string, [string, string]> = { weekly: ["weekly", "linggo-linggo"], monthly: ["monthly", "buwan-buwan"], quarterly: ["quarterly", "kada tatlong buwan"], yearly: ["yearly", "taon-taon"] };

const subscriptions: Rule = (q, ctx) => {
  if (!/\b(subscriptions?|subs|recurring|repeating|what do we pay (?:every|each|per) (?:month|year)|what do we pay (?:monthly|yearly|annually)|monthly (?:charges|payments|dues)|next charge|charged|renews?|renewal|auto-?debit|netflix|spotify|youtube|disney|hbo|canva|icloud|google one)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|cancel|remove|stop|due)\b/.test(q.text)) return null;
  const yearlyOnly = /\b(yearly|annual|annually|per year|every year|taon-taon)\b/.test(q.text);
  const name = q.text
    .replace(/\b(when|kailan|is|are|the|our|my|ang|ng|sa|na|ba|natin|namin|ko|next|charged|charge|renews?|renewal|what|ano|anong|how much|magkano|do|we|pay|for|subscriptions?|subs|recurring|repeating|every|each|per|month|monthly|year|yearly|annual|annually|taon-taon|list|all|lahat|payments?|charges|dues|have|got)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const t = pick(q.lang);
  const rep = (r: string) => (REPEAT_WORD[r] ? (q.lang === "tl" ? REPEAT_WORD[r][1] : REPEAT_WORD[r][0]) : r);
  return {
    rule: name ? "subscriptions.one" : "subscriptions.list",
    tool: "get_subscriptions",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const charges = rows<Charge>(result, "charges");
      if (name) {
        const hits = charges.filter((c) => c.name.toLowerCase().includes(name) || name.includes(c.name.toLowerCase()));
        if (hits.length === 0) return t(`No repeating charge called "${name}" in Kin.`, `Walang paulit-ulit na bayad na "${name}" sa Kin.`);
        return hits.map((c) => `${c.name} ${money(c.amount, ctx.currency)} ${rep(c.repeat)}${c.next ? t(`, next ${readableDay(c.next)}`, `, susunod ${readableDay(c.next)}`) : ""}${c.overdue ? " (overdue)" : ""}`).join("; ") + ".";
      }
      if (yearlyOnly) {
        const yearly = charges.filter((c) => c.repeat === "yearly");
        if (yearly.length === 0) return t("Nothing is charged yearly.", "Walang taon-taon na bayad.");
        return t(`Yearly (${yearly.length}): ${yearly.map((c) => `${c.name} ${money(c.amount, ctx.currency)}${c.next ? ` next ${readableDay(c.next)}` : ""}`).join("; ")}.`, `Taon-taon (${yearly.length}): ${yearly.map((c) => `${c.name} ${money(c.amount, ctx.currency)}${c.next ? ` susunod ${readableDay(c.next)}` : ""}`).join("; ")}.`);
      }
      if (charges.length === 0) return t("No repeating charges in Kin.", "Walang paulit-ulit na bayad sa Kin.");
      const perMonth = Number(field(result, "charges_per_month")) || 0;
      const perYear = Number(field(result, "charges_per_year")) || 0;
      const lines = charges.slice(0, 6).map((c) => `${c.name} ${money(c.amount, ctx.currency)} ${rep(c.repeat)}`);
      const more = charges.length > 6 ? ` +${charges.length - 6}` : "";
      return t(`${charges.length} repeating charges, about ${money(perMonth, ctx.currency)} a month (${money(perYear, ctx.currency)} a year): ${lines.join("; ")}${more}.`, `${charges.length} paulit-ulit na bayad, mga ${money(perMonth, ctx.currency)} kada buwan (${money(perYear, ctx.currency)} kada taon): ${lines.join("; ")}${more}.`);
    },
  };
};

type Doc = { title: string; type: string | null; whose: string; folder: string | null; expires: string | null; days_left: number | null };

const documents: Rule = (q, ctx) => {
  if (!/\b(passport|passports|license|licence|driver'?s license|registration|or\/cr|orcr|policy|documents?|papers|visa|birth certificate|certificate|ids?|expire|expires|expiring|expiry|expired|renew|renewal|valid until|hanggang kailan|mag-?expire|paso|pasaporte|lisensya)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|upload|renew the|book|apply)\b/.test(q.text)) return null;
  // "what expires soon" names nothing; "when does Lia's passport expire" names a document.
  const who = resolveMember(q.text, ctx.members);
  const bareDoc = /^(?:the |our |my |ang |mga )?(?:\w+'s )?(?:passports?|licenses?|licences?|driver'?s licen[cs]e|car registration|registration|or\/cr|orcr|birth certificates?|certificates?|visas?|insurance policy|policy|ids?|pasaporte|lisensya)(?: expiry| expiration| natin| namin| ko)?$/.test(q.text);
  if (!bareDoc && !/\b(when|kailan|what|ano|anong|which|alin|is|are|does|do|may|meron|soon|malapit|na ba|still|pa ba|valid|expire|expires|expiring|expiry|expired|mag-?expire|paso)\b/.test(q.text)) return null;
  const query = q.text
    .replace(/\b(when|kailan|what|ano|anong|which|alin|is|are|does|do|may|meron|soon|malapit|na ba|still|pa ba|valid|until|expire|expires|expiring|expiry|expiration|expired|renew|renewal|mag-?expire|paso|hanggang|the|our|my|ang|ng|ni|sa|na|ba|natin|namin|ko|documents?|papers|up to date|updated|yet|pa|this|next|month|year|week|mga)\b/g, " ")
    .replace(who ? new RegExp(`\\b${firstName(who).toLowerCase()}(?:'s)?\\b`, "g") : /$^/, " ")
    .replace(/'s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const t = pick(q.lang);
  const line = (d: Doc) => {
    const owner = d.whose && d.whose !== "household" ? `${firstName(d.whose)}'s ` : "";
    if (!d.expires) return t(`${owner}${d.title}: no expiry recorded`, `${d.title}${owner ? ` ni ${firstName(d.whose)}` : ""}: walang expiry na nakarecord`);
    const day = readableDay(d.expires.slice(0, 10));
    const left = d.days_left ?? 0;
    const when = left < 0 ? t(`expired ${day} (${-left} days ago)`, `expired na noong ${day} (${-left} days na)`) : t(`expires ${day} (${distance(d.expires.slice(0, 10), ctx.today, q.lang)})`, `mag-e-expire sa ${day} (${distance(d.expires.slice(0, 10), ctx.today, q.lang)})`);
    return q.lang === "tl" && owner ? `${d.title} ni ${firstName(d.whose)}: ${when}` : `${owner}${d.title}: ${when}`;
  };
  return {
    rule: query ? "documents.one" : "documents.expiring",
    tool: "get_documents",
    input: query ? { query } : {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      let docs = rows<Doc>(result, "documents");
      if (who) docs = docs.filter((d) => d.whose.toLowerCase().startsWith(firstName(who).toLowerCase()) || d.whose === "household");
      if (docs.length === 0) {
        if (query) return t(`No document called "${query}"${who ? ` for ${firstName(who)}` : ""} in the Vault.`, `Walang document na "${query}"${who ? ` ni ${firstName(who)}` : ""} sa Vault.`);
        return t("Nothing expires in the next six months.", "Walang mag-e-expire sa susunod na anim na buwan.");
      }
      if (query) return docs.slice(0, 4).map(line).join("; ") + ".";
      return t(`Expiring: ${docs.slice(0, 6).map(line).join("; ")}.`, `Mag-e-expire: ${docs.slice(0, 6).map(line).join("; ")}.`);
    },
  };
};

type Task = { title: string; kind: string; date: string; time: string | null; who: string | string[]; status: string };

const tasks: Rule = (q, ctx) => {
  if (!/\b(chores?|tasks?|gawain|routines?|to-?do|to do|duties|duty|turn|whose turn|homework|dishes|trash|laundry|hugas|ligpit|linis|walis)\b/.test(q.text)) return null;
  if (!/\b(what|ano|anong|who|sino|whose|kanino|did|has|have|is|are|left|remaining|done|tapos|na ba|ba|list|today|ngayon|tomorrow|bukas|this week|ngayong linggo|natira|pending|still|pa ba|nagawa|ginawa|turn|turno)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|idagdag|create|set|new|gumawa|delete|remove|edit|approve|mark)\b/.test(q.text)) return null;
  const range = resolveRange(q.text, ctx.today) ?? single(ctx.today, `today`, `ngayon`);
  const who = resolveMember(q.text, ctx.members);
  const notDone = /\b(hasn'?t|haven'?t|not done|not yet|left|remaining|pending|still|hindi pa|di pa|natira|wala pa)\b/.test(q.text);
  const didThey = (/^(did|has|have)\b/.test(q.text) || /\b(tapos na ba|nagawa na ba|ginawa na ba|done na ba|na ba)\b/.test(q.text)) && !!who;
  const whoseTurn = /\b(whose turn|sino ang (?:mag|naka)|turn|turno|kanino)\b/.test(q.text);
  const title = whoseTurn ? q.text.replace(/\b(whose turn|is it|to|sino ang|mag|naka|turn|turno|kanino|the|ang|ng|ni|si|sa|ngayon|today|bukas|tomorrow|it|is|for|ba|na|this|week|wash|do|take out|clean)\b/g, " ").replace(who ? new RegExp(`\\b${firstName(who).toLowerCase()}\\b`, "g") : /$^/, " ").replace(/\s+/g, " ").trim() : "";
  const t = pick(q.lang);
  return {
    rule: whoseTurn ? "tasks.turn" : notDone ? "tasks.not_done" : didThey ? "tasks.did" : "tasks.list",
    tool: "get_tasks",
    input: { from: range.from, to: range.to, ...(who ? { member_name: firstName(who) } : {}) },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const all = rows<Task>(result, "tasks");
      const behind = rows<{ title: string; who: string | string[]; dates: string[] }>(result, "behind_on");
      const label = range.single && range.from === ctx.today ? t("today", "ngayon") : q.lang === "tl" ? range.label.tl : range.label.en;
      const whoOf = (x: Task) => (Array.isArray(x.who) ? x.who.map(firstName).join(", ") : x.who === "whole family" ? t("everyone", "lahat") : x.who);
      const line = (x: Task) => `${x.title} (${whoOf(x)})${range.single ? "" : ` ${readableDay(x.date)}`}${x.time ? ` ${x.time}` : ""}${x.status === "done" ? t(" done", " tapos") : x.status === "skipped" ? " skipped" : x.status === "missed" ? t(" missed", " hindi nagawa") : ""}`;
      const behindLine = behind.length > 0 ? t(` Behind: ${behind.map((b) => `${b.title} (${b.dates.map((d) => readableDay(d)).join(", ")})`).join("; ")}.`, ` Hindi pa nagawa: ${behind.map((b) => `${b.title} (${b.dates.map((d) => readableDay(d)).join(", ")})`).join("; ")}.`) : "";
      if (whoseTurn) {
        const words = title.split(" ").filter((w) => w.length > 2);
        const hits = words.length > 0 ? all.filter((x) => words.some((w) => x.title.toLowerCase().includes(w))) : all;
        if (hits.length === 0) return t(`Nothing called "${title}" ${label}.`, `Walang "${title}" ${label}.`);
        return hits.map((x) => `${x.title}: ${whoOf(x)}${x.status === "done" ? t(" (done)", " (tapos na)") : ""}`).join("; ") + ".";
      }
      if (notDone) {
        const open = all.filter((x) => x.status !== "done" && x.status !== "skipped");
        if (open.length === 0) return (all.length === 0 ? t(`Nothing scheduled ${label}.`, `Walang nakaschedule ${label}.`) : t(`All done ${label}.`, `Tapos na lahat ${label}.`)) + behindLine;
        return t(`Not yet ${label} (${open.length}): ${open.map(line).join("; ")}.`, `Hindi pa tapos ${label} (${open.length}): ${open.map(line).join("; ")}.`) + behindLine;
      }
      if (didThey && who) {
        if (all.length === 0) return t(`${firstName(who)} has nothing scheduled ${label}.`, `Walang nakaschedule si ${firstName(who)} ${label}.`);
        const done = all.filter((x) => x.status === "done");
        const open = all.filter((x) => x.status !== "done" && x.status !== "skipped");
        if (open.length === 0) return t(`Yes: ${firstName(who)} did ${done.map((x) => x.title).join(", ")} ${label}.`, `Oo: tapos na ni ${firstName(who)} ang ${done.map((x) => x.title).join(", ")} ${label}.`);
        return t(`${firstName(who)} ${label}: done ${done.length > 0 ? done.map((x) => x.title).join(", ") : "nothing yet"}; not yet ${open.map((x) => x.title).join(", ")}.`, `${firstName(who)} ${label}: tapos ${done.length > 0 ? done.map((x) => x.title).join(", ") : "wala pa"}; hindi pa ${open.map((x) => x.title).join(", ")}.`);
      }
      if (all.length === 0) return t(`No chores or tasks ${label}${who ? ` for ${firstName(who)}` : ""}.`, `Walang chores o tasks ${label}${who ? ` ni ${firstName(who)}` : ""}.`) + behindLine;
      return `${label[0].toUpperCase()}${label.slice(1)}${who ? t(` for ${firstName(who)}`, ` ni ${firstName(who)}`) : ""} (${all.length}): ${all.slice(0, 10).map(line).join("; ")}${all.length > 10 ? ` +${all.length - 10}` : ""}.` + behindLine;
    },
  };
};

const allowance: Rule = (q, ctx) => {
  if (!/\b(piggy ?bank|alkansya|allowance|baon|coins|points|stars|puntos|jars?)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|give|bigay|pay|bayad|redeem|set)\b/.test(q.text) && !/\b(how much|magkano|ilan|how many|what|ano)\b/.test(q.text)) return null;
  const who = resolveMember(q.text, ctx.members);
  const wantsPoints = /\b(coins|points|stars|puntos)\b/.test(q.text);
  if (!who) {
    const t0 = pick(q.lang);
    return { ask: t0(wantsPoints ? "Whose points?" : "Whose piggy bank?", wantsPoints ? "Kaninong points?" : "Kaninong alkansya?"), choices: ctx.members.map(firstName), pending: { rule: "allowance.who", slots: { points: wantsPoints ? 1 : 0 }, lang: q.lang, asked: 1 } };
  }
  const t = pick(q.lang);
  return {
    rule: wantsPoints ? "allowance.points" : "allowance.jars",
    tool: "get_allowance",
    input: { member_name: firstName(who) },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const name = firstName(who);
      const jars = field(result, "jars") as { gastos: number; ipon: number; bigay: number; total: number } | null;
      const balance = Number(field(result, "points_balance")) || 0;
      const spent = Number(field(result, "points_spent")) || 0;
      const pointsLine = t(`${balance} points${spent > 0 ? ` (${spent} spent)` : ""}`, `${balance} points${spent > 0 ? ` (${spent} nagastos)` : ""}`);
      if (wantsPoints || !jars) return `${name}: ${pointsLine}.`;
      const weekly = Number(field(result, "weekly_allowance")) || 0;
      return t(
        `${name}'s piggy bank: ${money(jars.total, ctx.currency)} (gastos ${money(jars.gastos, ctx.currency)}, ipon ${money(jars.ipon, ctx.currency)}, bigay ${money(jars.bigay, ctx.currency)})${weekly > 0 ? `, ${money(weekly, ctx.currency)} a week` : ""}; ${pointsLine}.`,
        `Alkansya ni ${name}: ${money(jars.total, ctx.currency)} (gastos ${money(jars.gastos, ctx.currency)}, ipon ${money(jars.ipon, ctx.currency)}, bigay ${money(jars.bigay, ctx.currency)})${weekly > 0 ? `, ${money(weekly, ctx.currency)} kada linggo` : ""}; ${pointsLine}.`,
      );
    },
  };
};

const eventGuests: Rule = (q, ctx) => {
  if (!/\b(who(?:'s| is| are|s)? (?:all )?coming|who(?:'s| is| are)? (?:all )?(?:going|attending|invited)|sino (?:ang |mga )?(?:pupunta|dadalo|sasama|darating|kasama|invited)|how many (?:are |people |guests )?(?:coming|going|attending)|ilan (?:ang |mga )?(?:pupunta|dadalo|darating)|rsvps?|guest ?list|guests|attending|headcount|bisita|hindi pa sumagot|not (?:yet )?answered|no reply)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|invite|remove)\b/.test(q.text) && !/\b(who|sino|how many|ilan)\b/.test(q.text)) return null;
  const range = resolveRange(q.text, ctx.today);
  const name = q.text
    .replace(/\b(who|whos|is|are|all|coming|going|attending|invited|sino|ang|mga|pupunta|dadalo|sasama|darating|kasama|how many|people|guests?|ilan|rsvps?|guest list|headcount|bisita|to|the|our|sa|ng|ni|on|for|at|this|next|ba|na|natin|namin|ko|kay|party|yung|hindi|pa|sumagot|not|yet|answered|no|reply|has|have|hasn't|haven't)\b/g, " ")
    .replace(/\b(today|tomorrow|bukas|ngayon|weekend|week|month|sunday|monday|tuesday|wednesday|thursday|friday|saturday|linggo|lunes|martes|miyerkules|huwebes|biyernes|sabado)\b/g, " ")
    .replace(new RegExp(`\\b(${[...MONTHS_EN, ...MONTHS_TL, ...MONTH_SHORT].join("|")})\\b`, "g"), " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\b/g, " ")
    .replace(/'s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const t = pick(q.lang);
  return {
    rule: "events.guests",
    tool: "get_event_guests",
    // Nothing named: the next event coming up.
    input: name ? { query: name } : range ? { date: range.from } : {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      if (field(result, "matches") === "no event found") return t(`No event ${name ? `called "${name}"` : range ? `on ${readableDay(range.from)}` : "coming up"} in Kin.`, `Walang event ${name ? `na "${name}"` : range ? `sa ${readableDay(range.from)}` : "na paparating"} sa Kin.`);
      const event = String(field(result, "event") ?? "");
      const date = String(field(result, "date") ?? "");
      const going = rows<string>(result, "going").map(firstName);
      const maybe = rows<string>(result, "maybe").map(firstName);
      const no = rows<string>(result, "no").map(firstName);
      const guestsGoing = rows<{ name: string; heads: number }>(result, "guests_going");
      const guestsMaybe = rows<string>(result, "guests_maybe");
      const unanswered = rows<string>(result, "guests_not_answered");
      const heads = Number(field(result, "heads_going")) || 0;
      const goingLine = [...going, ...guestsGoing.map((g) => (g.heads > 1 ? `${g.name} ×${g.heads}` : g.name))];
      const parts = [
        t(`going ${heads}${goingLine.length > 0 ? ` (${joinList(goingLine, 10)})` : ""}`, `pupunta ${heads}${goingLine.length > 0 ? ` (${joinList(goingLine, 10)})` : ""}`),
        ...(maybe.length + guestsMaybe.length > 0 ? [t(`maybe ${joinList([...maybe, ...guestsMaybe])}`, `baka ${joinList([...maybe, ...guestsMaybe])}`)] : []),
        ...(no.length > 0 ? [t(`not coming ${joinList(no)}`, `hindi pupunta ${joinList(no)}`)] : []),
        ...(unanswered.length > 0 ? [t(`${unanswered.length} not answered`, `${unanswered.length} hindi pa sumagot`)] : []),
      ];
      return `${event} (${readableDay(date)}): ${parts.join("; ")}.`;
    },
  };
};

/** The past ranges a spending question names, as whole months: last month,
 * a month by name (this year's if gone by, else last year's), the last N
 * months (whole, before this one), last week, this year, last year. */
export function pastRange(text: string, today: string): { from: string; to: string; label: { en: string; tl: string } } | null {
  const t = ` ${text.toLowerCase()} `;
  const [y, m] = today.split("-").map(Number);
  const monthRange = (year: number, month1: number) => {
    const from = `${year}-${String(month1).padStart(2, "0")}-01`;
    return { from, to: endOfMonth(from) };
  };
  const nameOf = (month1: number, year: number) => `${MONTHS_EN[month1 - 1][0].toUpperCase()}${MONTHS_EN[month1 - 1].slice(1)}${year !== y ? ` ${year}` : ""}`;
  if (/\b(last month|nakaraang buwan|previous month)\b/.test(t)) {
    const d = new Date(Date.UTC(y, m - 2, 1));
    const r = monthRange(d.getUTCFullYear(), d.getUTCMonth() + 1);
    return { ...r, label: { en: "last month", tl: "noong nakaraang buwan" } };
  }
  const n = /\b(?:last|past|nakaraang|huling)\s+(\d{1,2}|two|three|four|five|six|dalawang|tatlong|apat na|limang|anim na)\s+months?\b/.exec(t);
  if (n) {
    const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, dalawang: 2, tatlong: 3, "apat na": 4, limang: 5, "anim na": 6 };
    const count = Number(n[1]) || words[n[1]] || 0;
    if (count >= 1 && count <= 24) {
      const start = new Date(Date.UTC(y, m - 1 - count, 1));
      const end = new Date(Date.UTC(y, m - 2, 1));
      return { from: monthRange(start.getUTCFullYear(), start.getUTCMonth() + 1).from, to: monthRange(end.getUTCFullYear(), end.getUTCMonth() + 1).to, label: { en: `the last ${count} months`, tl: `nakaraang ${count} buwan` } };
    }
  }
  if (/\b(last week|nakaraang linggo|previous week)\b/.test(t)) {
    const from = addDays(mondayOf(today), -7)!;
    return { from, to: addDays(from, 6)!, label: { en: "last week", tl: "noong nakaraang linggo" } };
  }
  if (/\b(this year|ngayong taon|year to date|so far this year)\b/.test(t)) return { from: `${y}-01-01`, to: today, label: { en: "this year", tl: "ngayong taon" } };
  if (/\b(last year|nakaraang taon)\b/.test(t)) return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: { en: `${y - 1}`, tl: `${y - 1}` } };
  const monthWord = "(" + [...MONTHS_EN, ...MONTHS_TL, ...MONTH_SHORT].join("|") + ")";
  const mw = new RegExp(`\\b(in|sa|noong|nung|last|for|of|during|ng)?\\s*${monthWord}\\b(?:\\s+(\\d{4}))?(?!\\s*\\d)`).exec(t);
  if (mw) {
    const w = mw[2].replace(/\.$/, "");
    let i = MONTHS_EN.indexOf(w);
    if (i < 0) i = MONTHS_TL.indexOf(w);
    if (i < 0) i = MONTH_SHORT.indexOf(w.slice(0, 3));
    // "may" alone is the Filipino "there is": only with a preposition or a year.
    if (i >= 0 && !(w === "may" && !mw[1] && !mw[3])) {
      const month1 = i + 1;
      if (month1 === m && !mw[3]) return null; // this month is get_money's
      const year = mw[3] ? Number(mw[3]) : month1 < m ? y : y - 1;
      const r = monthRange(year, month1);
      return { ...r, label: { en: nameOf(month1, year), tl: nameOf(month1, year) } };
    }
  }
  return null;
}

const spendingPast: Rule = (q, ctx) => {
  if (!/\b(spend|spent|spending|gastos|nagastos|ginastos|gumastos|nagagastos|expenses?|paid for|kinita|earn|earned|income|kita)\b/.test(q.text)) return null;
  if (!/\b(how much|magkano|what|ano|anong|total|ilan)\b/.test(q.text)) return null;
  const range = pastRange(q.text, ctx.today);
  if (!range) return null;
  const categories = categoriesIn(q.text);
  const members = resolveMembers(q.text, ctx.members);
  if (members.length > 0 && categories.length > 0) return null;
  const who = members[0] ?? null;
  const category = categories[0] ?? null;
  const wantsIncome = /\b(kinita|earn|earned|income|kita|money in|pumasok|save|saved)\b/.test(q.text) && !/\b(spend|spent|gastos)\b/.test(q.text);
  const t = pick(q.lang);
  const label = q.lang === "tl" ? range.label.tl : range.label.en;
  return {
    rule: wantsIncome ? "spending.past_income" : who ? "spending.past_member" : category ? "spending.past_category" : "spending.past_total",
    tool: "get_spending",
    input: { from: range.from, to: range.to },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const byCat = (field(result, "by_category") ?? {}) as Record<string, unknown>;
      const spent = Number(field(result, "spent")) || 0;
      if (wantsIncome) return t(`Money in ${label}: ${money(field(result, "money_in"), ctx.currency)}; out: ${money(spent, ctx.currency)}.`, `Pumasok ${label}: ${money(field(result, "money_in"), ctx.currency)}; lumabas: ${money(spent, ctx.currency)}.`);
      if (members.length > 0) {
        const byMember = (field(result, "by_member") ?? {}) as Record<string, unknown>;
        const amountOf = (m: string) => {
          const key = Object.keys(byMember).find((k) => k.toLowerCase() === m.toLowerCase() || k.toLowerCase().split(" ")[0] === firstName(m).toLowerCase());
          return key ? byMember[key] : 0;
        };
        if (members.length === 1) return t(`${firstName(who!)}'s spending ${label}: ${money(amountOf(who!), ctx.currency)} (from accounts you can see).`, `Nagastos ni ${firstName(who!)} ${label}: ${money(amountOf(who!), ctx.currency)} (sa mga account na nakikita mo).`);
        return t(`Spending ${label}: ${members.map((m) => `${firstName(m)} ${money(amountOf(m), ctx.currency)}`).join("; ")}.`, `Nagastos ${label}: ${members.map((m) => `${firstName(m)} ${money(amountOf(m), ctx.currency)}`).join("; ")}.`);
      }
      if (categories.length > 1) return `${label[0].toUpperCase()}${label.slice(1)}: ${categories.map((c) => `${c} ${money(byCat[c] ?? 0, ctx.currency)}`).join("; ")}.`;
      if (category) return `${category} ${label}: ${money(byCat[category] ?? 0, ctx.currency)}.`;
      const top = Object.entries(byCat)
        .filter(([c, a]) => c !== TRANSFER_CATEGORY && c !== GOAL_CATEGORY && Number(a) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 3)
        .map(([c, a]) => `${c} ${money(a, ctx.currency)}`);
      const topLine = top.length > 0 ? t(` Top: ${top.join(", ")}.`, ` Pinakamalaki: ${top.join(", ")}.`) : "";
      return t(`Spent ${label}: ${money(spent, ctx.currency)}.${topLine}`, `Nagastos ${label}: ${money(spent, ctx.currency)}.${topLine}`);
    },
  };
};

type Entry = { title: string; date: string; note: string | null; milestone: boolean };

const journal: Rule = (q, ctx) => {
  if (!/\b(journal|diary|talaarawan|on this day|what happened|anong nangyari|ano nangyari|memories|alaala|last entry|latest entry|latest entries|wrote|sinulat|isinulat|milestones?|a year ago|years? ago today)\b/.test(q.text)) return null;
  if (/^(?:journal|diary)\s*[:\-–]/.test(q.text)) return null;
  if (/^(?:please\s+)?(?:add|pa-?add|write|isulat|put|note down|delete|edit)\b/.test(q.text)) return null;
  const onThisDay = /\b(on this day|this day|same day|ngayong araw noon|ngayong araw|a year ago today|years? ago today|last year today|noong nakaraang taon ngayong araw)\b/.test(q.text) || /\b(what happened|anong nangyari|ano nangyari)\b.*\b(today|ngayon)\b/.test(q.text);
  const milestones = /\bmilestones?\b/.test(q.text);
  const who = milestones ? resolveMember(q.text, ctx.members) : null;
  const past = onThisDay ? null : pastRange(q.text, ctx.today);
  const about = /\b(about|tungkol sa)\s+(.+)$/.exec(q.text);
  const topic = about && !past && !onThisDay ? about[2].replace(/\b(the|ang|ng|sa|ba|natin|namin|ko)\b/g, " ").replace(/\s+/g, " ").trim() : "";
  const t = pick(q.lang);
  const input = {
    ...(onThisDay ? { on_day: ctx.today.slice(5) } : past ? { from: past.from, to: past.to } : topic ? { query: topic } : {}),
    ...(milestones ? { milestones: true, ...(who ? { member_name: firstName(who) } : {}) } : {}),
  };
  return {
    rule: onThisDay ? "journal.on_this_day" : milestones ? "journal.milestones" : past ? "journal.range" : topic ? "journal.about" : "journal.latest",
    tool: "get_journal",
    input,
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const entries = rows<Entry>(result, "entries");
      const label = onThisDay ? t("on this day", "sa araw na ito") : milestones ? t(`as milestones${who ? ` for ${firstName(who)}` : ""}`, `na milestone${who ? ` ni ${firstName(who)}` : ""}`) : past ? (q.lang === "tl" ? past.label.tl : past.label.en) : topic ? t(`about "${topic}"`, `tungkol sa "${topic}"`) : t("yet", "pa");
      if (entries.length === 0) return onThisDay ? t("Nothing in the journal on this day in past years.", "Walang nakasulat sa journal sa araw na ito noong mga nakaraang taon.") : t(`Nothing in the journal ${label}.`, `Wala sa journal ${label}.`);
      const line = (e: Entry) => `${readableDay(e.date, { year: true })}: ${e.title}${e.milestone ? " ★" : ""}`;
      return `${entries.slice(0, 5).map(line).join("; ")}${entries.length > 5 ? ` +${entries.length - 5}` : ""}.`;
    },
  };
};

type Found = Record<string, unknown[]>;

const whereIs: Rule = (q, ctx) => {
  const m = /^(?:where(?:'s| is| are| did (?:we|i) (?:put|save|keep|file))|nasaan(?: ang| yung| si| na| ba)*|saan(?: ko| natin| namin)?(?: makikita| nakalagay| naka-?save| nilagay)?(?: ang| yung| ba)*|find|hanapin(?: ang| yung)?|look up|search(?: for)?)\s+(?:the |our |my |ang |yung |mga )?(.+)$/.exec(q.text);
  if (!m) return null;
  const named = resolveMember(m[1], ctx.members);
  const query = m[1]
    .replace(/\b(in kin|sa kin|please|naman|nga|po|ba|na)\b/g, " ")
    .replace(/'s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!query || query.length < 3) return null;
  if (/\b(money|pera|napunta|budget|the cash)\b/.test(query)) return null;
  // People are on Family and the map, not in the records: "where is Lia"
  // is Where everyone is, and the model's. "Lia's passport" is a record.
  if (named && query.split(" ").length <= 2) return null;
  const cleaned = named ? query.replace(new RegExp(`\\b(ni|ng|kay|of|for)?\\s*${firstName(named).toLowerCase()}\\b`, "g"), " ").replace(/\s+/g, " ").trim() : query;
  if (!cleaned) return null;
  const t = pick(q.lang);
  return {
    rule: "search.where_is",
    tool: "search",
    input: { query: cleaned },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      if (field(result, "matches") === "nothing found") return t(`Nothing called "${query}" in Kin.`, `Walang "${query}" sa Kin.`);
      const r = result as Found;
      const lines: string[] = [];
      for (const d of (r.documents ?? []) as { title: string; doc_type: string | null; expires_at: string | null }[]) lines.push(`Document: ${d.title}${d.expires_at ? `, ${t("expires", "expires")} ${readableDay(d.expires_at.slice(0, 10))}` : ""} (Family → Vault)`);
      for (const a of (r.accounts ?? []) as { name: string; institution: string | null }[]) lines.push(`Account: ${a.name}${a.institution ? ` (${a.institution})` : ""}`);
      for (const a of (r.assets ?? []) as { name: string; kind: string; value: number }[]) lines.push(`Asset: ${a.name}, ${money(a.value, ctx.currency)}`);
      for (const a of (r.activities ?? []) as { title: string; start_at: string; location: string | null }[]) {
        const at = new Date(a.start_at);
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
        lines.push(`Plan: ${a.title}, ${readableDay(day)} ${familyClock(at, ctx.timeZone)}${a.location ? `, ${a.location}` : ""}`);
      }
      for (const e of (r.events ?? []) as { title: string; event_date: string }[]) lines.push(`Event: ${e.title}, ${readableDay(e.event_date)}`);
      for (const b of (r.bills ?? []) as Bill[]) lines.push(`Bill: ${b.name} ${money(b.amount, ctx.currency)}, ${b.status === "paid" ? t("paid", "bayad na") : "due"} ${readableDay(b.due_date)}`);
      for (const g of (r.goals ?? []) as Goal[]) lines.push(`Goal: ${g.title}, ${money(g.current_amount, ctx.currency)}${g.target_amount ? ` of ${money(g.target_amount, ctx.currency)}` : ""}`);
      for (const i of (r.shopping_list ?? []) as { name: string; checked: boolean }[]) lines.push(t(`On the list: ${i.name}${i.checked ? " (ticked)" : ""}`, `Sa list: ${i.name}${i.checked ? " (ticked)" : ""}`));
      for (const mp of (r.meal_plans ?? []) as { dish: string; plan_date: string }[]) lines.push(t(`Meal: ${mp.dish}, ${readableDay(mp.plan_date)}`, `Ulam: ${mp.dish}, ${readableDay(mp.plan_date)}`));
      for (const j of (r.journal ?? []) as { title: string; entry_date: string }[]) lines.push(`Journal: ${j.title}, ${readableDay(j.entry_date, { year: true })}`);
      if (lines.length === 0) return t(`Nothing called "${query}" in Kin.`, `Walang "${query}" sa Kin.`);
      return `${lines.slice(0, 5).join("; ")}${lines.length > 5 ? ` +${lines.length - 5}` : ""}.`;
    },
  };
};

type PantryItem = { name: string; quantity: number | null; unit: string | null; running_low: boolean };

const doWeHave: Rule = (q, ctx) => {
  const en = /^(?:do we(?: still)? have(?: any| some)?|is there(?: any| still| some)?|are we out of|out of|do we need(?: more| to buy)?)\s+(.+?)(?:\s+(?:at home|in the pantry|in the ref|in the fridge|left|still))*$/.exec(q.text);
  const tl = /^(?:may|meron|mayroon|wala na|ubos na|kailangan)\s+(?:pa\s+|ba\s+|na\s+|tayo\s+|kami\s+|ng\s+|bang\s+|pa\s+ba\s+|ba\s+tayo\s+|ba\s+kami\s+|bumili\s+ng\s+)*(.+?)(?:\s+(?:pa|ba|na|tayo|kami|sa bahay|sa pantry|sa ref|dito))*$/.exec(q.text);
  const raw = en?.[1] ?? tl?.[1];
  if (!raw) return null;
  const item = raw.replace(/\b(pa|ba|na|tayo|kami|ng|sa|bahay|pantry|ref|left|at home|still|any|some|yung|ang|more|to buy)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!item || item.length < 2) return null;
  if (resolveMember(item, ctx.members)) return null;
  if (/\b(money|pera|cash|budget|bill|bills|time|oras|plan|plans|schedule|goal|utang|loan|insurance|hmo|allerg|medicine|gamot|chore|chores|task|homework|class|pasok|event|party|lakad|due|overdue|meron|appointment|visitors|guests)\b/.test(item)) return null;
  const t = pick(q.lang);
  return {
    rule: "household.have",
    tool: "get_household",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const words = item.split(" ").filter((w) => w.length > 1);
      const hit = (name: string) => words.some((w) => name.toLowerCase().includes(w) || w.includes(name.toLowerCase()));
      const pantry = rows<PantryItem>(result, "pantry").filter((p) => hit(p.name));
      const list = rows<BuyItem>(result, "shopping_list").filter((b) => hit(b.name) && !b.checked);
      const pantryLine = pantry.map((p) => `${p.name}${formatQuantity(p.quantity, p.unit) ? ` ${formatQuantity(p.quantity, p.unit)}` : ""}${p.running_low ? t(" (running low)", " (paubos na)") : ""}`);
      if (pantry.length === 0 && list.length === 0) return t(`No ${item} in the pantry, and it isn't on the list.`, `Walang ${item} sa pantry, at wala rin sa list.`);
      const parts = [
        pantry.length > 0 ? t(`In the pantry: ${pantryLine.join(", ")}`, `Sa pantry: ${pantryLine.join(", ")}`) : t("None in the pantry", "Wala sa pantry"),
        ...(list.length > 0 ? [t(`on the list: ${list.map((b) => b.name).join(", ")}`, `nasa list: ${list.map((b) => b.name).join(", ")}`)] : []),
      ];
      return parts.join("; ") + ".";
    },
  };
};


/* ------------------------------------------------------ the marks (PR 4) */

/** The question for which account a bill was paid from, from get_money's
 * accounts the member may move money from, plus "paid outside Kin". */
function askAccountFor(bill: string, amount: number | null, accounts: Account[], lang: Lang, ctx: RuleContext): Ask {
  const t = pick(lang);
  const usable = accounts.filter((a) => a.scope === "joint" || a.scope === "your own").map((a) => a.name);
  const outside = t("Paid outside Kin", "Bayad sa labas ng Kin");
  return {
    ask: t(`${bill}${amount ? ` (${money(amount, ctx.currency)})` : ""}: paid from which account?`, `${bill}${amount ? ` (${money(amount, ctx.currency)})` : ""}: saan galing ang bayad?`),
    choices: [...usable, outside],
    pending: { rule: "mark.paid", slots: { bill, ...(amount ? { amount } : {}) }, lang, asked: 1 },
  };
}

/** The mark_bill_paid match once the bill and the account (or "outside") are known. */
function markPaidMatch(bill: string, account: string | null, amount: number | null, lang: Lang, ctx: RuleContext): RuleMatch {
  const t = pick(lang);
  return {
    rule: "mark.paid",
    tool: "mark_bill_paid",
    input: { bill_name: bill, ...(account ? { account_name: account } : { outside: true }), ...(amount ? { amount } : {}) },
    lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const names = rows<string>(result, "ambiguous");
      if (names.length > 0) return { ask: t(`Which one: ${names.join(" or ")}?`, `Alin: ${names.join(" o ")}?`), choices: names, pending: { rule: "mark.paid.which", slots: { ...(account ? { account } : { outside: 1 }), ...(amount ? { amount } : {}) }, lang, asked: 1 } };
      const accounts = rows<string>(result, "ambiguous_account");
      if (accounts.length > 0) return { ask: t(`Which account: ${accounts.join(" or ")}?`, `Aling account: ${accounts.join(" o ")}?`), choices: accounts, pending: { rule: "mark.paid", slots: { bill, ...(amount ? { amount } : {}) }, lang, asked: 1 } };
      const paid = String(field(result, "paid") ?? bill);
      const paidAmount = money(field(result, "amount"), ctx.currency);
      if (field(result, "outside")) return t(`${paid} marked paid (${paidAmount}, outside Kin).`, `Bayad na ang ${paid} (${paidAmount}, sa labas ng Kin).`);
      return t(`${paid} paid from ${field(result, "account")}, ${paidAmount}.`, `Bayad na ang ${paid} mula sa ${field(result, "account")}, ${paidAmount}.`);
    },
  };
}

const markPaid: Rule = (q, ctx) => {
  // A question ("Is Meralco paid?", "did we pay", "bayad na ba") is not a mark.
  if (/^(did|do|does|have|has|is|are|was|were|when|kailan|kelan|how|magkano|ano|anong|what|sino|who|may|meron)\b/.test(q.text) || /\b(ba|na ba|kaya)\b/.test(q.text)) return null;
  const m =
    /^(?:mark|i-?mark|set)\s+(?:the\s+|ang\s+|yung\s+)?(.+?)(?:\s+bill)?\s+(?:as\s+)?(?:paid|bayad|settled)(?:\s+(?:from|via|using|sa|gamit ang|through)\s+(.+))?$/.exec(q.text) ??
    /^(?:i\s+)?(?:paid|settled|binayaran(?: ko)?(?: na)?|nabayaran(?: ko)?(?: na)?|bayad na(?: ang| yung| si)?|nagbayad(?: na)?(?: ako)?(?: ng| sa)?)\s+(?:the\s+|ang\s+|yung\s+|na\s+|for\s+)?(.+?)(?:\s+bill)?(?:\s+(?:na|already|today|ngayon|kanina))*(?:\s+(?:from|via|using|sa|gamit ang|through|mula sa)\s+(.+))?$/.exec(q.text) ??
    /^(?:the\s+|ang\s+)?(.+?)(?:\s+bill)?\s+(?:is|was)\s+paid(?:\s+(?:from|via|using|through)\s+(.+))?$/.exec(q.text) ??
    /^(?:the\s+|ang\s+)?([a-z][a-z0-9 &'\-]{1,30}?)(?:\s+bill)?\s+(?:paid|bayad na|settled)$/.exec(q.text);
  if (!m) return null;
  let bill = m[1].trim();
  const account = m[2]?.replace(/\b(the|our|my|ang|account|acct|wallet|na|ko)\b/g, " ").replace(/\s+/g, " ").trim() || null;
  // An amount in the line pays that much; "paid Meralco 3200".
  const amount = readAmount(bill);
  if (amount) bill = bill.replace(/(?:₱|\bphp|\bp)?\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*k?|(?:₱|\bphp|\bp)?\s*\d+(?:\.\d+)?\s*k?/, " ").replace(/\s+/g, " ").trim();
  const cashInLine = /\b(in cash|cash|over the counter|sa labas|outside kin|bayad center|7-?eleven)\s*$/.test(bill);
  bill = bill.replace(/\b(in cash|cash|over the counter|sa labas|outside kin|bayad center|7-?eleven)\s*$/, " ");
  bill = bill.replace(/\b(the|our|my|ang|yung|na|ko|bill|bills|for|of|this month|ngayong buwan)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!bill || bill.length < 2) return null;
  if (/\b(list|listahan|chore|chores|dishes|trash|laundry|homework)\b/.test(bill)) return null;
  const outside = cashInLine || /\b(outside kin|outside|cash|in cash|over the counter|sa labas|labas ng kin|7-?eleven|bayad center|personally)\b/.test(account ?? "");
  if (account && !outside) return markPaidMatch(bill, account, amount, q.lang, ctx);
  if (outside) return markPaidMatch(bill, null, amount, q.lang, ctx);
  // No account named: read the bills and the accounts, then ask which.
  const t = pick(q.lang);
  return {
    rule: "mark.paid.ask",
    tool: "get_money",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const bills = rows<Bill>(result, "unpaid_bills").filter((b) => billMatches(b, bill)).sort((a, b) => a.due_date.localeCompare(b.due_date));
      if (bills.length === 0) return t(`No unpaid bill called "${bill}". To record money out that isn't a bill, use Wealth → Move money.`, `Walang unpaid na bill na "${bill}". Para sa ibang gastos, Wealth → Move money.`);
      const names = [...new Set(bills.map((b) => b.name))];
      if (names.length > 1) return { ask: t(`Which one: ${names.join(" or ")}?`, `Alin: ${names.join(" o ")}?`), choices: names, pending: { rule: "mark.paid.which", slots: { ...(amount ? { amount } : {}) }, lang: q.lang, asked: 1 } };
      return askAccountFor(bills[0].name, amount ?? Number(bills[0].amount), rows<Account>(result, "accounts"), q.lang, ctx);
    },
  };
};

function tickMatch(items: string | string[], checked: boolean, lang: Lang): RuleMatch {
  const t = pick(lang);
  const item = Array.isArray(items) ? items.join(", ") : items;
  return {
    rule: checked ? "mark.tick" : "mark.untick",
    tool: "tick_list_item",
    input: { ...(Array.isArray(items) ? { names: items } : { name: items }), checked },
    lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const names = rows<string>(result, "ambiguous");
      if (names.length > 0) return { ask: t(`Which one: ${names.join(" or ")}?`, `Alin: ${names.join(" o ")}?`), choices: names, pending: { rule: "mark.tick", slots: { checked: checked ? 1 : 0 }, lang, asked: 1 } };
      const name = String(field(result, checked ? "ticked" : "unticked") ?? field(result, "name") ?? item);
      if (field(result, "already")) return checked ? t(`${name} was already ticked.`, `Naka-tick na ang ${name}.`) : t(`${name} wasn't ticked.`, `Hindi naka-tick ang ${name}.`);
      return checked ? t(`Ticked ${name} off the list.`, `Na-tick na ang ${name} sa list.`) : t(`${name} is back on the list.`, `Balik sa list ang ${name}.`);
    },
  };
}

const tickItem: Rule = (q) => {
  const un = /^(?:untick|uncheck|un-?tick|hindi pa nabili|di pa nabili|not bought|wala pa|put back|ibalik)\s+(?:the\s+|ang\s+|yung\s+|na\s+)?(.+?)(?:\s+(?:on|to|sa)\s+(?:the\s+)?list)?$/.exec(q.text);
  if (un) return tickMatch(un[1].replace(/\b(pa|na|yet|please)\b/g, " ").replace(/\s+/g, " ").trim(), false, q.lang);
  const m = /^(?:tick off|check off|cross off|cross out|tick|check|bought|got|nabili(?: ko| na| ko na| na namin)?|nakuha(?: ko| na)?|nakabili(?: na)?(?: ng)?|done with|tapos na ang)\s+(?:the\s+|ang\s+|yung\s+|na\s+|ng\s+|some\s+)?(.+?)(?:\s+(?:on|from|off|sa)\s+(?:the\s+)?list)?(?:\s+(?:na|already|kanina|today|ngayon))*$/.exec(q.text);
  if (!m) return null;
  const item = m[1].replace(/\b(na|already|please|the|ang|yung)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!item || item.length < 2) return null;
  // "done with the dishes" is a chore; "bought 2 kilos of rice" is still rice.
  if (/\b(dishes|trash|laundry|homework|chore|chores|bill|meralco|rent)\b/.test(item)) return null;
  const parts = item.split(/\s*,\s*|\s+(?:and|at|&)\s+/).map((part) => part.replace(/^\d+(?:\.\d+)?\s*(?:kg|kilos?|g|l|ml|pcs?|packs?|dozen|bottles?|cans?)?\s*(?:of\s+|ng\s+)?/, "").trim()).filter(Boolean);
  if (parts.length > 1) return tickMatch(parts, true, q.lang);
  return tickMatch(parts[0] ?? item, true, q.lang);
};

function choreMatch(title: string, member: string | null, status: "done" | "skipped", lang: Lang): RuleMatch {
  const t = pick(lang);
  return {
    rule: status === "done" ? "mark.chore_done" : "mark.chore_skipped",
    tool: "log_chore",
    input: { title, status, ...(member ? { member_name: firstName(member) } : {}) },
    lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const names = rows<string>(result, "ambiguous");
      if (names.length > 0) return { ask: t(`Which one: ${names.join(" or ")}?`, `Alin: ${names.join(" o ")}?`), choices: names, pending: { rule: "mark.chore", slots: { status, ...(member ? { member } : {}) }, lang, asked: 1 } };
      const what = String(field(result, "title") ?? title);
      const who = firstName(String(field(result, "for") ?? member ?? ""));
      const waits = field(result, "awaits_approval") ? t(" A grown-up will be asked to approve it.", " Hihingin ang approval ng grown-up.") : "";
      if (status === "skipped") return t(`${what} skipped for today${who ? ` (${who})` : ""}.`, `Na-skip ang ${what} ngayon${who ? ` (${who})` : ""}.`);
      return t(`${what} done${who ? ` (${who})` : ""}.${waits}`, `Tapos na ang ${what}${who ? ` (${who})` : ""}.${waits}`);
    },
  };
}

const CHORE_WORDS = /\b(chore|chores|dishes|hugas|trash|basura|garbage|laundry|labahan|laba|homework|assignment|room|kwarto|bed|kama|plants|halaman|dog|aso|cat|pusa|walk|walked|sweep|swept|walis|mop|linis|ligpit|clean|cleaned|cook|luto|feed|fed|pakain|bath|ligo|brush|toothbrush|reading|practice|piano|study|aral|dilig|watered|folded|tidied)\b/;

const choreDone: Rule = (q, ctx) => {
  if (/\b(bill|bills|list|listahan|bought|nabili|paid|bayad)\b/.test(q.text)) return null;
  if (/^(did|do|does|have|has|is|are|was|were|when|kailan|kelan|how|magkano|ano|anong|what|sino|who|whose|kanino|may|meron)\b/.test(q.text)) return null;
  const member = resolveMember(q.text, ctx.members);
  const first = q.words[0] ?? "";
  const startsWithMember = !!member && firstName(member).toLowerCase() === first;
  const skipped = /\b(skip|skipped|laktawan|hindi (?:na )?gagawin|not doing|pass)\b/.test(q.text);
  const CHORE_VERBS = "took out|took|walked|fed|watered|washed|cleaned|swept|mopped|folded|made|tidied|cooked|did|finished|completed|has done|already did|is done with";
  const patterns = [
    /^(?:mark|i-?mark)\s+(?:the\s+|ang\s+|yung\s+)?(.+?)\s+(?:as\s+)?(?:done|finished|complete|completed|tapos|skipped)$/,
    ...(member ? [new RegExp(`^(.+?)\\s+(?:done|tapos na|tapos)\\s+(?:by\\s+|ni\\s+|si\\s+)?${firstName(member).toLowerCase()}$`)] : []),
    ...(startsWithMember ? [new RegExp(`^\\w+\\s+(?:${CHORE_VERBS})\\s+(?:out\\s+)?(?:the\\s+|her\\s+|his\\s+|their\\s+)?(.+)$`)] : []),
    /^(?:na)?(ligpit|walis|hugas|laba|linis|luto|pakain|dilig|lakad)\s+na\s+(?:ni|si)\s+\w+(?:\s+(?:ang|yung)\s+(.+))?$/,
    /^(?:done|finished|tapos na|natapos|natapos ko|natapos na)\s+(?:with\s+|the\s+|ang\s+|yung\s+|ko\s+na\s+ang\s+|na\s+ang\s+|na\s+)?(.+)$/,
    /^(?:the\s+|ang\s+|yung\s+)?(.+?)\s+(?:is|are)\s+(?:done|finished)$/,
    /^(.+?)\s+(?:done|tapos na|tapos)$/,
    /^(?:skip|skipped|laktawan)\s+(?:the\s+|ang\s+|yung\s+)?(.+?)(?:\s+(?:today|ngayon|for today))?$/,
    ...(startsWithMember ? [/^(?:\w+)\s+(?:did|finished|completed|has done|is done with|already did)\s+(?:the\s+|her\s+|his\s+|their\s+)?(.+)$/] : []),
    /^(?:ginawa|tapos|natapos|nagawa)\s+na\s+(?:ni|si)\s+\w+\s+(?:ang\s+|yung\s+)?(.+)$/,
    /^(?:na-?)?(?:hugas|linis|ligpit|walis|laba)\s+na\s+(?:ni\s+\w+\s+)?(?:ang\s+|yung\s+)?(.+)$/,
  ];
  let title: string | null = null;
  for (const re of patterns) {
    const m = re.exec(q.text);
    if (m) {
      // The Filipino verb-root form names the chore by its verb when no object follows.
      const roots: Record<string, string> = { ligpit: "tidy", walis: "sweep", hugas: "dishes", laba: "laundry", linis: "clean", luto: "cook", pakain: "feed", dilig: "water plants", lakad: "walk" };
      title = m[2] ?? (roots[m[1]] ? `${roots[m[1]]} ${m[1]}` : m[1]);
      break;
    }
  }
  if (!title) return null;
  title = title
    .replace(member ? new RegExp(`\\b${firstName(member).toLowerCase()}(?:'s)?\\b`, "g") : /$^/, " ")
    .replace(/\b(the|ang|yung|her|his|their|my|ko|niya|nila|na|ni|si|kay|today|ngayon|already|for today|chore|chores|task|tasks|gawain|with|is|are)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title || title.length < 3) return null;
  // Not a chore word and nobody named: too likely a plan or a bill.
  if (!CHORE_WORDS.test(q.text) && !member) return null;
  // "Ben took out the trash": the chore is the object, "trash".
  title = title.replace(/^(out|up)\s+/, "").replace(/\s+(out|up)$/, "").trim();
  return choreMatch(title, member, skipped ? "skipped" : "done", q.lang);
};


/* ------------------------------------------- the probe's gaps (28 October) */

const pantry: Rule = (q) => {
  if (!/\b(pantry|ref|fridge|refrigerator|stock|stocks|supplies|at home|sa bahay|running low|paubos|ubos na|low on|kulang na|laman ng ref|nasa ref|nasa pantry)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|idagdag|buy|bili|list|listahan|budget|money|pera|bill)\b/.test(q.text) && !/\b(running low|paubos|ubos)\b/.test(q.text)) return null;
  const bare = /^(?:the |ang |our |yung )?(?:pantry|ref|fridge|stocks?|supplies|running low|paubos na)(?: natin| namin| items| list)?$/.test(q.text);
  if (!bare && !/\b(what|ano|anong|whats|show|list|meron|may|nasa|laman|what do we have|running low|paubos|ubos|low)\b/.test(q.text)) return null;
  const lowOnly = /\b(running low|paubos|ubos na|low on|kulang na|low)\b/.test(q.text);
  const t = pick(q.lang);
  return {
    rule: lowOnly ? "household.pantry_low" : "household.pantry",
    tool: "get_household",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const items = rows<PantryItem>(result, "pantry");
      const low = items.filter((p) => p.running_low);
      const line = (p: PantryItem) => `${p.name}${formatQuantity(p.quantity, p.unit) ? ` ${formatQuantity(p.quantity, p.unit)}` : ""}`;
      if (lowOnly) return low.length === 0 ? t("Nothing is marked running low.", "Walang nakamarkang paubos.") : t(`Running low (${low.length}): ${joinList(low.map(line), 12)}.`, `Paubos na (${low.length}): ${joinList(low.map(line), 12)}.`);
      if (items.length === 0) return t("The pantry list is empty. Household → To-Buy keeps it.", "Walang laman ang pantry list. Nasa Household → To-Buy ito.");
      const lowNote = low.length > 0 ? t(` Running low: ${low.map((p) => p.name).join(", ")}.`, ` Paubos na: ${low.map((p) => p.name).join(", ")}.`) : "";
      return t(`In the pantry (${items.length}): ${joinList(items.map(line), 15)}.${lowNote}`, `Sa pantry (${items.length}): ${joinList(items.map(line), 15)}.${lowNote}`);
    },
  };
};

/** "Did we pay Meralco?", "is the rent paid", "bayad na ba ang Meralco", "paid
 * bills this month", "what have we paid this month": questions about a
 * payment made, answered from the bills (search for one, the schedule for a
 * range). Never a mark. */
const paidStatus: Rule = (q, ctx) => {
  const aboutPaid = /\b(paid|bayad|nabayaran|binayaran|nagbayad|settled)\b/.test(q.text) || /^(?:did|have|has) (?:we|i|anyone|someone) (?:already )?pay\b/.test(q.text);
  if (!aboutPaid) return null;
  const question = /^(did|have|has|is|are|was|were|what|which|ano|anong|alin)\b/.test(q.text) || /\b(ba|na ba)\b/.test(q.text) || /\bbills\b/.test(q.text);
  if (!question) return null;
  if (/\b(add|pa-?add|mark|tick|unpaid|overdue)\b/.test(q.text)) return null;
  const range = resolveRange(q.text, ctx.today);
  const t = pick(q.lang);
  if (/\bbills\b/.test(q.text) || /^what have we paid/.test(q.text) || /^(?:anong|ano ang) (?:na)?bayad/.test(q.text)) {
    const r = range ?? { from: ctx.today.slice(0, 8) + "01", to: endOfMonth(ctx.today), label: { en: "this month", tl: "ngayong buwan" }, single: false };
    return {
      rule: "bills.paid_range",
      tool: "get_schedule",
      input: { from: r.from, to: r.to },
      lang: q.lang,
      say: (result) => {
        if (isError(result)) return result.error;
        const paid = rows<Bill>(result, "bills_due").filter((b) => b.status === "paid").sort((a, b) => a.due_date.localeCompare(b.due_date));
        const label = q.lang === "tl" ? r.label.tl : r.label.en;
        if (paid.length === 0) return t(`No bills paid ${label} yet.`, `Wala pang bayad na bill ${label}.`);
        const total = paid.reduce((s, b) => s + Number(b.amount), 0);
        return t(`Paid ${label} (${paid.length}): ${paid.map((b) => `${b.name} ${money(b.amount, ctx.currency)}`).join("; ")}. Total ${money(total, ctx.currency)}.`, `Bayad na ${label} (${paid.length}): ${paid.map((b) => `${b.name} ${money(b.amount, ctx.currency)}`).join("; ")}. Total ${money(total, ctx.currency)}.`);
      },
    };
  }
  const name = q.text
    .replace(/\b(did|do|have|has|is|are|was|were|we|i|the|our|my|ang|yung|na|ba|pay|paid|bayad|nabayaran|binayaran|nagbayad|settled|already|for|bill|bills|this month|ngayong buwan|natin|namin|ko|tayo|kami|ng|ni|si|sa|kaya)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length < 3) return null;
  return {
    rule: "bills.paid_one",
    tool: "search",
    input: { query: name },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const bills = rows<Bill>(result, "bills").filter((b) => billMatches(b, name)).sort((a, b) => b.due_date.localeCompare(a.due_date));
      if (bills.length === 0) return t(`No bill called "${name}" in Kin.`, `Walang bill na "${name}" sa Kin.`);
      const paid = bills.filter((b) => b.status === "paid")[0];
      const open = bills.filter((b) => b.status !== "paid").sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
      // Not paid: nothing paid yet, or an open one that is current or earlier than the paid one.
      if (open && (!paid || open.due_date <= ctx.today || open.due_date < paid.due_date)) {
        return t(`${open.name} is not paid yet: ${money(open.amount, ctx.currency)} due ${readableDay(open.due_date)} (${distance(open.due_date, ctx.today, q.lang)}).`, `Hindi pa bayad ang ${open.name}: ${money(open.amount, ctx.currency)}, due ${readableDay(open.due_date)} (${distance(open.due_date, ctx.today, q.lang)}).`);
      }
      if (paid) return t(`Yes, ${paid.name} is paid (${money(paid.amount, ctx.currency)}, due ${readableDay(paid.due_date)})${open ? `; the next one, ${money(open.amount, ctx.currency)}, is due ${readableDay(open.due_date)}` : ""}.`, `Oo, bayad na ang ${paid.name} (${money(paid.amount, ctx.currency)}, due ${readableDay(paid.due_date)})${open ? `; ang susunod, ${money(open.amount, ctx.currency)}, due ${readableDay(open.due_date)}` : ""}.`);
      return `${bills[0].name}: ${bills[0].status}, due ${readableDay(bills[0].due_date)}.`;
    },
  };
};

const birthdaysComing: Rule = (q, ctx) => {
  if (!/\b(birthday|birthdays|kaarawan|bday)\b/.test(q.text)) return null;
  if (resolveMember(q.text, ctx.members)) return null;
  if (!/\b(next|upcoming|coming|soon|this month|next month|ngayong buwan|susunod|sino|whose|who|malapit|this week|this year)\b/.test(q.text)) return null;
  if (/\b(add|pa-?add|party|gift|regalo|plan)\b/.test(q.text)) return null;
  const range = resolveRange(q.text, ctx.today);
  const t = pick(q.lang);
  return {
    rule: "family.birthdays",
    tool: "get_family",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const year = Number(ctx.today.slice(0, 4));
      const coming = rows<Member>(result, "members")
        .filter((m) => m.dob)
        .map((m) => {
          const [y, mo, d] = m.dob!.split("-").map(Number);
          const thisYear = `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const next = thisYear >= ctx.today ? thisYear : `${year + 1}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          return { name: firstName(m.full_name), next, turning: Number(next.slice(0, 4)) - y };
        })
        .sort((a, b) => a.next.localeCompare(b.next));
      const inRange = range ? coming.filter((c) => c.next >= range.from && c.next <= range.to) : coming.slice(0, 3);
      const label = range ? (q.lang === "tl" ? range.label.tl : range.label.en) : t("next up", "susunod");
      if (inRange.length === 0) return t(`No birthdays ${label}.`, `Walang birthday ${label}.`);
      return t(`Birthdays ${label}: ${inRange.map((c) => `${c.name} ${readableDay(c.next)} (${c.turning})`).join("; ")}.`, `Birthday ${label}: ${inRange.map((c) => `${c.name} ${readableDay(c.next)} (${c.turning})`).join("; ")}.`);
    },
  };
};

/** Fixed-date days a household asks about by name. Movable holidays (Holy
 * Week, the regular holidays the government moves) are the calendar's and
 * the model's. */
const FIXED_DAYS: { re: RegExp; month: number; day: number; en: string; tl: string }[] = [
  { re: /\b(christmas eve|noche buena|bisperas ng pasko)\b/, month: 12, day: 24, en: "Christmas Eve", tl: "Noche Buena" },
  { re: /\b(christmas|pasko)\b/, month: 12, day: 25, en: "Christmas", tl: "Pasko" },
  { re: /\b(new year'?s? eve|media noche|bisperas ng bagong taon)\b/, month: 12, day: 31, en: "New Year's Eve", tl: "Media Noche" },
  { re: /\b(new year|bagong taon)\b/, month: 1, day: 1, en: "New Year's Day", tl: "Bagong Taon" },
  { re: /\b(all saints|undas|all saints' day)\b/, month: 11, day: 1, en: "All Saints' Day", tl: "Undas" },
  { re: /\b(valentine'?s?|valentines day|araw ng mga puso)\b/, month: 2, day: 14, en: "Valentine's Day", tl: "Valentine's" },
  { re: /\b(independence day|araw ng kalayaan)\b/, month: 6, day: 12, en: "Independence Day", tl: "Araw ng Kalayaan" },
  { re: /\b(rizal day)\b/, month: 12, day: 30, en: "Rizal Day", tl: "Rizal Day" },
  { re: /\b(bonifacio day)\b/, month: 11, day: 30, en: "Bonifacio Day", tl: "Bonifacio Day" },
  { re: /\b(labor day|araw ng paggawa)\b/, month: 5, day: 1, en: "Labor Day", tl: "Araw ng Paggawa" },
  { re: /\b(halloween)\b/, month: 10, day: 31, en: "Halloween", tl: "Halloween" },
];

const dateAndTime: Rule = (q, ctx) => {
  const t = pick(q.lang);
  const none = (rule: string, line: string): RuleMatch => ({ rule, tool: "none", input: {}, lang: q.lang, say: () => line });
  if (/^(?:what time is it|what is the time|anong oras na|anong oras|time check|oras)(?: now| ngayon)?$/.test(q.text)) {
    if (!ctx.now) return null;
    return none("clock.time", t(`It's ${familyTime(ctx.now, ctx.timeZone)}.`, `${familyTime(ctx.now, ctx.timeZone)} na.`));
  }
  if (/^(?:what day is it|what day is it today|what is the date|what is the date today|what is today'?s date|date today|today'?s date|anong petsa|anong petsa ngayon|anong araw ngayon|anong araw na|ano ang petsa ngayon|petsa ngayon)$/.test(q.text)) {
    return none("clock.date", t(`Today is ${readableDay(ctx.today, { long: true, year: true })}.`, `Ngayon ay ${readableDay(ctx.today, { long: true, year: true })}.`));
  }
  const day = FIXED_DAYS.find((d) => d.re.test(q.text));
  if (day && /\b(when|kailan|how many days|ilang araw|ilang tulog|how many sleeps|days until|days to|days before|bago|is it|na ba|malapit|countdown)\b/.test(q.text) && !/\b(add|pa-?add|plan|party|gift|regalo|budget|list|buy|spend|spent|gastos)\b/.test(q.text)) {
    const year = Number(ctx.today.slice(0, 4));
    const make = (y: number) => `${y}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
    const date = make(year) >= ctx.today ? make(year) : make(year + 1);
    const n = daysBetween(ctx.today, date) ?? 0;
    const name = q.lang === "tl" ? day.tl : day.en;
    if (n === 0) return none("clock.holiday", t(`${name} is today!`, `${name} na ngayon!`));
    const withYear = date.slice(0, 4) !== ctx.today.slice(0, 4);
    return none("clock.holiday", t(`${name} is ${readableDay(date, { year: withYear })}, ${n === 1 ? "tomorrow" : `in ${n} days`}.`, `${name}: ${readableDay(date, { year: withYear })}, ${n === 1 ? "bukas" : `${n} araw pa`}.`));
  }
  return null;
};

/** In the order they are tried. The adds first (an add that mentions "due"
 * is still an add), then the health facts, bills, money, schedule, the
 * household and the family. */
const RULES: Rule[] = [
  addBill,
  addToList,
  addGoal,
  addJournal,
  addTrip,
  addPlain,
  dateAndTime,
  paidStatus,
  markPaid,
  tickItem,
  choreDone,
  health,
  whereIs,
  pantry,
  doWeHave,
  allowance,
  eventGuests,
  debts,
  subscriptions,
  documents,
  tasks,
  journal,
  goals,
  birthdaysComing,
  billsOverdue,
  billDue,
  billsOwed,
  budgetLeft,
  spendingPast,
  spending,
  billsInRange,
  accountBalance,
  totalCash,
  checkups,
  birthday,
  whoIsInFamily,
  shoppingList,
  meals,
  whenIs,
  whatsOn,
];

/** The one entry point. Null means the model's turn (or, with no key, the
 * line that says what Kin answers on its own). */
/** A bare word is its most-asked question. */
const BARE_ALIASES: Record<string, string> = {
  budget: "what's left in the budget",
  schedule: "schedule today",
  agenda: "schedule today",
  chores: "chores today",
  tasks: "chores today",
  gawain: "chores today",
  goals: "savings goals",
  ipon: "savings goals",
  documents: "what documents expire soon",
  papers: "what documents expire soon",
  family: "who is in the family",
  pamilya: "who is in the family",
  money: "how much cash do we have",
  pera: "magkano pera natin lahat",
  cash: "how much cash do we have",
  balance: "how much cash do we have",
  unpaid: "unpaid bills",
  pantry: "what's in the pantry",
  birthdays: "upcoming birthdays",
  checkups: "upcoming checkups",
  debts: "what loans do we have",
  loans: "what loans do we have",
  utang: "sino may utang sa atin",
  meals: "meals this week",
  menu: "meals this week",
  journal: "latest journal entry",
  accounts: "list accounts",
};

export function matchRule(message: string, ctx: RuleContext): RuleOutcome | null {
  let q = query(message);
  if (!q.text) return null;
  if (BARE_ALIASES[q.text]) q = query(BARE_ALIASES[q.text]);
  if (isForTheModel(q)) return null;
  for (const rule of RULES) {
    const match = rule(q, ctx);
    if (match) return match;
  }
  return null;
}

/** Whether what the client sent back is a Pending a rule here wrote. */
export function isPending(v: unknown): v is Pending {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return typeof p.rule === "string" && !!p.slots && typeof p.slots === "object" && (p.lang === "en" || p.lang === "tl") && typeof p.asked === "number";
}

/** A rule's question answered: the finished match, another question when a
 * detail is still missing (twice at most), or null when the answer is not
 * one -- the message is then read afresh, as a new question. */
export function resumeRule(pending: Pending, answer: string, ctx: RuleContext): RuleOutcome | null {
  const q = query(answer);
  if (!q.text) return null;
  const lang = pending.lang;
  const slot = (key: string) => (typeof pending.slots[key] === "string" ? (pending.slots[key] as string) : null);
  const numSlot = (key: string) => (typeof pending.slots[key] === "number" ? (pending.slots[key] as number) : null);

  if (pending.rule === "add.bill") {
    const name = slot("name");
    if (!name) return null;
    // "no" / "never mind" drops it.
    if (/^(no|never ?mind|cancel|wag na|huwag na|hindi|forget it|skip)\b/.test(q.text)) {
      return { ask: pick(lang)("Okay, not added.", "Sige, hindi na-add."), pending: { rule: "none", slots: {}, lang, asked: 0 } };
    }
    let amount = numSlot("amount");
    let dueDate = slot("due_date");
    if (amount === null) {
      // The amount first, so "3200 due the 15th" reads both.
      amount = readAmount(q.text.replace(/\bdue\b.*$/, "")) ?? readAmount(q.text.replace(/\b\d{1,2}(?:st|nd|rd|th)\b|\b\d{4}-\d{2}-\d{2}\b/g, " "));
    }
    if (!dueDate) {
      const dateText = /\bdue\b(.*)$/.exec(q.text)?.[1] ?? q.text.replace(/(?:₱|\bphp|\bp)?\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*k?|(?:₱|\bphp|\bp)?\s*\d+(?:\.\d+)?\s*k\b/g, " ");
      const range = resolveRange(dateText.trim(), ctx.today);
      if (range?.single) dueDate = range.from;
    }
    const extra = { category: slot("category") ?? undefined, recurrence: slot("recurrence") ?? BILL_RECURRENCE(q.text) };
    if (amount === null || !dueDate) {
      if (pending.asked >= 2) return null;
      return askForBill(name, amount, dueDate, lang, pending.asked + 1, extra);
    }
    return addBillMatch(name, amount, dueDate, lang, ctx, extra);
  }

  if (pending.rule === "mark.paid") {
    const bill = slot("bill");
    if (!bill) return null;
    if (/^(no|never ?mind|cancel|wag na|huwag na|hindi|forget it|skip)\b/.test(q.text)) {
      return { ask: pick(lang)("Okay, left as unpaid.", "Sige, hindi minarkahang bayad."), pending: { rule: "none", slots: {}, lang, asked: 0 } };
    }
    const outside = /\b(outside|labas|cash|over the counter|personally|wala sa kin|hindi sa kin)\b/.test(q.text);
    const account = outside ? null : q.raw.replace(/^(?:from|sa|via|using|mula sa|gamit ang)\s+/i, "").trim();
    if (!outside && !account) return null;
    return markPaidMatch(bill, account, numSlot("amount"), lang, ctx);
  }

  if (pending.rule === "mark.paid.which") {
    const bill = q.raw.trim();
    if (!bill) return null;
    const account = slot("account");
    const outside = pending.slots.outside === 1;
    if (account || outside) return markPaidMatch(bill, account, numSlot("amount"), lang, ctx);
    return {
      rule: "mark.paid.ask",
      tool: "get_money",
      input: {},
      lang,
      say: (result) => {
        if (isError(result)) return result.error;
        const hit = rows<Bill>(result, "unpaid_bills").find((b) => b.name.toLowerCase() === bill.toLowerCase());
        if (!hit) return pick(lang)(`No unpaid bill called "${bill}".`, `Walang unpaid na bill na "${bill}".`);
        return askAccountFor(hit.name, numSlot("amount") ?? Number(hit.amount), rows<Account>(result, "accounts"), lang, ctx);
      },
    };
  }

  if (pending.rule === "mark.tick") {
    const name = q.raw.trim();
    if (!name) return null;
    return tickMatch(name, pending.slots.checked !== 0, lang);
  }

  if (pending.rule === "mark.chore") {
    const title = q.raw.trim();
    if (!title) return null;
    return choreMatch(title, slot("member"), pending.slots.status === "skipped" ? "skipped" : "done", lang);
  }

  if (pending.rule === "add.activity") {
    const title = slot("title");
    if (!title) return null;
    if (/^(no|never ?mind|cancel|wag na|huwag na|hindi|forget it|skip)\b/.test(q.text)) {
      return { ask: pick(lang)("Okay, not added.", "Sige, hindi na-add."), pending: { rule: "none", slots: {}, lang, asked: 0 } };
    }
    const who = (slot("who") ?? "").split("|").filter(Boolean);
    const wholeFamily = pending.slots.whole_family === 1;
    let text = q.text;
    for (const [re, en] of TL_TO_EN) text = text.replace(re, en);
    const parsed = parseQuickLine(`${title} ${text}`, { today: ctx.today, members: [] });
    const range = resolveRange(text, ctx.today);
    const date = slot("date") ?? (range?.single ? range.from : null);
    const from = parsed && parsed.kind === "task" ? parsed.from : null;
    const to = parsed && parsed.kind === "task" ? parsed.to : null;
    if (!date || !from) {
      if (pending.asked >= 2) return null;
      return askForActivity(title, date, who, wholeFamily, lang, pending.asked + 1);
    }
    return activityMatch(title, date, from, to, who, wholeFamily, lang);
  }

  if (pending.rule === "allowance.who") {
    const who = resolveMember(q.text, ctx.members) ?? ctx.members.find((m) => m.toLowerCase() === q.text.trim());
    if (!who) return null;
    return matchRule(`${pending.slots.points === 1 ? "how many points does" : "how much is in"} ${firstName(who)}${pending.slots.points === 1 ? " have" : "'s piggy bank"}`, ctx);
  }

  if (pending.rule === "bills.due_when") {
    const name = slot("name");
    if (!name) return null;
    // The chip's text, or enough of it.
    return billDueMatch(name, lang, ctx, q.raw.trim());
  }

  return null;
}

/** What Kin says when no rule matched and there is no key (the route's
 * KIN_AI_OFF replacement): three things it can answer by itself, chosen by
 * the words in the question so a money question hears money examples. */
export function rulesOnlyLine(message: string): string {
  const text = normalise(message);
  const lang = detectLang(text);
  const money = /\b(money|pera|bill|bills|budget|spend|spent|gastos|balance|cash|owe|utang|save|ipon|goal|account|peso|₱)\b/.test(text);
  const food = /\b(list|listahan|buy|bili|grocery|groceries|meal|meals|dinner|lunch|ulam|cook|luto|recipe|pantry)\b/.test(text);
  const people = /\b(family|pamilya|birthday|kaarawan|allerg|medicine|gamot|doctor|doktor|blood|health|checkup|check-up)\b/.test(text);
  const examples = lang === "tl"
    ? money
      ? ["Kailan due ang Meralco?", "Magkano nagastos natin sa groceries this month?", "Magkano ang laman ng GCash?"]
      : food
        ? ["Anong nasa listahan?", "Anong ulam bukas?", "Pa-add ng gatas"]
        : people
          ? ["Kailan birthday ni Lia?", "Ano ang allergy ni Lia?", "Sino may check-up?"]
          : ["Kailan due ang Meralco?", "Anong meron bukas?", "Pa-add ng gatas"]
    : money
      ? ["When is the electric bill due?", "How much did we spend on groceries this month?", "How much is in GCash?"]
      : food
        ? ["What's on the list?", "What's for dinner tomorrow?", "Add milk to the list"]
        : people
          ? ["When is Lia's birthday?", "What is Lia's allergy?", "Who has a check-up?"]
          : ["When is the electric bill due?", "What's on tomorrow?", "Add milk to the list"];
  const quoted = examples.map((e) => `"${e}"`);
  return lang === "tl"
    ? `Hindi ko pa masagot 'yan nang mag-isa (hindi pa naka-on ang Kin AI, walang ipinadala kahit saan). Kaya ko: ${quoted[0]}, ${quoted[1]}, ${quoted[2]}.`
    : `I can't answer that one on my own yet (Kin AI isn't switched on, and nothing was sent anywhere). I can answer things like ${quoted[0]}, ${quoted[1]} and ${quoted[2]}.`;
}

/** The one-line note the console shows the first time a rule answers. */
export const RULES_NOTE = "That one came from your household's own records in Kin. Nothing was sent anywhere.";
