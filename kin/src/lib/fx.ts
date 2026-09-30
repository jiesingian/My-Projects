
/* Pesos per unit of a foreign currency on a given day, for the remittance log.
 *
 * The source is Frankfurter (api.frankfurter.app): free, no key, and serving
 * the European Central Bank's daily reference rates. Those are not what a
 * remittance centre or GCash pays out -- they are the mid-market rate before
 * anybody's margin -- which is why the log keeps the pesos that actually
 * arrived as its own number, typed by the person, and shows this one only as
 * a reference.
 *
 * The ECB publishes no rate for the Gulf currencies, which is where a great
 * many Filipinos abroad are paid. Five of them are fixed to the US dollar by
 * their central banks and have been for decades, so their peso value is the
 * dollar's rate divided by the peg -- exact, not an estimate on top of an
 * estimate. The Kuwaiti dinar is tied to an undisclosed basket, not the
 * dollar, so it gets no rate at all and the person types the pesos.
 *
 * Cached on the server by Next's data cache. A rate for a day more than a
 * week gone never changes, so it is kept indefinitely; a recent day's may not
 * be published yet (the ECB fixes around 16:00 Frankfurt time, and a Sunday
 * takes Friday's), so it is kept for an hour. */

const FRANKFURTER = "https://api.frankfurter.app";

/** What the ECB publishes against the euro, and so what Frankfurter can
 * convert to pesos directly. */
const ECB_CURRENCIES = new Set([
  "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS",
  "INR", "ISK", "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PLN", "RON", "SEK", "SGD", "THB", "TRY",
  "USD", "ZAR",
]);

/** Units of each Gulf currency per US dollar, fixed by its central bank. */
export const USD_PEGS: Record<string, number> = {
  SAR: 3.75, // Saudi riyal
  AED: 3.6725, // UAE dirham
  QAR: 3.64, // Qatari riyal
  OMR: 0.3845, // Omani rial
  BHD: 0.376, // Bahraini dinar
};

/** The currencies offered in the form, most-sent first, then the rest. The
 * order is where Filipinos abroad actually send from, not the alphabet. */
export const REMITTANCE_CURRENCIES = [
  "USD", "SAR", "AED", "QAR", "KWD", "SGD", "HKD", "JPY", "GBP", "EUR", "CAD", "AUD", "NZD",
  "OMR", "BHD", "KRW", "MYR", "CHF", "NOK", "ILS",
] as const;

export type RateSource = "ecb" | "usd_peg";

export type PesoRate = {
  /** Pesos per one unit of the currency. */
  rate: number;
  /** The day the rate is actually for; a weekend or holiday gives the last
   * working day before it. */
  rateDate: string;
  source: RateSource;
};

async function frankfurter(date: string, from: string): Promise<{ rate: number; date: string } | null> {
  const ageDays = (Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000;
  const cache: RequestInit & { next?: { revalidate: number } } =
    ageDays > 7 ? { cache: "force-cache" } : { next: { revalidate: 3600 } };
  try {
    const res = await fetch(`${FRANKFURTER}/${date}?from=${from}&to=PHP`, { ...cache, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { date?: string; rates?: { PHP?: number } };
    const rate = body.rates?.PHP;
    if (typeof rate !== "number" || !(rate > 0) || typeof body.date !== "string") return null;
    return { rate, date: body.date };
  } catch {
    // Offline, slow, or the service is down. The form still works: the
    // person types what arrived, and the row simply carries no reference.
    return null;
  }
}

/** The reference peso rate for `currency` on `date` (YYYY-MM-DD), or null
 * when there is none -- an unsupported currency, a future date, or the
 * service not answering. Never throws. */
export async function pesoRate(currency: string, date: string): Promise<PesoRate | null> {
  const code = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (code === "PHP") return { rate: 1, rateDate: date, source: "ecb" };
  // The ECB's series starts in 1999; a date after today has no rate yet.
  if (date < "1999-01-04" || date > new Date().toISOString().slice(0, 10)) return null;

  if (ECB_CURRENCIES.has(code)) {
    const r = await frankfurter(date, code);
    return r ? { rate: r.rate, rateDate: r.date, source: "ecb" } : null;
  }
  const peg = USD_PEGS[code];
  if (peg) {
    const usd = await frankfurter(date, "USD");
    return usd ? { rate: usd.rate / peg, rateDate: usd.date, source: "usd_peg" } : null;
  }
  return null;
}
