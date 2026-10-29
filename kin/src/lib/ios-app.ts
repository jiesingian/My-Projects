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

/** True when this request comes from the Kin iPhone app. */
export async function inIosApp(): Promise<boolean> {
  return isIosAppUserAgent((await headers()).get("user-agent"));
}
