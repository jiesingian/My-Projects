import { test, expect } from "@playwright/test";
import { IOS_APP_UA, isIosAppUserAgent } from "@/lib/ios-app";

/** The iPhone app is told apart by the token its web view adds to the user
 * agent (kin/native/capacitor.config.json, ios.appendUserAgent). Inside it,
 * Kin shows no prices, plan links or Kin codes (App Review 3.1.1). */

test("the iPhone app's web view is recognised", () => {
  // WKWebView's own user agent, then Capacitor's "<app name> <appended>".
  const app = `Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ${IOS_APP_UA}`;
  expect(isIosAppUserAgent(app)).toBe(true);
});

test("Safari, the installed web app and Android are not the iPhone app", () => {
  expect(isIosAppUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1")).toBe(false);
  expect(isIosAppUserAgent("Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36")).toBe(false);
  expect(isIosAppUserAgent(null)).toBe(false);
  expect(isIosAppUserAgent("")).toBe(false);
});
