import fs from "node:fs";
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

/** Inside a Claude Code cloud container, outbound traffic goes through an agent
 * proxy that does not carry Chromium's WebSocket handshake: it comes back as a
 * 500, while curl sending the same headers through the same proxy gets its
 * 101. Kin's pages, and every request the server makes, are
 * unaffected -- only the live-update socket the browser opens itself. So there,
 * and only there, that one message is set aside. CI has no such proxy and
 * still fails on it, which is where a real Realtime outage would show. */
const BEHIND_AGENT_PROXY = fs.existsSync("/root/.ccr/agent-proxy-ca.crt") && !process.env.CI;
const REALTIME_SOCKET = /^WebSocket connection to 'wss:\/\/[^']+\/realtime\/v1\/websocket[^']*' failed/;

/** Collects everything the browser complained about while the page loaded. */
function watch(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const badResponses: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (BEHIND_AGENT_PROXY && REALTIME_SOCKET.test(m.text())) return;
    consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
  page.on("response", (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  });
  return { consoleErrors, pageErrors, badResponses };
}

/** Everything a sound page has to be, once it has loaded at `path`. */
async function expectSound(page: Page, seen: ReturnType<typeof watch>, path: string, theme: string, width: number) {
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
  expect(overflow, `${path} scrolls sideways at ${width}px`).toBeNull();

  // A hydration mismatch surfaces here and nowhere else -- the page
  // still looks correct, it just gets thrown away and rebuilt.
  expect(seen.pageErrors, `${path} threw in the browser`).toEqual([]);
  expect(seen.consoleErrors, `${path} logged console errors`).toEqual([]);
  expect(seen.badResponses, `${path} made failing requests`).toEqual([]);
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

          await expectSound(page, seen, hub.path, theme, width);
        });
      }
    });
  }
}

/** The screens shipped 14-19 October, each loaded once at phone width -- the
 * width the household uses them at -- in light and dark by turns down the
 * list. Once, not once per theme, because this tier has a twenty-minute cap
 * on a dev that is sometimes slow (e2e.yml): the hubs above already prove
 * both themes and every width for the shared chrome, and what these add is
 * each screen's own first paint. Loading, not using:
 * anything that writes a row belongs in weekly-check.yml.
 *
 * A screen behind an id is reached the way a person reaches it: open `from`,
 * then follow the first link starting with each of `links` in turn; `then`
 * appends what the last link itself does not carry. When the sample household has nothing
 * to link to -- no open emergency request, say -- the test is skipped with
 * the reason rather than passing on a page it never opened. */
type NewScreen = { name: string; path?: string; from?: string; links?: string[]; then?: string; landsOn?: string };
const NEW_SCREENS: NewScreen[] = [
  { name: "Year book", path: "/journal/year-book" },
  { name: "Tree file (GEDCOM)", path: "/family/tree-file" },
  { name: "Lending & savings circles", path: "/wealth/utang" },
  { name: "A savings circle", from: "/wealth/utang", links: ["/wealth/paluwagan/"] },
  { name: "Piggy bank & allowance", path: "/planner/alkansya" },
  { name: "A child's piggy bank", from: "/planner/alkansya", links: ["/planner/alkansya/"] },
  { name: "Statement import", from: "/wealth?seg=accounts", links: ["/wealth/accounts/"], then: "/import" },
  { name: "Helper access settings", path: "/settings/household" },
  // A member who helps nowhere is sent to their own Kin; that hop has to be clean too.
  { name: "Helper page, as a member", path: "/helper", landsOn: "/today" },
  { name: "Vault emergency access", path: "/settings/privacy" },
  // Password health sits at the top of the vault, for whoever can edit it.
  { name: "Vault password health", path: "/family?seg=documents" },
  { name: "An emergency request", from: "/settings/privacy", links: ["/settings/privacy/emergency/"] },
  { name: "Stories on the tree", from: "/family", links: ["/family/members/", "/family/stories/"] },
  // Where "To buy" opens from a message.
  { name: "Household chat", path: "/chat/household" },
];

test.describe(`new screens · phone`, () => {
  test.use({ viewport: { width: WIDTHS[0].width, height: WIDTHS[0].height } });

  NEW_SCREENS.forEach((screen, i) => {
    const theme = THEMES[i % THEMES.length];
    test(`${screen.name} is sound · ${theme}`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "kin-theme", value: theme, url: baseURL! }]);
      await page.emulateMedia({ colorScheme: theme });

      let path = screen.path;
      if (!path) {
        let at = screen.from!;
        for (const link of screen.links!) {
          await page.goto(at, { waitUntil: "networkidle" });
          const href = await page.locator(`a[href^="${link}"]`).first().getAttribute("href", { timeout: 2_000 }).catch(() => null);
          test.skip(!href, `the sample household has no link to ${link} on ${at}`);
          at = href!;
        }
        path = new URL(at, baseURL).pathname + (screen.then ?? "");
      }

      // Watching starts here, so a complaint is this screen's and not its parent's.
      const seen = watch(page);
      const response = await page.goto(path, { waitUntil: "networkidle" });
      expect(response?.status(), `${path} should serve 200`).toBe(200);
      const landsOn = screen.landsOn ?? new URL(path, baseURL).pathname;
      expect(new URL(page.url()).pathname, `${path} should land on ${landsOn}`).toBe(landsOn);

      await expectSound(page, seen, path, theme, WIDTHS[0].width);
    });
  });
});

/** The money forms put today's date in their date box. Both used to work it
 * out from the browser's clock while rendering, so whenever the browser and
 * the household were on different days the server's HTML and the browser's
 * first render disagreed and React threw the form away (minified error #418:
 * 7 times on /wealth/remittances/new and 3 on /wealth/transact on dev in the
 * weeks to 26 October). That only happened for part of each day, so the
 * browser's clock is moved three days on here: no pair of zones can then
 * land on the same date, and a form that reads its own clock fails every
 * run instead of by the hour. Only Date moves -- timers keep running. */
test.describe(`today's date hydrates · phone`, () => {
  test.use({ viewport: { width: WIDTHS[0].width, height: WIDTHS[0].height } });

  for (const path of ["/wealth/remittances/new", "/wealth/transact"]) {
    test(`${path} renders the same day on both sides`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
      const seen = watch(page);
      const response = await page.goto(path, { waitUntil: "networkidle" });
      expect(response?.status(), `${path} should serve 200`).toBe(200);
      expect(new URL(page.url()).pathname, `${path} should not redirect`).toBe(path);
      await page.waitForTimeout(1000);
      const hydration = [...seen.pageErrors, ...seen.consoleErrors].filter((e) => /hydrat|#418|did not match/i.test(e));
      expect(hydration, `${path} hydration mismatch`).toEqual([]);
    });
  }
});
