/** Cook mode and servings: the pure rules behind them. Scaling a recipe is a
 * view — nothing here writes to the saved recipe or to a planned meal. */

/** Units a cook counts rather than measures: half an egg is not something
 * anyone can buy or crack, so these round up to whole ones. */
const WHOLE_UNITS = new Set([
  "pc", "pcs", "piece", "pieces", "egg", "eggs", "clove", "cloves", "head", "heads", "stalk", "stalks",
  "whole", "slice", "slices", "leaf", "leaves", "sprig", "sprigs",
]);

/** Kitchen measures and the containers things come in, where "½ cup" or
 * "⅓ bottle" is how a cook reads an amount and "0.33" is not. */
const FRACTION_UNITS = new Set([
  "cup", "cups", "tbsp", "tbs", "tablespoon", "tablespoons", "tsp", "teaspoon", "teaspoons",
  "pack", "can", "bottle", "jar", "box", "sachet", "bundle", "tray", "tub", "sack", "dozen",
]);

/** Grams and millilitres to a whole number (to the nearest five once they
 * are big enough that nobody weighs 143 g). Kilos, litres and anything Kin
 * doesn't know go to two places. */
const SMALL_METRIC = new Set(["g", "gram", "grams", "ml"]);

/** The fractions a cook actually measures with, and their glyphs. */
const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];

const norm = (unit: string | null | undefined) => (unit ?? "").trim().toLowerCase().replace(/\.$/, "");

/** How many of the recipe's own amount the chosen servings call for. A
 * recipe with no sensible `serves` is left as written. */
export function scaleFactor(recipeServes: number, servings: number): number {
  if (!Number.isFinite(recipeServes) || recipeServes <= 0 || !Number.isFinite(servings) || servings <= 0) return 1;
  return servings / recipeServes;
}

/** Trim a number to at most `places` decimals, without trailing zeros. */
function trimmed(n: number, places: number): string {
  return String(Number(n.toFixed(places)));
}

/** "1½", "⅓", "2" — the nearest measuring fraction. A positive amount never
 * rounds down to nothing: a pinch of salt is still salt. */
export function toFraction(n: number): { value: number; text: string } {
  if (!(n > 0)) return { value: 0, text: "0" };
  let whole = Math.floor(n);
  const rest = n - whole;
  let best: [number, string] = [0, ""];
  let bestGap = rest;
  for (const f of FRACTIONS) {
    const gap = Math.abs(rest - f[0]);
    if (gap < bestGap - 1e-9) {
      best = f;
      bestGap = gap;
    }
  }
  if (Math.abs(1 - rest) < bestGap - 1e-9) {
    whole += 1;
    best = [0, ""];
  }
  if (whole === 0 && best[0] === 0) best = FRACTIONS[0];
  const value = whole + best[0];
  const text = whole === 0 ? best[1] : `${whole}${best[1]}`;
  return { value, text };
}

/** An amount rounded the way the cook would measure it, given its unit and
 * (for eggs written with no unit) the ingredient's name. `value` is the
 * rounded number; `text` is what to show. */
export function roundForCooking(qty: number, unit: string | null | undefined, name = ""): { value: number; text: string } {
  if (!Number.isFinite(qty) || qty <= 0) return { value: 0, text: "0" };
  const u = norm(unit);
  const counted = WHOLE_UNITS.has(u) || (u === "" && /\beggs?\b|\bitlog\b/i.test(name));
  if (counted) {
    // A float like 3.0000000001 from 0.6 × 5 is three eggs, not four.
    const value = Math.max(1, Math.ceil(qty - 1e-6));
    return { value, text: String(value) };
  }
  if (FRACTION_UNITS.has(u)) return toFraction(qty);
  if (SMALL_METRIC.has(u)) {
    const value = qty >= 50 ? Math.round(qty / 5) * 5 : Math.max(1, Math.round(qty));
    return { value, text: String(value) };
  }
  const value = Math.max(0.01, Number(qty.toFixed(2)));
  return { value, text: trimmed(value, 2) };
}

/** One ingredient's amount for the chosen servings, ready to show. An
 * amount the recipe left blank ("to taste") stays blank. */
export function scaleIngredient(
  ing: { name: string; qty: number | null; unit: string | null },
  recipeServes: number,
  servings: number,
): { qty: number | null; text: string } {
  if (ing.qty == null || !Number.isFinite(ing.qty)) return { qty: null, text: ing.unit ?? "" };
  const factor = scaleFactor(recipeServes, servings);
  const unit = ing.unit?.trim() ?? "";
  // At the recipe's own servings the amount is shown as the cook wrote it;
  // the rounding rules are for amounts Kin worked out.
  if (factor === 1) return { qty: ing.qty, text: [trimmed(ing.qty, 3), unit].filter(Boolean).join(" ") };
  const r = roundForCooking(ing.qty * factor, unit, ing.name);
  return { qty: r.value, text: [r.text, unit].filter(Boolean).join(" ") };
}

/** Servings the stepper may go to. */
export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 30;

export function clampServings(n: number): number {
  if (!Number.isFinite(n)) return MIN_SERVINGS;
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(n)));
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, "twenty-five": 25, thirty: 30, forty: 40, "forty-five": 45,
  fifty: 50, sixty: 60, ninety: 90, half: 0.5, "a half": 0.5,
};

const UNIT_SECONDS: [RegExp, number][] = [
  [/^(?:hours?|hrs?|h)$/i, 3600],
  [/^(?:minutes?|mins?|m)$/i, 60],
  [/^(?:seconds?|secs?|s)$/i, 1],
];

function unitSeconds(word: string): number | null {
  for (const [re, s] of UNIT_SECONDS) if (re.test(word)) return s;
  return null;
}

function readAmount(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s in NUMBER_WORDS) return NUMBER_WORDS[s];
  const glyph = s.match(/^(\d*)\s*([½¼¾⅓⅔])$/);
  if (glyph) {
    const frac = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 }[glyph[2]] ?? 0;
    return (glyph[1] ? Number(glyph[1]) : 0) + frac;
  }
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type StepTimer = { seconds: number; label: string };

/** "20 minutes", "about an hour", "1½ hours", "half an hour", "3–5 minutes"
 * (the shorter, so the cook checks early rather than late): every time a
 * step mentions, as seconds, in the order they appear. */
export function findDurations(step: string): StepTimer[] {
  const found: StepTimer[] = [];
  const amount = String.raw`(\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔]?|[½¼¾⅓⅔]|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty(?:-five)?|thirty|forty(?:-five)?|fifty|sixty|ninety)`;
  const unit = String.raw`(hours?|hrs?|minutes?|mins?|seconds?|secs?)`;
  const re = new RegExp(
    String.raw`\bhalf\s+an?\s+hour\b|(?:^|[^\w-])${amount}(?:\s*(?:-|–|to)\s*${amount})?\s*(?:and\s+(?:a\s+)?(half)\s+)?${unit}\b(?:\s*(?:and\s+)?(\d+)\s*(minutes?|mins?))?`,
    "gi",
  );
  for (const m of step.matchAll(re)) {
    let seconds: number | null = null;
    if (/^\s*half\s+an?\s+hour/i.test(m[0].trimStart())) seconds = 1800;
    else {
      const n = readAmount(m[1] ?? "");
      const per = unitSeconds(m[4] ?? "");
      if (n != null && per != null) {
        seconds = n * per;
        if (m[3]) seconds += 0.5 * per;
        if (m[5] && m[6]) seconds += Number(m[5]) * 60;
      }
    }
    if (seconds && seconds > 0 && seconds <= 24 * 3600) found.push({ seconds: Math.round(seconds), label: formatDuration(Math.round(seconds)) });
  }
  return found;
}

/** "20 min", "1 hr", "1 hr 30 min", "45 sec". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h === 0 && m === 0) return `${s} sec`;
  const parts = [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean);
  return parts.join(" ") + (s && h === 0 ? ` ${s} sec` : "");
}

/** "19:58", "1:04:30" — a running timer's face. */
export function formatClock(seconds: number): string {
  const t = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
