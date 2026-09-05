/** Market sections in the order you actually walk them — wet market first,
 * then dry goods, then the non-food aisles. The list renders in this order so
 * it reads as a route rather than an alphabet. */
export const MARKET_SECTIONS = [
  "Produce",
  "Meat",
  "Fish & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Rice & Grains",
  "Canned & Packaged",
  "Condiments & Spices",
  "Snacks",
  "Beverages",
  "Frozen",
  "Household",
  "Personal Care",
  "Baby",
  "Pet",
  "Other",
] as const;

export type MarketSection = (typeof MARKET_SECTIONS)[number];

/** The kinds of trip a to-buy list gets bought on. Free text is allowed too;
 * these are just the ones worth one tap. */
export const SHOPPING_KINDS = ["Grocery run", "Palengke", "Shopping", "Pharmacy", "Hardware"] as const;

export function sectionOrder(section: string): number {
  const i = (MARKET_SECTIONS as readonly string[]).indexOf(section);
  return i === -1 ? MARKET_SECTIONS.length : i;
}

/** Units a household actually buys in, here and at the palengke. */
export const UNITS = [
  "pc",
  "pack",
  "kg",
  "g",
  "L",
  "mL",
  "can",
  "bottle",
  "jar",
  "box",
  "sachet",
  "dozen",
  "bundle",
  "tray",
  "sack",
  "tub",
] as const;

export type Unit = (typeof UNITS)[number];

/** Keyword rules per section, English and Filipino — "sibuyas" has to land in
 * Produce as reliably as "onion" does.
 *
 * Scanned in this order, which is deliberately not the display order: the
 * narrower sections come first so "ice cream" is Frozen before Dairy's
 * "cream" can claim it. */
const SECTION_KEYWORDS: [MarketSection, string[]][] = [
  [
    "Produce",
    ["sibuyas", "onion", "bawang", "garlic", "kamatis", "tomato", "kangkong", "petsay", "pechay", "repolyo", "cabbage", "carrot", "potato", "patatas", "talong", "eggplant", "okra", "kalabasa", "squash", "sayote", "ginger", "luya", "gulay", "saging", "banana", "mangga", "mango", "apple", "lettuce", "malunggay", "ampalaya", "sitaw", "monggo", "calamansi", "lemon", "cucumber", "pipino", "fruit", "prutas", "vegetable"],
  ],
  ["Meat", ["chicken", "manok", "pork", "baboy", "beef", "baka", "karne", "liempo", "giniling", "ground", "hotdog", "longganisa", "tocino", "bacon", "ham", "ribs", "tapa"]],
  ["Fish & Seafood", ["fish", "isda", "bangus", "tilapia", "galunggong", "hipon", "shrimp", "pusit", "squid", "tuyo", "daing", "crab", "alimango", "tahong", "mussel", "seafood"]],
  ["Frozen", ["frozen", "ice cream", "nugget", "fries", "ice"]],
  ["Dairy & Eggs", ["egg", "itlog", "milk", "gatas", "cheese", "keso", "butter", "mantikilya", "yogurt", "cream", "margarine"]],
  ["Bakery", ["bread", "tinapay", "pandesal", "cake", "loaf", "bun", "monay", "ensaymada"]],
  ["Rice & Grains", ["rice", "bigas", "pasta", "spaghetti", "noodle", "pancit", "bihon", "flour", "harina", "oats", "cereal", "macaroni"]],
  ["Canned & Packaged", ["canned", "de lata", "sardinas", "sardines", "corned beef", "tuna", "luncheon meat", "condensed", "evaporada", "evaporated", "instant"]],
  ["Condiments & Spices", ["toyo", "soy sauce", "suka", "vinegar", "patis", "asin", "salt", "asukal", "sugar", "paminta", "pepper", "sinigang", "mix", "sauce", "ketchup", "oil", "mantika", "bagoong", "pampalasa", "magic sarap", "bouillon", "cube", "seasoning", "mayonnaise", "spice"]],
  ["Snacks", ["chips", "biscuit", "cookie", "candy", "chocolate", "snack", "cracker", "chichirya", "peanut", "mani"]],
  ["Beverages", ["water", "tubig", "juice", "soda", "coffee", "kape", "tea", "beer", "softdrink", "soft drink", "milo", "powdered drink"]],
  ["Household", ["soap", "sabon", "detergent", "bleach", "zonrox", "tissue", "toothpick", "walis", "panlinis", "dishwashing", "trash bag", "garbage bag", "batteries", "battery", "bulb", "candle", "fabcon", "fabric conditioner", "downy", "alcohol", "insect", "baygon"]],
  ["Personal Care", ["shampoo", "toothpaste", "toothbrush", "deodorant", "lotion", "razor", "sanitary", "napkin", "cotton", "conditioner", "powder", "perfume", "wipes for face"]],
  ["Baby", ["diaper", "wipes", "formula", "baby", "lampin"]],
  ["Pet", ["dog food", "cat food", "pet food", "pusa", "aso", "kibble", "pet"]],
];

/** Matched on word boundaries, never as bare substrings — otherwise "shampoo"
 * contains "ham" and lands in Meat, and "rice" contains "ice". */
const SECTION_PATTERNS: [MarketSection, RegExp][] = SECTION_KEYWORDS.map(([section, keywords]) => [
  section,
  new RegExp(`\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i"),
]);

/** Best guess at where an item lives in the market, so a list generated from
 * a meal plan already comes out sorted. Anything unrecognised lands in Other,
 * where it is easy to spot and re-file. */
export function guessSection(name: string): MarketSection {
  for (const [section, pattern] of SECTION_PATTERNS) {
    if (pattern.test(name)) return section;
  }
  return "Other";
}

/** Reads a free-text quantity like "2 kg" or "500g" into its parts, for the
 * meal-plan ingredients that were captured before this was structured. */
export function parseQuantity(text: string | null): { quantity: number | null; unit: string | null } {
  if (!text) return { quantity: null, unit: null };
  const match = text.trim().match(/^([\d.]+)\s*(.*)$/);
  if (!match) return { quantity: null, unit: text.trim() || null };
  const quantity = Number(match[1]);
  const rest = match[2].trim();
  const unit = UNITS.find((u) => u.toLowerCase() === rest.toLowerCase()) ?? (rest || null);
  return { quantity: Number.isFinite(quantity) ? quantity : null, unit };
}

export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null && !unit) return "";
  if (quantity === null) return unit ?? "";
  const amount = Number(quantity);
  const shown = Number.isInteger(amount) ? String(amount) : String(amount);
  return unit ? `${shown} ${unit}` : shown;
}
