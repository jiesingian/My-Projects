/** Where a household is, for the one thing that currently depends on it:
 * which App Store region a GET APP search falls back to (@/lib/wealth's
 * appStoreSearchUrl). Not tied to the phone's current location -- a
 * household set this once, the same way currency is set once, and it
 * doesn't change just because someone opened Kin while traveling.
 *
 * Deliberately short, the same reasoning KNOWN_APPS uses: a country this
 * list doesn't cover isn't broken, just untuned -- appStoreSearchUrl falls
 * back to a sane default region rather than refusing to work. Add to this
 * list as households actually need it, not speculatively ahead of them. */
export const COUNTRIES = [
  { code: "ph", label: "Philippines" },
  { code: "us", label: "United States" },
  { code: "ca", label: "Canada" },
  { code: "gb", label: "United Kingdom" },
  { code: "au", label: "Australia" },
  { code: "sg", label: "Singapore" },
  { code: "ae", label: "United Arab Emirates" },
  { code: "sa", label: "Saudi Arabia" },
  { code: "qa", label: "Qatar" },
  { code: "hk", label: "Hong Kong" },
  { code: "jp", label: "Japan" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

export const DEFAULT_COUNTRY: CountryCode = "ph";

export function isCountryCode(value: string): value is CountryCode {
  return COUNTRIES.some((c) => c.code === value);
}

export function countryLabel(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.label ?? code;
}
