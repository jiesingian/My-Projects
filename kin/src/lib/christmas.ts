import { RECIPES_BY_KEY } from "@/lib/recipes";

/** Christmas on Today (20261020212000_christmas_on_today.sql): from 1
 * December to 1 January in the household's own zone, Today starts with a
 * countdown to Noche Buena, a ready Noche Buena meal plan, the gift list
 * and the monito-monita. Pure: the caller passes `familyDay(new Date(),
 * tz)`, and the tests pass what they like. */

/** The season: 1 December through 1 January (switches itself off on 2 January). */
export function isChristmasSeason(todayISO: string): boolean {
  const md = todayISO.slice(5, 10);
  return md >= "12-01" || md === "01-01";
}

/** The Noche Buena that this season is counting to: 24 December of the
 * season's year, which on 1 January is the one just gone. */
export function nocheBuenaDate(todayISO: string): string {
  const year = Number(todayISO.slice(0, 4)) - (todayISO.slice(5, 10) === "01-01" ? 1 : 0);
  return `${year}-12-24`;
}

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const sleeps = (n: number) => `${n} ${n === 1 ? "sleep" : "sleeps"}`;

export type CountdownLine = { title: string; meta: string };

/** What the top of Today says, each day of the season. Null outside it. */
export function christmasCountdown(todayISO: string): CountdownLine | null {
  if (!isChristmasSeason(todayISO)) return null;
  const md = todayISO.slice(5, 10);
  if (md === "01-01") return { title: "Manigong Bagong Taon!", meta: "A new year, the whole family in it" };
  const toNocheBuena = Math.round((day(nocheBuenaDate(todayISO)) - day(todayISO)) / 86_400_000);
  if (toNocheBuena > 0) return { title: `${sleeps(toNocheBuena)} to Noche Buena`, meta: "24 December, the family table at midnight" };
  if (toNocheBuena === 0) return { title: "Noche Buena tonight!", meta: "The table at midnight, everyone home" };
  if (md === "12-25") return { title: "Maligayang Pasko!", meta: "Merry Christmas from Kin" };
  const toMediaNoche = Math.round((day(`${todayISO.slice(0, 4)}-12-31`) - day(todayISO)) / 86_400_000);
  if (toMediaNoche > 0) return { title: `${sleeps(toMediaNoche)} to Media Noche`, meta: "31 December, round fruits on the table" };
  return { title: "Media Noche tonight!", meta: "Twelve round fruits, and the noise at midnight" };
}

/** The ready Noche Buena plan: the dishes a Filipino table starts from,
 * each a recipe in the library so the meal plan can put their ingredients
 * on the To-Buy list. Editable: untick any, add more from Meals after. */
export const NOCHE_BUENA_DISHES = ["hamon", "queso-de-bola", "spaghetti", "fruit-salad", "lumpiang-shanghai"] as const;

export type NocheBuenaDish = { key: string; name: string; serves: number; ingredients: number };

export function nocheBuenaDishes(): NocheBuenaDish[] {
  return NOCHE_BUENA_DISHES.map((key) => {
    const r = RECIPES_BY_KEY.get(key);
    return { key, name: r?.name ?? key, serves: r?.serves ?? 0, ingredients: r?.ingredients.length ?? 0 };
  });
}

/** Which of the chosen dishes still need adding to the 24 December dinner:
 * those not already planned there (by recipe key, or by name for a dish
 * typed by hand). Running it twice adds nothing the second time. */
export function nocheBuenaToAdd(chosen: readonly string[], planned: { recipe_key: string | null; dish: string }[]): string[] {
  const keys = new Set(planned.map((p) => p.recipe_key).filter((k): k is string => !!k));
  const names = new Set(planned.map((p) => p.dish.trim().toLowerCase()));
  return chosen.filter((key) => {
    if (!RECIPES_BY_KEY.has(key) || keys.has(key)) return false;
    const name = RECIPES_BY_KEY.get(key)!.name.trim().toLowerCase();
    return !names.has(name);
  });
}

/** "Hamon, queso de bola and 3 more" for the planned-already line. */
export function dishesLine(dishes: string[]): string {
  if (dishes.length === 0) return "Nothing planned yet";
  if (dishes.length <= 3) return dishes.join(", ");
  return `${dishes.slice(0, 2).join(", ")} and ${dishes.length - 2} more`;
}

/** The gift list's one line on Today: "3 of 5 done · ₱4,500 of ₱6,000". */
export function giftListLine(t: { people: number; done: number; bought: number; budget: number }, money: (n: number) => string): string {
  if (t.people === 0) return "A budget for each person and inaanak, ticked when bought";
  const spend = t.budget > 0 ? ` · ${money(t.bought)} of ${money(t.budget)}` : t.bought > 0 ? ` · ${money(t.bought)} bought` : "";
  return `${t.done} of ${t.people} done${spend}`;
}
