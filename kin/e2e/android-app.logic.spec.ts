import { test, expect } from "@playwright/test";
import { ANDROID_APP_UA, isAndroidAppUserAgent } from "@/lib/native";
import { featurePlanLine } from "@/lib/feature-pages";

/** The Kin Android app shows no Kin Plus price (Google Play's billing rule,
 * kin/native/android/store/POLICY.md): how it is recognised, and the words
 * it gets instead. */

const androidWebView = "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36";

test("the Android app is told apart by its own mark, not by Android", () => {
  expect(isAndroidAppUserAgent(`${androidWebView} ${ANDROID_APP_UA}`)).toBe(true);
  // Chrome on an Android phone is the website: prices as usual.
  expect(isAndroidAppUserAgent(androidWebView)).toBe(false);
  expect(isAndroidAppUserAgent(null)).toBe(false);
  expect(isAndroidAppUserAgent("")).toBe(false);
});

test("a feature page's Plus line leaves the price out in the Android app", () => {
  expect(featurePlanLine("plus")).toContain("₱");
  const line = featurePlanLine("plus", { prices: false });
  expect(line).not.toMatch(/₱|a month|a year/);
  expect(line).toContain("Part of Kin Plus, for the whole family.");
  expect(featurePlanLine("free", { prices: false })).toBe(featurePlanLine("free"));
});
