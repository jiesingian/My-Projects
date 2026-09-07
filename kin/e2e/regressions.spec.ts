import { test, expect } from "@playwright/test";

/** One test per bug that shipped, so none of them can ship twice.
 *
 * Each of these was found by driving the real app against real content, and
 * every one of them was invisible to a build, a type check and a lint. They
 * are written to fail loudly in the exact way the bug behaved. */

test.describe("bugs that already got out once", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /** PGRST201. health_schedule holds two references to members -- the person
   * it is about and whoever wrote it down -- so an unqualified members()
   * embed is ambiguous and PostgREST returns nothing rather than erroring
   * anywhere visible. The briefing simply had no health in it, ever. */
  test("a due health item reaches the Today briefing", async ({ page }) => {
    await page.goto("/today", { waitUntil: "networkidle" });
    const briefing = page.locator("body");

    // The seeded throwaway household has a check-up due today.
    await expect(briefing).toContainText(/check-up/i);

    // And the Family hub card must not claim there is nothing, nor tell a
    // household that plainly has members to go and add one.
    await expect(briefing).not.toContainText(/Nothing due — add a member to get started/i);
  });

  /** The same ambiguous embed, on milestones. The tab looked like nowhere had
   * ever recorded one. */
  test("milestones are listed", async ({ page }) => {
    await page.goto("/journal?seg=milestones", { waitUntil: "networkidle" });
    await expect(page.locator("body")).not.toContainText(/^\s*$/);
    // At least one milestone row, rather than an empty tab.
    await expect(page.locator("body")).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  });

  /** The server ran in UTC while the household lives in Manila, so a 07:30
   * Monday school run was an instant at 23:30 on Sunday, and the Planner
   * filed it under Sunday night. Wrong day, not merely wrong time. */
  test("the Planner shows the household's own clock", async ({ page }) => {
    await page.goto("/planner", { waitUntil: "networkidle" });
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");

    // Seeded at 07:30, 10:00 and 17:30 Manila. Under UTC these read 23:30
    // (the previous day), 02:00 and 09:30.
    expect(text, "morning activity should read 07:30, not 23:30").toContain("07:30");
    expect(text, "evening activity should read 17:30, not 09:30").toContain("17:30");
  });

  /** Today's hub card formatted without a timezone while the briefing above it
   * formatted with one, so the same activity appeared twice on one page at two
   * different times. */
  test("Today's hub card agrees with the briefing above it", async ({ page }) => {
    await page.goto("/today", { waitUntil: "networkidle" });
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (/Grocery run/.test(text)) {
      expect(text, "the hub card must not be eight hours off").not.toMatch(/Grocery run, \w{3} 9:30 AM/);
    }
  });

  /** Chat is a client component that formatted timestamps in whichever zone
   * the reader's browser happened to be in, so the server and the browser
   * rendered different text and React discarded the thread on every load. */
  test("the chat thread survives hydration", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto("/chat", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    expect(pageErrors.filter((e) => /hydration/i.test(e)), "chat hydration mismatch is back").toEqual([]);
  });

  /** The Ask Kin button floats over the page, which is its job, but nothing
   * reserved room for it, so the last rows of a fully scrolled page sat under
   * it permanently and could not be read. */
  for (const [label, width, height] of [
    ["phone", 390, 844],
    ["tablet", 834, 1112],
    ["desktop", 1440, 900],
  ] as const) {
    test(`nothing is trapped under the Ask Kin button on ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const path of ["/household", "/wealth", "/today"]) {
        await page.goto(path, { waitUntil: "networkidle" });
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(500);

        const trapped = await page.evaluate(() => {
          const fixed = Array.from(document.querySelectorAll("button,a")).filter(
            (e) => getComputedStyle(e).position === "fixed",
          );
          const fab = fixed
            .map((e) => ({ e, r: e.getBoundingClientRect() }))
            .filter((o) => o.r.width > 40 && o.r.width < 90 && o.r.height > 40 && o.r.height < 90)
            .sort((a, b) => b.r.top - a.r.top)[0];
          if (!fab) return null;

          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n: Node | null;
          while ((n = walker.nextNode())) {
            const t = n.textContent?.trim();
            if (!t) continue;
            const el = n.parentElement;
            if (!el || fab.e.contains(el) || el.closest("nav")) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const rect of Array.from(range.getClientRects())) {
              if (rect.width < 2 || rect.height < 2) continue;
              const ix = Math.min(rect.right, fab.r.right) - Math.max(rect.left, fab.r.left);
              const iy = Math.min(rect.bottom, fab.r.bottom) - Math.max(rect.top, fab.r.top);
              if (ix > 2 && iy > 2) return t.slice(0, 60);
            }
          }
          return null;
        });

        expect(trapped, `${path} hides text under the button at ${label}`).toBeNull();
      }
    });
  }
});
