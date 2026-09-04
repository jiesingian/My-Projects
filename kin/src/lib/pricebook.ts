import { MARKET_SECTIONS, type MarketSection } from "@/lib/grocery";

/** The starter price book.
 *
 * These are typical Metro Manila supermarket prices — the sort of thing a
 * Landers or SM shelf shows — gathered as a sensible starting point, not a
 * live feed. No supermarket publishes prices in a form an app can read, and
 * they move week to week besides. So every figure here is an estimate the
 * family is meant to correct: the moment someone edits one, their number
 * wins and this one is never consulted again for that item.
 *
 * After a few shops the household is pricing from its own book, which beats
 * any national average.
 */
export const PRICE_BOOK_SET_ON = "2026-09";

export type PriceBookEntry = {
  /** Lower-cased name — the key everything matches on. */
  key: string;
  name: string;
  unit: string;
  price: number;
  section: MarketSection;
};

function e(name: string, unit: string, price: number, section: MarketSection): PriceBookEntry {
  return { key: name.toLowerCase(), name, unit, price, section };
}

export const PRICE_BOOK: PriceBookEntry[] = [
  // — Produce —
  e("Kalabasa", "kg", 70, "Produce"),
  e("Sitaw", "bundle", 35, "Produce"),
  e("Talong", "kg", 90, "Produce"),
  e("Okra", "pack", 35, "Produce"),
  e("Pechay", "bundle", 30, "Produce"),
  e("Kangkong", "bundle", 25, "Produce"),
  e("Malunggay", "bundle", 20, "Produce"),
  e("Repolyo", "kg", 110, "Produce"),
  e("Carrots", "kg", 120, "Produce"),
  e("Potato", "kg", 130, "Produce"),
  e("Onion", "kg", 160, "Produce"),
  e("Red onion", "kg", 180, "Produce"),
  e("Garlic", "kg", 200, "Produce"),
  e("Ginger", "kg", 160, "Produce"),
  e("Tomato", "kg", 100, "Produce"),
  e("Siling haba", "pack", 30, "Produce"),
  e("Siling labuyo", "pack", 45, "Produce"),
  e("Bell pepper", "kg", 220, "Produce"),
  e("Sayote", "kg", 70, "Produce"),
  e("Ampalaya", "kg", 120, "Produce"),
  e("Baguio beans", "kg", 160, "Produce"),
  e("Calamansi", "kg", 120, "Produce"),
  e("Banana", "kg", 90, "Produce"),
  e("Mango", "kg", 180, "Produce"),
  e("Papaya", "kg", 80, "Produce"),
  e("Watermelon", "kg", 70, "Produce"),
  e("Apple", "kg", 220, "Produce"),
  e("Orange", "kg", 200, "Produce"),
  e("Lettuce", "pack", 120, "Produce"),
  e("Cucumber", "kg", 90, "Produce"),
  e("Labanos", "kg", 80, "Produce"),

  // — Meat —
  e("Pork belly", "kg", 380, "Meat"),
  e("Pork kasim", "kg", 340, "Meat"),
  e("Pork liempo", "kg", 390, "Meat"),
  e("Ground pork", "kg", 350, "Meat"),
  e("Pork ribs", "kg", 340, "Meat"),
  e("Chicken whole", "kg", 200, "Meat"),
  e("Chicken breast", "kg", 260, "Meat"),
  e("Chicken thigh", "kg", 230, "Meat"),
  e("Chicken wings", "kg", 240, "Meat"),
  e("Beef brisket", "kg", 480, "Meat"),
  e("Beef ground", "kg", 450, "Meat"),
  e("Beef shank", "kg", 460, "Meat"),
  e("Hotdog", "pack", 180, "Meat"),
  e("Tocino", "pack", 160, "Meat"),
  e("Longganisa", "pack", 170, "Meat"),
  e("Bacon", "pack", 220, "Meat"),

  // — Fish & Seafood —
  e("Bangus", "kg", 220, "Fish & Seafood"),
  e("Tilapia", "kg", 180, "Fish & Seafood"),
  e("Galunggong", "kg", 240, "Fish & Seafood"),
  e("Tuna", "kg", 320, "Fish & Seafood"),
  e("Salmon", "kg", 900, "Fish & Seafood"),
  e("Shrimp", "kg", 500, "Fish & Seafood"),
  e("Squid", "kg", 340, "Fish & Seafood"),
  e("Tahong", "kg", 160, "Fish & Seafood"),
  e("Dried fish", "pack", 150, "Fish & Seafood"),

  // — Dairy & Eggs —
  e("Eggs", "tray", 260, "Dairy & Eggs"),
  e("Fresh milk", "L", 130, "Dairy & Eggs"),
  e("Evaporated milk", "can", 45, "Dairy & Eggs"),
  e("Condensed milk", "can", 55, "Dairy & Eggs"),
  e("Powdered milk", "pack", 480, "Dairy & Eggs"),
  e("Cheese", "pack", 130, "Dairy & Eggs"),
  e("Butter", "pack", 160, "Dairy & Eggs"),
  e("Margarine", "tub", 95, "Dairy & Eggs"),
  e("Yogurt", "pack", 45, "Dairy & Eggs"),
  e("All-purpose cream", "pack", 60, "Dairy & Eggs"),

  // — Bakery —
  e("Pandesal", "pack", 60, "Bakery"),
  e("Tasty bread", "loaf", 75, "Bakery"),
  e("Wheat bread", "loaf", 95, "Bakery"),
  e("Ensaymada", "pc", 35, "Bakery"),
  e("Monay", "pack", 55, "Bakery"),

  // — Rice & Grains —
  e("Rice", "kg", 55, "Rice & Grains"),
  e("Rice (premium)", "kg", 68, "Rice & Grains"),
  e("Malagkit", "kg", 75, "Rice & Grains"),
  e("Oatmeal", "pack", 180, "Rice & Grains"),
  e("Pancit canton", "pack", 25, "Rice & Grains"),
  e("Bihon", "pack", 45, "Rice & Grains"),
  e("Spaghetti pasta", "pack", 75, "Rice & Grains"),
  e("Flour", "kg", 75, "Rice & Grains"),
  e("Cornstarch", "pack", 40, "Rice & Grains"),
  e("Monggo", "kg", 120, "Rice & Grains"),

  // — Canned & Packaged —
  e("Corned beef", "can", 85, "Canned & Packaged"),
  e("Sardines", "can", 32, "Canned & Packaged"),
  e("Canned tuna", "can", 45, "Canned & Packaged"),
  e("Luncheon meat", "can", 110, "Canned & Packaged"),
  e("Tomato sauce", "pack", 35, "Canned & Packaged"),
  e("Tomato paste", "pack", 30, "Canned & Packaged"),
  e("Coconut milk", "can", 45, "Canned & Packaged"),
  e("Pork and beans", "can", 40, "Canned & Packaged"),
  e("Instant noodles", "pack", 15, "Canned & Packaged"),
  e("Sinigang mix", "pack", 25, "Canned & Packaged"),
  e("Kare-kare mix", "pack", 35, "Canned & Packaged"),
  e("Caldereta mix", "pack", 35, "Canned & Packaged"),
  e("Mayonnaise", "jar", 180, "Canned & Packaged"),
  e("Liver spread", "can", 40, "Canned & Packaged"),

  // — Condiments & Spices —
  e("Soy sauce", "bottle", 60, "Condiments & Spices"),
  e("Vinegar", "bottle", 45, "Condiments & Spices"),
  e("Fish sauce", "bottle", 65, "Condiments & Spices"),
  e("Oyster sauce", "bottle", 90, "Condiments & Spices"),
  e("Cooking oil", "L", 120, "Condiments & Spices"),
  e("Salt", "pack", 25, "Condiments & Spices"),
  e("Sugar", "kg", 90, "Condiments & Spices"),
  e("Brown sugar", "kg", 95, "Condiments & Spices"),
  e("Black pepper", "pack", 45, "Condiments & Spices"),
  e("Bay leaf", "pack", 30, "Condiments & Spices"),
  e("Banana ketchup", "bottle", 65, "Condiments & Spices"),
  e("Peanut butter", "jar", 150, "Condiments & Spices"),
  e("Bagoong", "jar", 85, "Condiments & Spices"),
  e("Shrimp paste", "jar", 80, "Condiments & Spices"),
  e("Annatto powder", "pack", 20, "Condiments & Spices"),

  // — Snacks —
  e("Biscuits", "pack", 60, "Snacks"),
  e("Crackers", "pack", 55, "Snacks"),
  e("Chips", "pack", 55, "Snacks"),
  e("Chocolate", "pack", 90, "Snacks"),
  e("Candy", "pack", 45, "Snacks"),
  e("Nuts", "pack", 120, "Snacks"),

  // — Beverages —
  e("Coffee", "pack", 180, "Beverages"),
  e("3-in-1 coffee", "pack", 130, "Beverages"),
  e("Tea", "box", 90, "Beverages"),
  e("Juice", "L", 95, "Beverages"),
  e("Softdrinks", "L", 75, "Beverages"),
  e("Bottled water", "L", 30, "Beverages"),
  e("Powdered juice", "pack", 15, "Beverages"),

  // — Frozen —
  e("Frozen vegetables", "pack", 110, "Frozen"),
  e("Ice cream", "tub", 190, "Frozen"),
  e("Frozen fries", "pack", 160, "Frozen"),
  e("Nuggets", "pack", 200, "Frozen"),
  e("Siomai", "pack", 180, "Frozen"),
  e("Lumpia wrapper", "pack", 65, "Frozen"),

  // — Household —
  e("Dishwashing liquid", "bottle", 110, "Household"),
  e("Laundry detergent", "pack", 190, "Household"),
  e("Fabric conditioner", "pack", 150, "Household"),
  e("Bleach", "bottle", 75, "Household"),
  e("Toilet paper", "pack", 180, "Household"),
  e("Paper towel", "pack", 90, "Household"),
  e("Trash bags", "pack", 95, "Household"),
  e("Dish sponge", "pack", 45, "Household"),
  e("Alcohol", "bottle", 95, "Household"),
  e("Insect spray", "can", 220, "Household"),
  e("LPG refill", "tank", 950, "Household"),

  // — Personal Care —
  e("Shampoo", "bottle", 180, "Personal Care"),
  e("Conditioner", "bottle", 180, "Personal Care"),
  e("Soap", "pack", 90, "Personal Care"),
  e("Toothpaste", "tube", 130, "Personal Care"),
  e("Toothbrush", "pc", 80, "Personal Care"),
  e("Deodorant", "pc", 140, "Personal Care"),
  e("Tissue", "pack", 60, "Personal Care"),
  e("Sanitary pads", "pack", 120, "Personal Care"),
  e("Razor", "pack", 150, "Personal Care"),

  // — Baby —
  e("Diapers", "pack", 480, "Baby"),
  e("Baby wipes", "pack", 130, "Baby"),
  e("Infant formula", "pack", 900, "Baby"),
  e("Baby soap", "pc", 130, "Baby"),

  // — Pet —
  e("Dog food", "kg", 250, "Pet"),
  e("Cat food", "kg", 280, "Pet"),
  e("Cat litter", "pack", 320, "Pet"),
];

const BY_KEY = new Map(PRICE_BOOK.map((entry) => [entry.key, entry]));

export function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function pricebookEntry(name: string): PriceBookEntry | undefined {
  return BY_KEY.get(normalizeKey(name));
}

/** What one of something costs: the family's own figure when they have set
 * one, otherwise the shipped estimate, otherwise nothing — an unknown price
 * is left blank rather than guessed at zero, which would quietly understate
 * a total. */
export type PriceSource = "family" | "starter" | "unknown";

export function resolveUnitPrice(
  name: string,
  familyPrices: Map<string, { unit_price: number; unit: string }>,
): { price: number | null; unit: string | null; source: PriceSource } {
  const key = normalizeKey(name);
  const mine = familyPrices.get(key);
  if (mine) return { price: Number(mine.unit_price), unit: mine.unit, source: "family" };
  const shipped = BY_KEY.get(key);
  if (shipped) return { price: shipped.price, unit: shipped.unit, source: "starter" };
  return { price: null, unit: null, source: "unknown" };
}

/** The book in shopping order — the way the aisles come — then alphabetical
 * inside each section, so an item is found where it would be found. */
export function sortForShopping<T extends { section: string; name: string }>(rows: T[]): T[] {
  const order = new Map(MARKET_SECTIONS.map((s, i) => [s, i]));
  return [...rows].sort((a, b) => {
    const bySection = (order.get(a.section as MarketSection) ?? 99) - (order.get(b.section as MarketSection) ?? 99);
    if (bySection !== 0) return bySection;
    return a.name.localeCompare(b.name);
  });
}
