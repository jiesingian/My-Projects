import { test, expect, type Page } from "@playwright/test";
import { PALETTES } from "@/lib/palettes";
import { restAsQa, type Rest } from "./support/qa-household";
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
const PAGES = ["/today", "/planner", "/chat", "/wealth", "/household", "/journal", "/settings"];

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

/** Every colour theme, as a member who chose it would see it (accessibility
 * pass, 19 October). The sample member's own theme is switched through the
 * API, as themself, so the server renders the page exactly as it would for
 * someone on that theme -- injecting a theme's stylesheet into an already
 * rendered page is not the same thing -- and put back afterwards. Today in
 * both modes for each; Chat as well for Kin Coral (new members' default)
 * and Kin Classic. */
async function analyze(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["meta-viewport"])
    .analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target.join(" ")} -- ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`).join("\n")}`);
}

test.describe("every colour theme", () => {
  test.describe.configure({ mode: "serial" });
  let qa: Rest | null = null;
  let memberId = "";
  let original = "";

  test.beforeAll(async () => {
    qa = await restAsQa();
    test.skip(!qa, "Supabase values are not set; skipping.");
    const res = await qa!.ctx.get(`${qa!.url}/rest/v1/members?select=id,palette&auth_user_id=not.is.null`, { headers: qa!.headers });
    const me = ((await res.json()) as { id: string; palette: string }[])[0];
    memberId = me.id;
    original = me.palette;
  });

  test.afterAll(async () => {
    if (qa && memberId) await qa.ctx.patch(`${qa.url}/rest/v1/members?id=eq.${memberId}`, { headers: { ...qa.headers, "Content-Type": "application/json" }, data: { palette: original } });
  });

  for (const p of PALETTES) {
    test(`${p.name} reads at WCAG AA`, async ({ page, context }) => {
      test.setTimeout(180_000);
      const set = await qa!.ctx.patch(`${qa!.url}/rest/v1/members?id=eq.${memberId}`, { headers: { ...qa!.headers, "Content-Type": "application/json" }, data: { palette: p.id } });
      expect(set.ok(), await set.text()).toBeTruthy();
      // The cookie the root layout reads to put a dark-only theme in dark.
      await context.addCookies([{ name: "kin-palette", value: p.id, url: test.info().project.use.baseURL ?? "http://localhost:3000" }]);
      const paths = p.id === "coral" || p.id === "classic" ? ["/today", "/chat"] : ["/today"];
      const schemes = p.darkOnly ? (["dark"] as const) : (["light", "dark"] as const);
      const found: string[] = [];
      for (const path of paths) {
        for (const scheme of schemes) {
          await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
          await page.goto(path);
          await expect(page.locator("main, .kin-content").first()).toBeVisible();
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.evaluate((s) => document.documentElement.setAttribute("data-theme", s), scheme);
          for (const v of await analyze(page)) found.push(`${path} ${scheme}: ${v}`);
        }
      }
      expect(found, found.join("\n")).toEqual([]);
    });
  }
});

