import { headers } from "next/headers";

/** The Kin iPhone app (kin/native) adds this to its web view's user agent
 * (capacitor.config.json, ios.appendUserAgent), so the server knows a page
 * is for the app before anything is drawn.
 *
 * Why it matters: Kin Plus is sold outside Apple's in-app purchase, so
 * inside the iPhone app Kin shows no prices, no "See plans" links and no
 * Kin code boxes (App Review 3.1.1 and 3.1.3: outside the US storefront an
 * app may not point people to another way to buy, and may not unlock
 * features with its own codes). The household's plan still works in the
 * app, and a browser sees everything as before. The root layout puts
 * `data-ios-app` on <html>, and globals.css hides `.kin-web-only` and shows
 * `.kin-ios-only` under it, for the places a component can't ask. */
export const IOS_APP_UA = "KinApp/iOS";

export function isIosAppUserAgent(ua: string | null | undefined): boolean {
  return Boolean(ua && ua.includes(IOS_APP_UA));
}

/** The Kin Android app's mark (capacitor.config.json, android.appendUserAgent).
 * Google Play's rule is the same as Apple's here: no price, buy link, code or
 * reward for Kin Plus inside an app it distributes, and the Philippines has
 * no alternative-billing programme (kin/native/android/store/POLICY.md). */
export const ANDROID_APP_UA = "KinApp/Android";

export function isAndroidAppUserAgent(ua: string | null | undefined): boolean {
  return Boolean(ua && ua.includes(ANDROID_APP_UA));
}

/** Either store app, iPhone or Android: every Kin Plus purchase path is left
 * out of both, so the layout's `data-ios-app` (and the pages that ask) mean
 * "a store app", not only the iPhone. */
export function isStoreAppUserAgent(ua: string | null | undefined): boolean {
  return isIosAppUserAgent(ua) || isAndroidAppUserAgent(ua);
}

export async function inStoreApp(): Promise<boolean> {
  return isStoreAppUserAgent((await headers()).get("user-agent"));
}
