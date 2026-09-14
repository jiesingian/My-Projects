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

/** Start the app if nothing is already serving it.
 *
 * The suite used to assume a server was already up, and `npm run e2e` on a
 * clean container failed with `net::ERR_CONNECTION_REFUSED at
 * http://localhost:3000/login` -- 116 tests "did not run", one setup failure,
 * and a message that reads like a broken test rather than a forgotten step.
 * It cost a full run on 14 September to rediscover.
 *
 * `reuseExistingServer` keeps every existing arrangement working untouched:
 * e2e.yml and daily-check.yml build and start the app themselves before
 * calling the suite, and both will be reused rather than started twice. It
 * also skips starting anything when E2E_BASE_URL points somewhere else, which
 * is what running against a preview deployment does.
 *
 * `npm run start` rather than `next dev`, because the production build is what
 * CI tests and what the household uses -- and because a dev-mode timezone or
 * hydration difference is exactly the class of bug this suite exists to catch.
 */
/** Only a URL that is genuinely somewhere else suppresses the server. The
 * session hook used to export `E2E_BASE_URL=http://localhost:3000` -- the
 * default, spelled out -- which under a plain truthiness test would switch off
 * the very thing that starts the app. */
const runningElsewhere = !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL);

/** The suite writes. It creates households, edits balances, and one spec
 * deletes an entire family. So it may not point at production, and this is the
 * line that enforces it rather than trusting whoever set the variables.
 *
 * This is not hypothetical. The session hook wrote a fresh clone's .env.local
 * pointing at kin-family-app for four days after dev existed, and exported
 * production's QA account on top of it -- and because the loader above lets
 * the shell win over .env.local, that export silently overrode a correctly
 * configured machine. Nothing came of it because both machines already had a
 * .env.local. That is luck. This is not.
 *
 * CLAUDE.md: "Never write, edit or delete anything in a real household. Not a
 * test row, not a temporary one you mean to clean up, not while proving a fix
 * works." A rule that depends on four environment variables being right is a
 * hope; a rule that refuses to start is a rule.
 */
const PRODUCTION_REF = "lffqluudphzviubygwjs";
const target = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (target.includes(PRODUCTION_REF)) {
  throw new Error(
    `This suite writes to the database it runs against, and NEXT_PUBLIC_SUPABASE_URL points at production (${PRODUCTION_REF}).\n` +
      `Point it at kin-dev instead. The Singian household's real records are in there — their money, their health, their children's birthdays.\n` +
      `Note that a shell variable beats .env.local: check \`echo $NEXT_PUBLIC_SUPABASE_URL\` before assuming the file is what is in effect.`,
  );
}

export default defineConfig({
  testDir: "./e2e",
  webServer: runningElsewhere
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
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
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/state.json",
        // Deliberately NOT the household's zone. The server renders in
        // Asia/Manila; a browser anywhere else is where hydration mismatches
        // come from, and they were caught here only by accident -- the
        // container happened to be in UTC, which differs from Manila for eight
        // hours out of every twenty-four, so the same suite passed all morning
        // and failed all evening. Pinning a zone that never agrees with the
        // household makes that class fail every run instead of by the clock.
        timezoneId: "America/New_York",
      },
      dependencies: ["setup"],
    },
  ],
});
