import { test, expect, type Page } from "@playwright/test";

/** Every hub, at every width the app claims to support, in both themes.
 *
 * The assertions here are the ones that actually caught something. A page that
 * renders is not the same as a page that is right, but a page that logs an
 * error, scrolls sideways, or comes back 500 is definitely wrong, and none of
 * those are visible in a screenshot review. */

const HUBS = [
  { name: "Today", path: "/today" },
  { name: "Planner", path: "/planner" },
  { name: "Journal", path: "/journal" },
  { name: "Family", path: "/family" },
  { name: "Household", path: "/household" },
  { name: "Wealth", path: "/wealth" },
  { name: "Chat", path: "/chat" },
];

const WIDTHS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
];

const THEMES = ["light", "dark"] as const;

/** Collects everything the browser complained about while the page loaded. */
function watch(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const badResponses: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
  page.on("response", (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  });
  return { consoleErrors, pageErrors, badResponses };
}

for (const { name: widthName, width, height } of WIDTHS) {
  for (const theme of THEMES) {
    test.describe(`${widthName} ${width}px · ${theme}`, () => {
      test.use({ viewport: { width, height }, colorScheme: theme });

      for (const hub of HUBS) {
        test(`${hub.name} is sound`, async ({ page, context, baseURL }) => {
          await context.addCookies([{ name: "kin-theme", value: theme, url: baseURL! }]);
          const seen = watch(page);

          const response = await page.goto(hub.path, { waitUntil: "networkidle" });
          expect(response?.status(), `${hub.path} should serve 200`).toBe(200);

          // Landing somewhere else means the session or a guard sent us away.
          expect(new URL(page.url()).pathname, `${hub.path} should not redirect`).toBe(hub.path);

          // The theme the viewer asked for is the theme they get. Both the
          // cookie path and the media-query path have been wrong before.
          const applied = await page.evaluate(() => ({
            dataTheme: document.documentElement.getAttribute("data-theme"),
            // A transparent body borrows whatever is behind it, which is how a
            // dark page ends up with light chrome.
            background: getComputedStyle(document.body).backgroundColor,
          }));
          expect(applied.dataTheme).toBe(theme);
          expect(applied.background).not.toBe("rgba(0, 0, 0, 0)");

          // Nothing may push the page sideways. Wide tables and charts are
          // supposed to scroll inside their own box, not drag the document.
          const overflow = await page.evaluate(() => {
            const de = document.documentElement;
            if (de.scrollWidth <= window.innerWidth + 1) return null;
            for (const el of Array.from(document.querySelectorAll("*"))) {
              const r = el.getBoundingClientRect();
              if (r.right > window.innerWidth + 1 && r.width > 0) {
                return `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} reaches ${Math.round(r.right)}px`;
              }
            }
            return "something wider than the viewport";
          });
          expect(overflow, `${hub.path} scrolls sideways at ${width}px`).toBeNull();

          // A hydration mismatch surfaces here and nowhere else -- the page
          // still looks correct, it just gets thrown away and rebuilt.
          expect(seen.pageErrors, `${hub.path} threw in the browser`).toEqual([]);
          expect(seen.consoleErrors, `${hub.path} logged console errors`).toEqual([]);
          expect(seen.badResponses, `${hub.path} made failing requests`).toEqual([]);
        });
      }
    });
  }
}
