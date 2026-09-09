import { test, expect } from "@playwright/test";
import { resolveInstitutionLinks, isKnownInstitutionLabel, KNOWN_APPS, appStoreSearchUrl, playStoreSearchUrl } from "@/lib/wealth";

/** What BANK / WALLET should do to LINK APP / APP STORE LINK / PLAY STORE
 * LINK as it changes, pulled out of AppLinksField so it can be checked
 * without a browser or a login.
 *
 * Reported directly, with a screenshot: pick BDO, its App Store link fills
 * LINK APP and both store fields as designed -- then switch BANK / WALLET
 * to Other, and all three fields kept showing BDO's links, now sitting
 * under an institution with no name of its own. `selectInstitution` only
 * ever wrote new values in when landing ON a known app; leaving one behind
 * cleared nothing. This file exists so that gap can't reopen unnoticed.
 */

test("picking a known app resolves its links for the current phone", () => {
  expect(resolveInstitutionLinks("GCash", "", "ios")).toEqual({
    appUrl: "gcash://",
    appStoreUrl: "",
    playStoreUrl: "",
  });
  // BPI has no scheme of its own -- LINK APP becomes whichever store
  // matches the phone filling the form in, not a blank field.
  expect(resolveInstitutionLinks("BPI", "", "ios")?.appUrl).toContain("apps.apple.com");
  expect(resolveInstitutionLinks("BPI", "", "android")?.appUrl).toContain("play.google.com");
  // On a computer, where neither store is "the" phone, App Store wins --
  // matching the same default order AppLinksField uses for the two store
  // fields when neither is labelled "your phone".
  expect(resolveInstitutionLinks("BPI", "", "other")?.appUrl).toContain("apps.apple.com");
});

test("leaving a known app for Other clears what it resolved", () => {
  // The exact sequence from the report: BDO resolves all three fields,
  // then Other must not leave BDO's links behind for an institution that
  // has not even been named yet.
  const resolved = resolveInstitutionLinks("BDO", "", "ios");
  expect(resolved?.appUrl).toContain("bdo");
  expect(resolveInstitutionLinks("other", "BDO", "ios")).toEqual({ appUrl: "", appStoreUrl: "", playStoreUrl: "" });
  expect(resolveInstitutionLinks("", "BDO", "ios")).toEqual({ appUrl: "", appStoreUrl: "", playStoreUrl: "" });
});

test("leaving Other or blank, without ever having picked a known app, changes nothing", () => {
  // Someone may have hand-typed a scheme or a store link under Other --
  // clicking the dropdown around them (Other -> blank, blank -> Other)
  // must not erase what they typed, since neither end of that move was
  // ever a known app's own resolved data.
  expect(resolveInstitutionLinks("other", "", "ios")).toBeNull();
  expect(resolveInstitutionLinks("", "other", "ios")).toBeNull();
});

test("every entry in KNOWN_APPS counts as known, and nothing else does", () => {
  for (const app of KNOWN_APPS) {
    expect(isKnownInstitutionLabel(app.label)).toBe(true);
  }
  expect(isKnownInstitutionLabel("PalawanPay")).toBe(false);
  expect(isKnownInstitutionLabel("other")).toBe(false);
  expect(isKnownInstitutionLabel("")).toBe(false);
});

test("every known app resolves to at least one working link, on every phone kind", () => {
  // The one invariant every entry in KNOWN_APPS must satisfy: whichever
  // phone is filling the form in, LINK APP ends up with *something* --
  // either the app's own scheme, or, for the banks with none, the store
  // page for that phone. A KNOWN_APPS entry with neither an appUrl nor
  // both store links would resolve to an empty LINK APP, silently.
  for (const app of KNOWN_APPS) {
    for (const kind of ["ios", "android", "other"] as const) {
      const resolved = resolveInstitutionLinks(app.label, "", kind);
      expect(resolved?.appUrl.trim(), `${app.label} on ${kind}`).not.toBe("");
    }
  }
});

test("a known app's App Store and Play Store links are both real, distinct URLs", () => {
  // Catches a copy-paste slip -- the same URL in both fields, or a field
  // that looks like a URL but points at the wrong store -- for every bank
  // that publishes on both stores (GCash has neither, by design).
  for (const app of KNOWN_APPS.filter((a) => a.label !== "GCash")) {
    expect(app.appStoreUrl, app.label).toMatch(/^https:\/\/apps\.apple\.com\//);
    expect(app.playStoreUrl, app.label).toMatch(/^https:\/\/play\.google\.com\//);
    expect(app.appStoreUrl).not.toBe(app.playStoreUrl);
  }
});

test("the search fallback works for any institution name, unverified or not", () => {
  // GET APP's fallback for a bank Kin has no listing for -- so it has to
  // hold up for a name Kin has never seen, not just the ones already in
  // KNOWN_APPS. Both URL formats are each store's own documented web
  // search page.
  expect(appStoreSearchUrl("Some Bank")).toBe("https://apps.apple.com/us/search?term=Some%20Bank");
  expect(playStoreSearchUrl("Some Bank")).toBe("https://play.google.com/store/search?q=Some%20Bank&c=apps");
  // A name with characters that are meaningful in a URL (&, /, #) must not
  // break the query string or point somewhere else entirely.
  expect(appStoreSearchUrl("Tom & Jerry Bank / Trust")).toContain(encodeURIComponent("Tom & Jerry Bank / Trust"));
  expect(playStoreSearchUrl("Tom & Jerry Bank / Trust")).toContain(encodeURIComponent("Tom & Jerry Bank / Trust"));
});

test("the App Store search uses the household's own country, not a fixed one", () => {
  // families.country, set once in Settings or onboarding -- never the
  // phone's current location. Unset households still get a working link.
  expect(appStoreSearchUrl("Some Bank", "sg")).toBe("https://apps.apple.com/sg/search?term=Some%20Bank");
  expect(appStoreSearchUrl("Some Bank", null)).toBe("https://apps.apple.com/us/search?term=Some%20Bank");
  expect(appStoreSearchUrl("Some Bank")).toBe("https://apps.apple.com/us/search?term=Some%20Bank");
});
