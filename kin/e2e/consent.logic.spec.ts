import { test, expect } from "@playwright/test";
import { AD_TRACKING_ON } from "@/lib/legal";
import { CONSENT_KEY, bannerShown, isPublicPage, mayLoadAdTracking, parseConsent } from "@/lib/consent";

/** The ad stage's consent (21 October): built switched off. No browser, no
 * network: the rules the banner and any future measurement script follow. */

test("the ad stage is off unless NEXT_PUBLIC_AD_TRACKING is 'on'", () => {
  expect(process.env.NEXT_PUBLIC_AD_TRACKING === "on").toBe(AD_TRACKING_ON);
  // CI and every machine build without it: nothing shows, nothing loads.
  if (!process.env.NEXT_PUBLIC_AD_TRACKING) expect(AD_TRACKING_ON).toBe(false);
});

test("switched off, there is no banner and nothing may load, whatever was stored", () => {
  for (const stored of [null, "accepted", "declined"] as const) {
    expect(bannerShown(false, stored)).toBe(false);
    expect(mayLoadAdTracking(false, stored)).toBe(false);
  }
});

test("switched on, the banner asks once; only Accept lets measurement load", () => {
  expect(bannerShown(true, null)).toBe(true);
  expect(bannerShown(true, "accepted")).toBe(false);
  expect(bannerShown(true, "declined")).toBe(false);
  expect(mayLoadAdTracking(true, null)).toBe(false);
  expect(mayLoadAdTracking(true, "declined")).toBe(false);
  expect(mayLoadAdTracking(true, "accepted")).toBe(true);
});

test("only an answer the banner wrote counts; anything else asks again", () => {
  expect(CONSENT_KEY).toBe("kin-ad-consent");
  expect(parseConsent("accepted")).toBe("accepted");
  expect(parseConsent("declined")).toBe("declined");
  expect(parseConsent("yes")).toBeNull();
  expect(parseConsent("")).toBeNull();
  expect(parseConsent(null)).toBeNull();
  expect(parseConsent(undefined)).toBeNull();
});

test("only the public pages ask, never the app", () => {
  expect(isPublicPage("/")).toBe(true);
  expect(isPublicPage("/features/paluwagan")).toBe(true);
  for (const p of ["/today", "/login", "/settings/account", "/legal/privacy", "/guest/abc", "/featuresx"]) expect(isPublicPage(p)).toBe(false);
});
