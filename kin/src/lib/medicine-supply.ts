/** Pills left and refill (20261014201000_medicine_supply.sql): the sums and
 * the words, kept free of the database so they can be tested on their own
 * (e2e/medicine-supply.logic.spec.ts).
 *
 * Nothing is counted down (KNOWN_RISKS.md, goals.current_amount). What is
 * kept is a count and when it was counted; what is on hand is worked out
 * from the doses ticked Taken since then -- those due at or after the
 * count, in the household's zone, and ticked after it (a dose ticked early
 * was already out of the box when it was counted). medicine_on_hand() in
 * the database does
 * that count; these turn its answer into days and words for the card. */

export const SUPPLY_UNITS = ["tablet", "capsule", "ml"] as const;
export type SupplyUnit = (typeof SUPPLY_UNITS)[number];

export function isSupplyUnit(u: string): u is SupplyUnit {
  return (SUPPLY_UNITS as readonly string[]).includes(u);
}

/** Days left at or under which the medicine goes on the list. */
export const REFILL_AT_DAYS = 7;

/** What is on hand: the count less what was taken since. Can go below zero
 * when ticks outrun the count; the words below say "Ran out" then. */
export function onHand(counted: number, perDose: number, takenSince: number): number {
  return counted - perDose * takenSince;
}

/** How many days what is on hand lasts, at the medicine's schedule. Null for
 * a medicine taken as needed: there is no rate to divide by. */
export function daysLeft(onHandNow: number, perDose: number, dosesPerDay: number): number | null {
  if (dosesPerDay <= 0 || perDose <= 0) return null;
  return Math.max(0, onHandNow) / (perDose * dosesPerDay);
}

/** "About 6 days left", "About 1 day left", "Runs out today", "Ran out";
 * null for a medicine without a schedule. */
export function daysLeftWords(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 0) return "Ran out";
  if (days < 1) return "Runs out today";
  const whole = Math.floor(days);
  return `About ${whole} day${whole === 1 ? "" : "s"} left`;
}

/** Is it time to put it on the list? */
export function needsRefill(days: number | null): boolean {
  return days !== null && days <= REFILL_AT_DAYS;
}

/** "12 tablets", "1 capsule", "45 ml", with no trailing ".0". */
export function amountWords(n: number, unit: SupplyUnit): string {
  const shown = Math.max(0, Math.round(n * 10) / 10);
  if (unit === "ml") return `${shown} ml`;
  return `${shown} ${unit}${shown === 1 ? "" : "s"}`;
}

/** A first guess from the medicine's dose as typed ("5 ml", "2 tablets",
 * "1 cap"): the unit and how many go per dose. Anything else is 1 tablet;
 * the form shows the guess, so a person can change it. */
export function guessFromDose(dose: string | null): { unit: SupplyUnit; perDose: number } {
  const text = (dose ?? "").toLowerCase();
  const unit: SupplyUnit = /\bml\b|\bmilliliter|\bmillilitre/.test(text) ? "ml" : /\bcap(sule)?s?\b/.test(text) ? "capsule" : "tablet";
  // Only a number followed by a count unit is taken: "500 mg" is a strength,
  // not how many, so "500 mg, 2 tabs" is 2.
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|tabs?|tablets?|caps?|capsules?|pcs?|pieces?)\b/);
  const perDose = m ? Number(m[1].replace(",", ".")) : 1;
  return { unit, perDose: perDose > 0 && perDose <= 1000 ? perDose : 1 };
}

/** The most a store's name can be (health_medicine_supply.store). */
export const STORE_MAX = 60;

/** What the household's helper reads on the To-Buy list for a refill line
 * Kin added (20261020160000, helper_buy_items): "Medicine refill", with the
 * store it is usually bought at when the family has said one. The medicine
 * is named to the helper only when a grown-up ticked "show the name" for
 * it. The database writes the same words; this is the card's preview. */
export function helperRefillLine(store: string | null | undefined, showName: boolean, name: string): string {
  if (showName) return name;
  const shop = (store ?? "").trim();
  return shop ? `Medicine refill · ${shop}` : "Medicine refill";
}
