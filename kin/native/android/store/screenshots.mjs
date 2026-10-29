// Phone screenshots for Kin's Google Play listing, of the throwaway QA
// household only (kin/docs/QA_HOUSEHOLDS.md), never a real family. Run from
// kin/, against a local Kin that reads the dev database (.env.local), with
// E2E_EMAIL and E2E_PASSWORD set as for the e2e suite:
//
//   npm run build && npx next start &           (or npm run dev)
//   node native/android/store/screenshots.mjs
//
// It only opens pages, and writes nothing. Each shot is 1080 x 2160 (a
// 360 x 720 phone at 3x): Google Play takes 2 to 8 phone screenshots, each
// side 320-3840 px, the long side at most twice the short. They go in
// store/screenshots/, as PNG.
//
// The web view's user agent carries the Android app's mark, so screens look
// as they do in the app (no Kin Plus prices once the app is told apart).
// CHROMIUM=/path/to/chrome when Playwright's own browser is not installed.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "screenshots");
const base = (process.env.KIN_URL ?? "http://localhost:3000").replace(/\/$/, "");
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const PRODUCTION_REF = "lffqluudphzviubygwjs";

if (!email || !password) {
  console.error("Set E2E_EMAIL and E2E_PASSWORD: the QA household's sign-in (kin/docs/QA_HOUSEHOLDS.md).");
  process.exit(2);
}
if (!/@example\.com$/.test(email)) {
  console.error(`${email} is not a QA account (they are all @example.com). Real households are never photographed.`);
  process.exit(2);
}
if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(PRODUCTION_REF) || /kin-family-app\.vercel\.app/.test(base)) {
  console.error("This points at production. Screenshots come from dev's QA household only.");
  process.exit(2);
}

// The order is the listing's order: the first two or three are what most
// people see.
const SHOTS = [
  ["01-today", "/today"],
  ["02-planner", "/planner"],
  ["03-household", "/household"],
  ["04-chat", "/chat"],
  ["05-family", "/family"],
  ["06-alarms", "/settings/notifications/alarms"],
  ["07-wealth", "/wealth"],
];

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const context = await browser.newContext({
  viewport: { width: 360, height: 720 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 KinAndroidApp",
});
const page = await context.newPage();

await page.goto(`${base}/login`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });

mkdirSync(out, { recursive: true });
for (const [name, path] of SHOTS) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  // Past the first paint's placeholders and any entrance motion.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`${name}.png  ${path}`);
}
await browser.close();
