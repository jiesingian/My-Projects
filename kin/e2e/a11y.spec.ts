import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** axe-core over the six main pages, in light and in dark.
 *
 * Read-only: it opens each page as the sample household and asks axe for
 * WCAG 2.1 A and AA problems -- a control with no name a screen reader can
 * read, text under 4.5:1, a missing label. Found and fixed in the
 * accessibility pass of 7 October; this keeps them fixed.
 *
 * One rule is off on purpose: `meta-viewport`. Kin turns pinch-zoom off
 * (app/layout.tsx says why), and large text comes from Settings → Appearance
 * → Text size instead, which reflows every page rather than magnifying one.
 *
 * axe only sees what is on screen, so sheets that are closed, and rows the
 * household doesn't have, aren't checked here. */
const PAGES = ["/today", "/planner", "/wealth", "/household", "/journal", "/settings"];

for (const path of PAGES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${path} has no WCAG A/AA problems axe can find (${scheme})`, async ({ page }) => {
      // Reduce Motion so rows aren't caught halfway through fading in, which
      // reads as low contrast; the check is of the page at rest.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(path);
      await expect(page.locator("main, .kin-content").first()).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
      // The household's own Light/Dark/System choice is on <html>; pin it to
      // the scheme under test so a household set to Light still gets checked dark.
      await page.evaluate((s) => document.documentElement.setAttribute("data-theme", s), scheme);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .disableRules(["meta-viewport"])
        .analyze();
      const readable = violations.map(
        (v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target.join(" ")} -- ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`).join("\n")}`,
      );
      expect(readable, readable.join("\n")).toEqual([]);
    });
  }
}
