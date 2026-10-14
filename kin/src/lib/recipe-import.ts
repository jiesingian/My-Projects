import { UNITS, guessSection, type MarketSection } from "@/lib/grocery";

/** Save a recipe from a link (Meals tab). Almost every recipe site --
 * Panlasang Pinoy, Kawaling Pinoy, AllRecipes, BBC Good Food, a WordPress
 * food blog -- puts the recipe in the page as schema.org JSON-LD for Google's
 * recipe cards. Kin reads that, not the page's look: no AI, nothing paid,
 * and the same page always reads the same way. What it finds only fills the
 * recipe editor; nothing is saved until someone checks it and taps Save.
 *
 * A page without it (Instagram, TikTok, a video) still gives its title, so
 * the editor opens with the name and the link, ready to be written in. */

export type RecipeDraft = {
  name: string;
  serves: number | null;
  minutes: number | null;
  steps: string[];
  ingredients: { name: string; qty: number | null; unit: string | null; section: MarketSection }[];
  sourceUrl: string;
  /** False when the page had no recipe in it, only a title. */
  found: boolean;
};

/** Units a recipe writes, folded onto one spelling. Kin's own shopping units
 * (UNITS) are kept as they are; cooking measures keep their short name. */
const UNIT_WORDS: [RegExp, string][] = [
  [/^(cups?|c\.?)$/i, "cup"],
  [/^(tablespoons?|tbsps?\.?|tbs\.?|T)$/, "tbsp"],
  [/^(teaspoons?|tsps?\.?|t)$/, "tsp"],
  [/^(kilograms?|kilos?|kgs?)$/i, "kg"],
  [/^(grams?|gms?|g)$/i, "g"],
  [/^(liters?|litres?|l)$/i, "L"],
  [/^(milliliters?|millilitres?|mls?)$/i, "mL"],
  [/^(pounds?|lbs?)$/i, "lb"],
  [/^(ounces?|oz)$/i, "oz"],
  [/^(pieces?|pcs?)$/i, "pc"],
  [/^(cloves?)$/i, "clove"],
  [/^(cans?)$/i, "can"],
  [/^(packs?|packets?|packages?)$/i, "pack"],
  [/^(bunch(es)?|bundles?|tali)$/i, "bundle"],
  [/^(sachets?)$/i, "sachet"],
  [/^(bottles?)$/i, "bottle"],
  [/^(jars?)$/i, "jar"],
  [/^(pinch(es)?)$/i, "pinch"],
  [/^(slices?)$/i, "slice"],
  [/^(stalks?)$/i, "stalk"],
];

const VULGAR: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };

/** "1 1/2", "1½", "1/2", "0.5", "2-3" (the first) → a number. */
function readAmount(text: string): { qty: number | null; rest: string } {
  const t = text.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (c) => ` ${VULGAR[c]} `).replace(/\s+/g, " ").trim();
  const m = t.match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+)|\s+(0\.\d+))?(?:\/(\d+))?(?:\s*(?:-|–|to)\s*\d+(?:[./]\d+)?)?\s*(.*)$/);
  if (!m) return { qty: null, rest: t };
  let qty = Number(m[1]);
  if (m[5]) qty = qty / Number(m[5]);
  if (m[2] && m[3]) qty += Number(m[2]) / Number(m[3]);
  if (m[4]) qty += Number(m[4]);
  return { qty: Number.isFinite(qty) && qty > 0 ? Math.round(qty * 1000) / 1000 : null, rest: m[6] };
}

/** One ingredient line, as a recipe writes it, into Kin's ingredient row:
 * "2 cups jasmine rice, rinsed" → 2 · cup · jasmine rice, rinsed. A line
 * with no amount ("salt to taste") keeps its words and no quantity. */
export function parseIngredientLine(line: string): RecipeDraft["ingredients"][number] {
  const clean = cleanText(line).replace(/^[-•*]\s*/, "");
  const { qty, rest } = readAmount(clean);
  let unit: string | null = null;
  let name = rest;
  if (qty !== null) {
    const [word, ...after] = rest.split(" ");
    const bare = word.replace(/[.,]$/, "");
    const shop = UNITS.find((u) => u.toLowerCase() === bare.toLowerCase());
    const cook = UNIT_WORDS.find(([re]) => re.test(bare))?.[1];
    if (shop || cook) {
      unit = shop ?? cook ?? null;
      name = after.join(" ").replace(/^of\s+/i, "");
    }
  }
  name = name.trim() || clean;
  return { name: name.slice(0, 150), qty, unit: unit ?? (qty !== null ? "pc" : null), section: guessSection(name) };
}

/** ISO 8601 durations as recipes write them: "PT1H30M", "PT45M", "P0DT2H". */
export function parseDuration(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (!m) return null;
  const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return minutes > 0 ? Math.round(minutes) : null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", deg: "°", frac12: "½", frac14: "¼", frac34: "¾" };

/** Tags out, entities decoded, whitespace folded -- recipe JSON often carries
 * HTML ("<p>Saut&eacute; the garlic</p>"). */
export function cleanText(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (all, n) => ENTITIES[n.toLowerCase()] ?? all)
    .replace(/\s+/g, " ")
    .trim();
}

type Json = unknown;

function isRecipe(node: Json): node is Record<string, Json> {
  if (!node || typeof node !== "object") return false;
  const t = (node as Record<string, Json>)["@type"];
  return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
}

/** The first Recipe anywhere in a JSON-LD value: itself, an array, or a
 * @graph (Yoast and most WordPress sites nest it there). */
function findRecipe(node: Json, depth = 0): Record<string, Json> | null {
  if (depth > 6 || !node || typeof node !== "object") return null;
  if (isRecipe(node)) return node;
  const values = Array.isArray(node) ? node : [(node as Record<string, Json>)["@graph"], (node as Record<string, Json>).mainEntity];
  for (const v of values) {
    const hit = findRecipe(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function steps(node: Json, depth = 0): string[] {
  if (depth > 4 || node == null) return [];
  // Split on the lines (and <br>, </p>) first: cleanText folds whitespace.
  if (typeof node === "string") return node.split(/\n+|<br\s*\/?>|<\/p>/i).map(cleanText).filter(Boolean);
  if (Array.isArray(node)) return node.flatMap((n) => steps(n, depth + 1));
  if (typeof node === "object") {
    const o = node as Record<string, Json>;
    // A HowToSection lists its steps; a HowToStep has text (or only a name).
    if (o.itemListElement) return steps(o.itemListElement, depth + 1);
    if (typeof o.text === "string") return steps(o.text, depth + 1);
    if (typeof o.name === "string") return steps(o.name, depth + 1);
  }
  return [];
}

function serves(y: Json): number | null {
  const first = Array.isArray(y) ? y[0] : y;
  const n = typeof first === "number" ? first : typeof first === "string" ? Number(first.match(/\d+/)?.[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(30, Math.round(n)) : null;
}

/** The page's own title, for a page with no recipe in it. */
function pageTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  const title = og?.[1] ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  return cleanText(title).slice(0, 150);
}

/** Reads the recipe out of a page's HTML. Null only when there is neither a
 * recipe nor a title to start from. */
export function extractRecipe(html: string, sourceUrl: string): RecipeDraft | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const raw of blocks) {
    let parsed: Json;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const r = findRecipe(parsed);
    if (!r) continue;
    const name = cleanText(typeof r.name === "string" ? r.name : "").slice(0, 150) || pageTitle(html);
    const lines = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : []).filter((l): l is string => typeof l === "string" && cleanText(l) !== "");
    return {
      name,
      serves: serves(r.recipeYield),
      minutes: parseDuration(r.totalTime) ?? (((parseDuration(r.prepTime) ?? 0) + (parseDuration(r.cookTime) ?? 0)) || null),
      steps: steps(r.recipeInstructions).map((s) => s.slice(0, 1000)).slice(0, 60),
      ingredients: lines.slice(0, 80).map(parseIngredientLine),
      sourceUrl,
      found: true,
    };
  }
  const name = pageTitle(html);
  return name ? { name, serves: null, minutes: null, steps: [], ingredients: [], sourceUrl, found: false } : null;
}

/** Whether an address is one the server may fetch: public internet only.
 * Loopback, private ranges, link-local (cloud metadata lives at
 * 169.254.169.254), carrier NAT, multicast and their IPv6 forms are not. */
export function isPublicAddress(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/i, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return false;
  if (/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6)) return false;
  return v6.includes(":");
}

/** A link someone pasted, made into an https URL Kin will try, or null. */
export function recipeLink(input: string): URL | null {
  const t = input.trim();
  if (!t || t.length > 2000) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol === "http:") u.protocol = "https:";
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (u.port && u.port !== "443") return null;
    if (!u.hostname.includes(".")) return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}
