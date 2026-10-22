import { test, expect, type Page } from "@playwright/test";
import { PALETTES } from "@/lib/palettes";
import { restAsQa, type Rest } from "./support/qa-household";
import AxeBuilder from "@axe-core/playwright";

/** axe-core over the main pages, in light and in dark.
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
// Health (Family → Health) since the wrap-up check of 22 October: it was
// never in this list, and its "Not recorded · add" links failed 2.5.3.
const PAGES = ["/today", "/planner", "/chat", "/wealth", "/family?seg=health", "/household", "/journal", "/settings"];

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

/** Structure (final design check, 22 October): one main landmark, a level-one
 * heading, headings that don't skip a level, and a way past the repeated
 * blocks. axe files these under best practice rather than a WCAG tag, so
 * they are asked for by name. */
for (const path of PAGES) {
  test(`${path} has one main, an h1 and headings in order`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await expect(page.locator("main, .kin-content").first()).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {});
    const { violations } = await new AxeBuilder({ page }).withRules(["landmark-one-main", "page-has-heading-one", "heading-order", "bypass", "landmark-no-duplicate-main", "landmark-unique"]).analyze();
    const readable = violations.map((v) => `${v.id}: ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target.join(" ")}`).join("\n")}`);
    expect(readable, readable.join("\n")).toEqual([]);
  });
}

/** WCAG 2.2, 2.4.11 Focus Not Obscured: tabbing through a page on a phone,
 * nothing that has focus sits hidden under the tab bar, the Ask Kin button
 * or a sticky header. Checked at the focused element's centre. */
for (const path of ["/today", "/planner", "/wealth", "/settings"]) {
  test(`${path}: what has focus is never hidden under the bars (phone)`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await expect(page.locator("main, .kin-content").first()).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {});
    const hidden: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return null;
        const x = Math.min(Math.max(b.left + b.width / 2, 0), innerWidth - 1);
        const y = Math.min(Math.max(b.top + b.height / 2, 0), innerHeight - 1);
        const top = document.elementFromPoint(x, y);
        const ok = !top || el.contains(top) || top.contains(el);
        return ok ? null : `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" under ${top!.className || top!.tagName}`;
      });
      if (r) hidden.push(r);
    }
    expect(hidden, hidden.join("\n")).toEqual([]);
  });
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
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
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
    // The signed-in member's own row: the household has more than one login.
    const user = (await (await qa!.ctx.get(`${qa!.url}/auth/v1/user`, { headers: qa!.headers })).json()) as { id: string };
    const res = await qa!.ctx.get(`${qa!.url}/rest/v1/members?select=id,palette&auth_user_id=eq.${user.id}`, { headers: qa!.headers });
    const me = ((await res.json()) as { id: string; palette: string }[])[0];
    expect(me, "the sample account has no member row").toBeTruthy();
    memberId = me.id;
    original = me.palette;
  });

  test.afterAll(async () => {
    if (qa && memberId) await qa.ctx.patch(`${qa.url}/rest/v1/members?id=eq.${memberId}`, { headers: { ...qa.headers, "Content-Type": "application/json" }, data: { palette: original } });
  });

  for (const p of PALETTES) {
    test(`${p.name} reads at WCAG AA`, async ({ page, context }) => {
      test.setTimeout(180_000);
      const set = await qa!.ctx.patch(`${qa!.url}/rest/v1/members?id=eq.${memberId}`, { headers: { ...qa!.headers, "Content-Type": "application/json", Prefer: "return=representation" }, data: { palette: p.id } });
      // Row-level security answers a refused update with 200 and no rows, so
      // the row coming back is the proof the theme changed.
      expect((await set.json()) as unknown[], "the theme did not change").toHaveLength(1);
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

