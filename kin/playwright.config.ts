import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

/** Where the app under test is. Point this at a preview or at production to
 * run the same suite against a deployment rather than a local dev server. */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** Some environments ship a browser and forbid downloading another -- the
 * agent sandbox this suite was written in is one. When a Chromium is sitting
 * there, use it; otherwise let Playwright manage its own, which is what a
 * laptop will do. */
const preinstalled = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const executablePath = fs.existsSync(preinstalled) ? preinstalled : undefined;

export default defineConfig({
  testDir: "./e2e",
  // Every spec talks to one shared Supabase project, and several of them write
  // rows. Running them in parallel would have them reading each other's data.
  workers: 1,
  fullyParallel: false,
  // A failing assertion here means the app is wrong, so a retry would only
  // hide it. Retries are for flaky infrastructure, and there is none.
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    launchOptions: executablePath ? { executablePath } : undefined,
    // Kept only for failures: a trace for every pass is mostly noise.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/state.json" },
      dependencies: ["setup"],
    },
  ],
});
