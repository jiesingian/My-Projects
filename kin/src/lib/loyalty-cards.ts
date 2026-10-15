/** Suki and loyalty cards at checkout: which of the household's cards to put
 * in front of the cashier. The shopping day's title is where the store is
 * written ("SM run", "Puregold", "Palengke"), so the cards are matched
 * against it; when it names no store of theirs -- or there is no shopping
 * day -- every card shows. */

export type LoyaltyCard = {
  id: string;
  store: string;
  card_name: string;
  card_number: string;
  code_format: "qr" | "none";
  note: string | null;
};

/** Words that say what kind of place it is, not which one: "SM Supermarket"
 * and "SM Hypermarket" are both SM, and "Grocery run" names no store. */
const PLACE_WORDS = new Set([
  "the",
  "and",
  "at",
  "of",
  "run",
  "trip",
  "shopping",
  "grocery",
  "groceries",
  "supermarket",
  "hypermarket",
  "market",
  "mall",
  "store",
  "shop",
  "branch",
  "inc",
  "co",
  "card",
  "rewards",
  "perks",
  "membership",
  "advantage",
]);

/** Lower-cased words, accents dropped, and "S&R" or "Robinson's" kept as one
 * word ("sr", "robinsons") so they match however they were typed. */
export function storeWords(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\w)[&'’.](?=\w)/g, "$1")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function significant(words: string[]): string[] {
  return words.filter((w) => !PLACE_WORDS.has(w));
}

/** Does this card belong to the store the trip names? Either every word
 * that names the card's store is in the trip ("SM Supermarket" for "SM
 * run"), or every word that names the trip's store is in the card's
 * ("Puregold" for "Puregold Price Club"; "Palengke" for "Aling Nena,
 * palengke"). A trip that names no store matches nothing. */
export function cardFitsTrip(store: string, tripTitle: string): boolean {
  const trip = storeWords(tripTitle);
  const tripKey = significant(trip);
  if (tripKey.length === 0) return false;
  const card = storeWords(store);
  const cardKey = significant(card);
  if (cardKey.length > 0 && cardKey.every((w) => trip.includes(w))) return true;
  return tripKey.every((w) => card.includes(w));
}

/** The cards to show at the counter: the trip's store's, if any of the
 * household's cards are for it, otherwise all of them. `others` is the rest,
 * one tap away for the mall where the cashier takes either. Each list keeps
 * the order it was given in. */
export function cardsForCheckout<C extends { store: string }>(
  cards: C[],
  tripTitle: string | null | undefined,
): { shown: C[]; others: C[]; matched: boolean } {
  const fits = tripTitle ? cards.filter((c) => cardFitsTrip(c.store, tripTitle)) : [];
  if (fits.length === 0) return { shown: cards, others: [], matched: false };
  return { shown: fits, others: cards.filter((c) => !fits.includes(c)), matched: true };
}

/** A card number as typed ("8000-1234 5678") made into what the code
 * carries: spaces and dashes are how people copy it, not part of it. */
export function scanValue(cardNumber: string): string {
  const trimmed = cardNumber.trim();
  return /^[\d\s-]+$/.test(trimmed) ? trimmed.replace(/[\s-]/g, "") : trimmed;
}
