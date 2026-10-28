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

import { addDays, weekdayOf, readableDay, daysBetween, familyClock } from "@/lib/time";
import { formatCurrency } from "@/lib/format";
import { EXPENSE_CATEGORIES, GOAL_CATEGORY, TRANSFER_CATEGORY } from "@/lib/wealth";
import { UNITS, formatQuantity } from "@/lib/grocery";

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
};

export type RuleMatch = {
  /** Which rule matched, for the spec and the logs. */
  rule: string;
  /** The assistant tool to run (ASSISTANT_TOOLS by name) ... */
  tool: string;
  /** ... with this input, as the model would have passed it. */
  input: Record<string, unknown>;
  /** The reply, phrased from the tool's parsed JSON result, in the member's
   * language. A tool's `{ error }` is relayed as it is: the tools already
   * speak plainly. */
  say: (result: unknown) => string;
  lang: Lang;
};

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

function normalise(message: string): string {
  return message
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/what's/g, "what is")
    .replace(/when's/g, "when is")
    .replace(/who's/g, "who is")
    .replace(/how's/g, "how is")
    .replace(/where's/g, "where is")
    .replace(/[?!.]+$/g, "")
    .replace(/[?!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

type Rule = (q: Query, ctx: RuleContext) => RuleMatch | null;

/** A question that reads as advice, a plan, a why, a how-to, several things at
 * once, or a change to a record is the model's. The rules answer only what a
 * record holds. */
function isForTheModel(q: Query): boolean {
  if (q.text.length > 140) return true;
  if (/\b(then|tapos|and then|after that|also|at saka|pati|and also)\b/.test(q.text) && /\b(add|pa-?add|idagdag|tell|show|what|ano|magkano|how much)\b.*\b(add|pa-?add|idagdag|tell|show|what|ano|magkano|how much)\b/.test(q.text)) return true;
  if (/\b(should|why|bakit|paano|how do i|how can|how to|advice|advise|suggest|recommend|best|better|ideas?|plan for|help me|can you help|tips?|dapat|pwede ba|can we afford|afford|compare|explain|summar(?:y|ise|ize)|remind me)\b/.test(q.text)) return true;
  if (/\b(delete|remove|edit|change|update|rename|cancel|move|mark|tanggalin|burahin|palitan|alisin)\b/.test(q.text)) return true;
  if (/\b(record|log|received|nabayaran|paid|binayaran|got paid|spent \d|gastos ko \d|transfer|ilipat)\b/.test(q.text)) return true;
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

const billDue: Rule = (q, ctx) => {
  // "when is X due", "kailan due ang X", "X due when", "kailan ang bayad ng X";
  // also "how much is the X bill", "magkano ang Meralco": the same answer,
  // the amount and the day, from the unpaid bills.
  const whenDue = /\b(when|kailan|kelan)\b/.test(q.text) && /\b(due|bayad|bayaran|babayaran|deadline)\b/.test(q.text);
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
  const t = pick(q.lang);
  return {
    rule: "bills.due_when",
    tool: "get_money",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const bills = rows<Bill>(result, "unpaid_bills").filter((b) => billMatches(b, name)).sort((a, b) => a.due_date.localeCompare(b.due_date));
      if (bills.length === 0) {
        return t(`No unpaid bill called "${name}" in Kin. Paid and other bills are under Wealth → Expenses.`, `Walang unpaid na bill na "${name}" sa Kin. Nasa Wealth → Expenses ang mga bayad na.`);
      }
      const b = bills[0];
      const when = `${readableDay(b.due_date)} (${distance(b.due_date, ctx.today, q.lang)})`;
      const late = b.due_date < ctx.today;
      return t(
        `${b.name} (${money(b.amount, ctx.currency)}) ${late ? "was due" : "is due"} ${when}.`,
        `${late ? "Due na ang" : "Due ang"} ${b.name} (${money(b.amount, ctx.currency)}) ${late ? "noong" : "sa"} ${when}.`,
      );
    },
  };
};

const billsOwed: Rule = (q, ctx) => {
  if (!/\b(how much|magkano|ilan)\b/.test(q.text)) return null;
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

function categoryIn(text: string): (typeof EXPENSE_CATEGORIES)[number] | null {
  const padded = ` ${text} `;
  for (const cat of EXPENSE_CATEGORIES) {
    for (const w of CATEGORY_WORDS[cat]) {
      if (padded.includes(` ${w} `)) return cat;
    }
  }
  return null;
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
  if (!/\b(left|natitira|natira|remaining|remains|how much|magkano|what is|ano|anong)\b/.test(q.text)) return null;
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
  if (!/\b(spend|spent|spending|gastos|nagastos|ginastos|gumastos|nagagastos|expenses?|paid for)\b/.test(q.text)) return null;
  if (!/\b(how much|magkano|what|ano|anong|total|ilan)\b/.test(q.text)) return null;
  // get_money reads this month only. Last month is the Monthly recap's, and the model's.
  if (/\b(last month|nakaraang buwan|noong|last week|yesterday|kahapon|last year|this week|ngayong linggo|today|ngayon|bukas|tomorrow)\b/.test(q.text)) return null;
  const category = categoryIn(q.text);
  const who = resolveMember(q.text, ctx.members);
  // get_money splits the month by category and by member, not both at once.
  if (who && category) return null;
  const t = pick(q.lang);
  const month = monthName(ctx.today);
  if (who) {
    return {
      rule: "spending.member",
      tool: "get_money",
      input: {},
      lang: q.lang,
      say: (result) => {
        if (isError(result)) return result.error;
        const byMember = (field(result, "this_month_out_by_member") ?? {}) as Record<string, unknown>;
        const key = Object.keys(byMember).find((k) => k.toLowerCase() === who.toLowerCase() || k.toLowerCase().split(" ")[0] === firstName(who).toLowerCase());
        const amount = key ? Number(byMember[key]) || 0 : 0;
        return t(`${firstName(who)}'s spending in ${month} so far: ${money(amount, ctx.currency)} (from accounts you can see).`, `Nagastos ni ${firstName(who)} ngayong ${month}: ${money(amount, ctx.currency)} (sa mga account na nakikita mo).`);
      },
    };
  }
  return {
    rule: category ? "spending.category" : "spending.total",
    tool: "get_money",
    input: {},
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      const spent = spentByCategory(result);
      if (category) {
        const amount = spent.get(category) ?? 0;
        return t(`${category} in ${month} so far: ${money(amount, ctx.currency)}.`, `${category} ngayong ${month}: ${money(amount, ctx.currency)}.`);
      }
      const total = [...spent.values()].reduce((a, b) => a + b, 0);
      const top = [...spent.entries()].filter(([, a]) => a > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, a]) => `${c} ${money(a, ctx.currency)}`);
      const topLine = top.length > 0 ? t(` Top: ${top.join(", ")}.`, ` Pinakamalaki: ${top.join(", ")}.`) : "";
      return t(`Spent in ${month} so far: ${money(total, ctx.currency)}.${topLine}`, `Nagastos ngayong ${month}: ${money(total, ctx.currency)}.${topLine}`);
    },
  };
};

/* balances */

type Account = { name: string; institution: string | null; scope: string; balance: number };

const totalCash: Rule = (q, ctx) => {
  if (!/\b(how much|magkano|total|what is|ano|anong|ilan)\b/.test(q.text)) return null;
  if (!/\b(cash|money|pera|balance|balances|total|all accounts|accounts|lahat ng account|net worth|savings|bank|bangko)\b/.test(q.text)) return null;
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
  if (!/\b(how much|magkano|balance|laman|ilan)\b/.test(q.text)) return null;
  if (/\b(spend|spent|gastos|budget|owe|utang|bill|bills|due)\b/.test(q.text)) return null;
  // "how much is in GCash", "magkano laman ng BPI", "GCash balance", "balance ng Maya"
  const m =
    /\b(?:in|sa|ng|nasa|laman ng)\s+(?:the |our |my |ang |aking |ating )?([a-z][a-z0-9 &'\-]*?)(?:\s+(?:account|acct|wallet|ngayon|now|right now|ba|natin|namin|ko))*$/.exec(q.text) ??
    /^(?:what is |ano ang |anong |ano )?(?:the |our |my |ang )?([a-z0-9][a-z0-9 &'\-]*?)\s+balance\b/.exec(q.text);
  if (!m) return null;
  const name = m[1].replace(/\b(the|our|my|ang|account|acct|wallet|natin|namin|ko|ba|now|ngayon)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!name || /^(total|all|everything|lahat|cash|money|pera|bank|left|natitira)$/.test(name)) return null;
  if (/\d/.test(name)) return null;
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
  if (!/\b(what is on|whats on|what is happening|what do we have|what is (?:the )?(?:schedule|plan|agenda)|schedule|agenda|plans?|anong meron|ano meron|ano ang meron|may lakad|anong lakad|ano ang lakad|anong schedule|ano ang schedule|anong nakaschedule|anything on|anything (?:happening|scheduled)|what is up|calendar|busy|free)\b/.test(q.text)) return null;
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
  if (!/\b(when|kailan|kelan|what time|anong oras)\b/.test(q.text)) return null;
  if (/\b(due|bayad|bayaran|birthday|kaarawan|bday)\b/.test(q.text)) return null;
  const who = resolveMember(q.text, ctx.members);
  const name = q.text
    .replace(/'s\b/g, "")
    .replace(/\b(when|kailan|kelan|what time|anong oras|is|are|the|our|my|ang|ng|ni|sa|ba|na|naman|natin|namin|ko|next|again|ulit|scheduled|schedule|appointment|of|for|this|do|we|have|yung|iyong|yun|un|kaya|today|tomorrow|bukas|ngayon|mamaya|week|month|linggo|buwan)\b/g, " ")
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
  if (!/\b(who|sino|any|may|meron|due|what|ano|anong|when|kailan|kelan)\b/.test(q.text)) return null;
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
  if (!/\b(what|ano|anong|show|whats|nasa|on the|sa|how many|ilan|is there|may|meron)\b/.test(q.text)) return null;
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
  if (!/\b(dinner|lunch|breakfast|meal|meals|ulam|hapunan|tanghalian|almusal|menu|cook|luto|lutuin|eating|kain)\b/.test(q.text)) return null;
  if (!/\b(what|ano|anong|whats|plan|planned|nakaplano|meron|may)\b/.test(q.text)) return null;
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
  if (!/\b(who|sino|sinu-sino|sino-sino|list|ilan|how many)\b/.test(q.text)) return null;
  if (!/\b(family|household|pamilya|members?|kasama sa bahay|sa bahay|in kin)\b/.test(q.text)) return null;
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
  { re: /\b(blood ?type|dugo|blood)\b/, key: "blood_type", en: "blood type", tl: "blood type" },
  { re: /\b(medicines?|medication|meds|gamot|iniinom|dose|doses|dosage)\b/, key: "medicines_now", en: "medicines now", tl: "gamot ngayon" },
  { re: /\b(hmo|insurance|maxicare|intellicare|medicard|philcare)\b/, key: "hmo_or_insurance", en: "HMO or insurance", tl: "HMO o insurance" },
  { re: /\b(philhealth)\b/, key: "philhealth", en: "PhilHealth", tl: "PhilHealth" },
  { re: /\b(doctor|doktor|physician|pedia|pediatrician)\b/, key: "usual_doctor", en: "usual doctor", tl: "doktor" },
  { re: /\b(conditions?|sakit|diagnos(?:is|ed)|illness(?:es)?)\b/, key: "conditions", en: "conditions", tl: "mga sakit" },
  { re: /\b(who to call|emergency contact|emergency|tawagan|tatawagan)\b/, key: "who_to_call", en: "who to call", tl: "tatawagan" },
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
  const who = resolveMember(q.text, ctx.members);
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
  const text = raw.replace(/^(?:some|a few|a|an|ng|mga|yung|the)\s+/, "").trim();
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
  return { name: text };
}

const addToList: Rule = (q) => {
  // The verb: add / pa-add / idagdag / pabili ...
  const verb = /^(?:please\s+|paki\s+|pwede\s+|kin\s+|hey kin\s+|hi kin\s+)?(add|pa-?add|paki-?add|i-?add|idagdag|dagdag|dagdagan|pakidagdag|ilagay|put|pabili|pakibili|pa-?bili|bili)\b\s*(?:ng|ang|mo|mo ng|nga|please|naman|nyo|ninyo|niyo|of)?\s*(.*)$/.exec(q.text);
  if (!verb) return null;
  let rest = verb[2].trim();
  if (!rest) return null;
  if (/\b(bill|bills|due|event|activity|appointment|goal|trip|journal|meal|dinner|lunch|calendar|schedule|planner|budget|account|reminder|note|task|chore|ulam|lakad|birthday|kaarawan|holiday)\b/.test(rest)) return null;
  if (/\b(₱|php|\d{3,})\b/.test(rest) && /\b(for|sa|due|worth)\b/.test(rest)) return null;
  // Where it goes. English needs the list named; Filipino "pa-add ng gatas" is the list.
  const target = /\s+(?:to|on|onto|in|into|sa)\s+(?:the\s+|our\s+|my\s+|ang\s+|aming\s+|ating\s+)?(?:shopping\s+|grocery\s+|groceries\s+|to-?buy\s+|market\s+|palengke\s+|grocery\s+)?(?:list|listahan|bilihin|to-?buy|groceries|cart)\b(?:\s+(?:please|naman|nga|po|ha|na|ngayon|today|bukas|tomorrow))*$/;
  const named = target.test(rest);
  const filipino = /^(pa-?add|paki-?add|idagdag|dagdag|dagdagan|pakidagdag|pabili|pakibili|pa-?bili|bili)$/.test(verb[1]) || q.lang === "tl";
  if (!named && !filipino) return null;
  rest = rest.replace(target, "").replace(/\s+(?:please|naman|nga|po|ha|na|din|rin)$/g, "").trim();
  if (!rest) return null;
  // "milk and eggs", "gatas at itlog", "milk, eggs, bread"
  const parts = rest.split(/\s*,\s*|\s+(?:and|at|&|tsaka|saka|pati)\s+/).map((p) => p.trim()).filter(Boolean);
  const items = parts.map(parseItem).filter((i): i is NonNullable<typeof i> => i !== null);
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

const addBill: Rule = (q, ctx) => {
  if (!/^(?:please\s+|paki\s+|pwede\s+)?(?:add|pa-?add|paki-?add|i-?add|idagdag|dagdag|track|new|record)\b/.test(q.text)) return null;
  if (!/\b(bill|bills|due|babayaran|bayarin)\b/.test(q.text)) return null;
  // The amount: ₱3,200 / 3200 / php 3200 / 3.2k.
  const amountMatch = /(?:₱|php|p)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k\b)?(?:\s*(?:pesos|php|piso))?/.exec(q.text.replace(/\bdue\b.*$/, ""));
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(/,/g, "")) * (amountMatch[2] ? 1000 : 1);
  if (!(amount > 0)) return null;
  // The date: after "due" (or "sa"/"on" when "due" sits before the amount).
  const dueText = /\bdue\b(.*)$/.exec(q.text)?.[1] ?? /\b(?:on|sa|every|tuwing)\b(.*)$/.exec(q.text)?.[1];
  if (!dueText) return null;
  const range = resolveRange(dueText.trim(), ctx.today);
  if (!range || !range.single) return null;
  // The name: what is left once the verb, the amount, the date and the filler go.
  const name = q.text
    .replace(/\bdue\b.*$/, "")
    .replace(/(?:₱|php|p)?\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*k?(?:\s*(?:pesos|php|piso))?|(?:₱|php|p)?\s*\d+(?:\.\d+)?\s*k?(?:\s*(?:pesos|php|piso))?/, " ")
    .replace(/^(?:please\s+|paki\s+|pwede\s+)?(?:add|pa-?add|paki-?add|i-?add|idagdag|dagdag|track|new|record)\b/, " ")
    .replace(/\b(a|an|the|new|bill|bills|of|for|ng|ang|na|sa|our|my|natin|namin|ko|worth|amount|amounting|to|please|naman|nga|po|babayaran|bayarin|this month|ngayong buwan|monthly|every month)\b/g, " ")
    .replace(/[:\-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  const category = categoryIn(q.text) ?? billCategory(name);
  const recurring = /\b(monthly|every month|buwan-buwan|buwanang|every|tuwing)\b/.test(q.text) ? "monthly" : /\b(once|one-?time|isang beses|lang)\b/.test(q.text) ? "once" : undefined;
  const t = pick(q.lang);
  const titled = name.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return {
    rule: "add.bill",
    tool: "add_bill",
    input: { name: titled, amount, due_date: range.from, ...(category ? { category } : {}), ...(recurring ? { recurrence: recurring } : {}) },
    lang: q.lang,
    say: (result) => {
      if (isError(result)) return result.error;
      return t(`Added ${titled}, ${money(amount, ctx.currency)} due ${readableDay(range.from)}.`, `Na-add ang ${titled}, ${money(amount, ctx.currency)}, due sa ${readableDay(range.from)}.`);
    },
  };
};

/** In the order they are tried. The adds first (an add that mentions "due"
 * is still an add), then the health facts, bills, money, schedule, the
 * household and the family. */
const RULES: Rule[] = [
  addBill,
  addToList,
  health,
  billsOverdue,
  billDue,
  billsOwed,
  budgetLeft,
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
export function matchRule(message: string, ctx: RuleContext): RuleMatch | null {
  const q = query(message);
  if (!q.text) return null;
  if (isForTheModel(q)) return null;
  for (const rule of RULES) {
    const match = rule(q, ctx);
    if (match) return match;
  }
  return null;
}

/** What Kin says when no rule matched and there is no key (the route's
 * KIN_AI_OFF replacement): three things it can answer by itself. */
export function rulesOnlyLine(message: string): string {
  const lang = detectLang(normalise(message));
  return lang === "tl"
    ? "Hindi ko pa masagot 'yan nang mag-isa (hindi pa naka-on ang Kin AI, walang ipinadala kahit saan). Kaya ko: \"Kailan due ang Meralco?\", \"Magkano nagastos natin sa groceries this month?\", \"Anong meron bukas?\" — at \"Pa-add ng gatas\"."
    : "I can't answer that one on my own yet (Kin AI isn't switched on, and nothing was sent anywhere). I can answer things like \"When is the electric bill due?\", \"How much did we spend on groceries this month?\" and \"What's on tomorrow?\", and add to the list: \"Add milk to the list\".";
}

/** The one-line note the console shows the first time a rule answers. */
export const RULES_NOTE = "That one came from your household's own records in Kin. Nothing was sent anywhere.";
