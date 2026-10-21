/** Consent for advertising measurement on the public pages (21 October).
 * Stored per browser, in localStorage, never on a server: the choice is the
 * browser's, and a person who never signs up leaves nothing behind. Pure
 * rules here; components/consent-banner.tsx reads and writes the storage. */

export const CONSENT_KEY = "kin-ad-consent";

export type Consent = "accepted" | "declined" | null;

/** What the browser has stored, or null for "not asked yet" (anything else
 * stored is treated as not asked, so the question comes back). */
export function parseConsent(stored: string | null | undefined): Consent {
  return stored === "accepted" || stored === "declined" ? stored : null;
}

/** The banner shows only when the ad stage is switched on and this browser
 * hasn't answered. */
export function bannerShown(flagOn: boolean, consent: Consent): boolean {
  return flagOn && consent === null;
}

/** Whether a measurement script may load: only when switched on and the
 * person said yes. Declined, or not asked yet, means nothing loads. */
export function mayLoadAdTracking(flagOn: boolean, consent: Consent): boolean {
  return flagOn && consent === "accepted";
}

/** Only the public pages ask: the home page and the feature pages. The app
 * itself never shows the banner and never loads ad measurement. */
export function isPublicPage(pathname: string): boolean {
  return pathname === "/" || pathname === "/features" || pathname.startsWith("/features/");
}
