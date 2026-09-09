import { test, expect } from "@playwright/test";
import { resolveInstitutionLinks, isKnownInstitutionLabel } from "@/lib/wealth";

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

test("only GCash, BPI and BDO count as known", () => {
  expect(isKnownInstitutionLabel("GCash")).toBe(true);
  expect(isKnownInstitutionLabel("BPI")).toBe(true);
  expect(isKnownInstitutionLabel("BDO")).toBe(true);
  expect(isKnownInstitutionLabel("Maya")).toBe(false);
  expect(isKnownInstitutionLabel("other")).toBe(false);
  expect(isKnownInstitutionLabel("")).toBe(false);
});
