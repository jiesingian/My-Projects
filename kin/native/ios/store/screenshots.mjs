// The App Store screenshots, made from the web app as the iPhone app shows it.
//
// App Store Connect asks for one iPhone set (29 October 2026, "Screenshot
// specifications"): "iPhone with Dynamic Island (medium display)", and a
// large-display set unless the medium one is scaled. Kin gives both:
//   6.9-inch: 440 x 956 points at 3x = 1320 x 2868 pixels
//   6.3-inch: 402 x 874 points at 3x = 1206 x 2622 pixels
// iPad needs none: the app is iPhone only (TARGETED_DEVICE_FAMILY = 1).
//
// Only ever as the throwaway QA household on dev (kin/docs/QA_HOUSEHOLDS.md):
// it refuses production, and refuses an account that is not E2E_EMAIL's
// example.com address. It only reads: it opens pages and takes pictures.
// The user agent carries "KinApp/iOS", so the pages are the app's own (no
// prices, no plan links; kin/src/lib/ios-app.ts).
//
// From kin/, with the app running against dev (`npm run build && npm start`):
//   E2E_EMAIL=... E2E_PASSWORD=... node native/ios/store/screenshots.mjs
// or Actions -> iOS build -> Run workflow -> "screenshots" (ios.yml), which
// keeps them as the run's artifact. Out: native/ios/store/screenshots/<size>/.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

if (/kin-family-app\.vercel\.app/.test(BASE)) {
  console.error("Refusing production: screenshots come from the QA household on dev only.");
  process.exit(1);
}
if (!EMAIL.endsWith("@example.com") || !PASSWORD) {
  console.error("Set E2E_EMAIL and E2E_PASSWORD to the dev QA household's account (kin-dev-qa@example.com).");
  process.exit(1);
}

const SIZES = [
  { name: "6.9-inch", width: 440, height: 956 },
  { name: "6.3-inch", width: 402, height: 874 },
];

// In the order the App Store shows them; the first three are what most
// people see. Each is a page the QA household has content on.
const SHOTS = [
  { file: "01-today", path: "/today" },
  { file: "02-planner", path: "/planner" },
  { file: "03-chat", path: "/chat" },
  { file: "04-family", path: "/family" },
  { file: "05-health", path: "/family?seg=health" },
  { file: "06-wealth", path: "/wealth" },
  { file: "07-journal", path: "/journal" },
];

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KinApp/iOS";
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "screenshots");

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
let failed = 0;
for (const size of SIZES) {
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    locale: "en-PH",
    timezoneId: "Asia/Manila",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });

  await mkdir(path.join(out, size.name), { recursive: true });
  for (const shot of SHOTS) {
    try {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle", timeout: 60_000 });
      if (!(await page.evaluate(() => document.documentElement.hasAttribute("data-ios-app")))) {
        throw new Error("the page is not the iPhone app's (no data-ios-app)");
      }
      // Let entrance animations finish and images settle.
      await page.waitForTimeout(1500);
      const file = path.join(out, size.name, `${shot.file}.png`);
      await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
      console.log(`${size.name} ${shot.file}: ${size.width * 3} x ${size.height * 3}`);
    } catch (e) {
      failed++;
      console.error(`${size.name} ${shot.file} (${shot.path}): ${e instanceof Error ? e.message : e}`);
    }
  }
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
