import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

/** The authorisation specs talk to Supabase directly, and the values they need
 * already live in .env.local. Next reads that file; Playwright does not, so
 * load it here rather than making everyone export the same two variables
 * twice. Anything already in the environment wins. */
for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

/** Where the app under test is. Point this at a preview or at production to
 * run the same suite against a deployment rather than a local dev server.
 *
 * `||` rather than `??`, and it matters. A workflow that offers an optional
 * URL passes the empty string when nobody filled it in -- GitHub renders an
 * absent input as "" -- and an empty string is not nullish, so `??` kept it.
 * baseURL became "", every relative goto had nothing to resolve against, and
 * the first navigation died with "Cannot navigate to invalid URL" after the
 * app had already built and started perfectly. Locally the variable is always
 * a real URL, so this could only ever fail in CI. */
const baseURL = process.env.E2E_BASE_URL?.trim() || "http://localhost:3000";

/** Some environments ship a browser and forbid downloading another -- the
 * agent sandbox this suite was written in is one. When a Chromium is sitting
 * there, use it; otherwise let Playwright manage its own, which is what a
 * laptop will do. */
const preinstalled = process.env.PLAYWRIGHT_CHROMIUM_PATH?.trim() || "/opt/pw-browsers/chromium";
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
    // Specs that exercise a function rather than the app. No browser, no
    // server, no sign-in -- so they run in about a second and can be reached
    // for while writing the code, which is the point of having them.
    { name: "logic", testMatch: /\.logic\.spec\.ts/ },
    {
      name: "chromium",
      testIgnore: /\.logic\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/state.json" },
      dependencies: ["setup"],
    },
  ],
});
