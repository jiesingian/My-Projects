import { test, expect } from "@playwright/test";
import { firstLoad, hasBuild } from "./support/bundle";

/** What a phone downloads before Kin is usable (speed pass, 19 October).
 *
 * Measured from the production build, gzipped, as a mid-range Android on 4G
 * would fetch it. Before the pass every page's shell was 247 KB, most of it
 * supabase-js, pulled in by the call provider's realtime channel and the
 * offline queue's photo upload; both now import it when they use it, as do
 * the call video effects and the Ask Kin sheet. After: 176 KB for the shell,
 * Today 280 -> 208 KB.
 *
 * The budgets leave about 10% room. A change that needs more is fine; raise
 * the number here in the same pull request and say why. What should not
 * happen is supabase-js arriving in the shell again by an innocent import.
 *
 * Skips without a build (`npm run build` first); CI builds before this runs. */

const SHELL = ["app/layout", "app/(app)/layout"];

test.beforeEach(() => {
  test.skip(!hasBuild(), "No production build in .next; run `npm run build` first.");
});

test("supabase-js is not in the shell every page loads", () => {
  const shell = firstLoad("(app)/today", SHELL);
  // Names that survive minification: the auth and realtime clients' classes.
  expect(/GoTrueClient|RealtimeClient/.test(shell.text), "something in a layout imports @/lib/supabase/client (or upload-client) at the top; import it where it is used").toBe(false);
});

test("the shell stays under 195 KB", () => {
  expect(firstLoad("(app)/today", SHELL).gzip / 1024).toBeLessThan(195);
});

test("Today stays under 230 KB", () => {
  expect(firstLoad("(app)/today", [...SHELL, "today/page"]).gzip / 1024).toBeLessThan(230);
});
