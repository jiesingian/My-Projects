import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { FEATURE_SLUGS } from "@/lib/feature-pages";

/** axe-core over the public pages, signed out (legal readiness, 29 October).
 *
 * a11y.spec.ts checks the app as the sample household; nothing checked what a
 * stranger sees first: the home page, the feature pages, sign-up and sign-in,
 * and the legal pages an app store reviewer reads without an account. Read-only
 * and signed out, so it touches no household at all.
 *
 * Same rules as a11y.spec.ts: WCAG 2.0-2.2 A and AA, `meta-viewport` off for
 * the reason given there, in light and in dark, at rest (Reduce Motion). */
test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = [
  "/",
  ...FEATURE_SLUGS.map((s) => `/features/${s}`),
  "/login",
  "/signup",
  "/forgot-password",
  "/legal/privacy",
  "/legal/terms",
  "/legal/refunds",
  "/legal/cookies",
  "/legal/licenses",
  "/legal/delete-account",
  "/legal/support",
];

for (const path of PAGES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${path} has no WCAG A/AA problems axe can find, signed out (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(path);
      await expect(page.locator("main").first()).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .disableRules(["meta-viewport"])
        .analyze();
      const readable = violations.map(
        (v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target.join(" ")} -- ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`).join("\n")}`,
      );
      expect(readable, readable.join("\n")).toEqual([]);
    });
  }
}

/** One main landmark, a level-one heading, headings in order: the structure
 * a screen reader moves by. */
for (const path of PAGES) {
  test(`${path} has one main, an h1 and headings in order, signed out`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withRules(["landmark-one-main", "page-has-heading-one", "heading-order", "landmark-no-duplicate-main", "landmark-unique"]).analyze();
    const readable = violations.map((v) => `${v.id}: ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target.join(" ")}`).join("\n")}`);
    expect(readable, readable.join("\n")).toEqual([]);
  });
}

/** Every public page reaches the privacy notice and the terms (Data Privacy
 * Act transparency; App Review 5.1.1; the Internet Transactions Act asks an
 * online seller's terms to be easy to find). */
for (const path of ["/", `/features/${FEATURE_SLUGS[0]}`, "/login", "/signup"]) {
  test(`${path} links to the privacy notice and the terms`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('a[href="/legal/privacy"]').first()).toBeAttached();
    await expect(page.locator('a[href="/legal/terms"]').first()).toBeAttached();
  });
}
