/** Address and place search, from OpenStreetMap's Nominatim.
 *
 * Free and keyless, on the condition of its usage policy
 * (operations.osmfoundation.org/policies/nominatim): at most one request a
 * second, an honest User-Agent, and results cached rather than asked for
 * again. So the browser never calls it. Kin's own route (api/places) does,
 * after a pause in typing, one request at a time, with each answer cached for
 * a day. The same search from two members is one request.
 *
 * Nominatim bounds its search to the Philippines' box by preference, not by
 * rule: a lola in Cebu comes first, and a tita in Dubai can still be found.
 */

export type Place = {
  /** One line, as it goes in a location field. */
  label: string;
  street: string;
  barangay: string;
  city: string;
  province: string;
  zipCode: string;
  country: string;
};

type NominatimAddress = Record<string, string | undefined>;
type NominatimResult = { display_name?: string; name?: string; address?: NominatimAddress };

/** Roughly the Philippines, west-north-east-south. */
export const PH_VIEWBOX = "116.9,21.2,126.7,4.5";

export const MIN_QUERY = 3;
export const MAX_QUERY = 120;

/** A query worth sending, or null: trimmed, spaces collapsed, lower-cased so
 * "SM Megamall" and "sm megamall" share one cache entry. */
export function normalizeQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (q.length < MIN_QUERY || q.length > MAX_QUERY) return null;
  return q;
}

export function nominatimUrl(q: string, limit = 5): string {
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    viewbox: PH_VIEWBOX,
    bounded: "0",
    "accept-language": "en",
  });
  return `https://nominatim.openstreetmap.org/search?${params}`;
}

const first = (a: NominatimAddress, keys: string[]) => keys.map((k) => a[k]).find((v) => v && v.trim()) ?? "";

/** Nominatim's answer as Kin's places. Its address keys follow OpenStreetMap's
 * admin levels, which in the Philippines put a barangay under quarter, village
 * or suburb, and a province under state. The one-line label drops the region
 * and the country when it is the Philippines: "SM Megamall, Ortigas Center,
 * Mandaluyong", not the eight-part display name. */
export function parseNominatim(json: unknown): Place[] {
  if (!Array.isArray(json)) return [];
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const r of json as NominatimResult[]) {
    const a = r.address ?? {};
    const road = first(a, ["road", "pedestrian", "footway"]);
    const street = [a.house_number, road].filter(Boolean).join(" ");
    const barangay = first(a, ["quarter", "village", "suburb", "neighbourhood", "hamlet"]);
    const city = first(a, ["city", "town", "municipality"]);
    const province = first(a, ["province", "state", "county"]);
    const country = a.country ?? "";
    const name = r.name && r.name !== road && r.name !== city ? r.name : "";
    const parts = [name, street, barangay, city, country === "Philippines" ? province : "", country === "Philippines" ? "" : country].filter(Boolean);
    const label = (parts.length ? [...new Set(parts)].join(", ") : r.display_name ?? "").slice(0, 200);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, street, barangay, city, province, zipCode: a.postcode ?? "", country });
  }
  return out;
}
