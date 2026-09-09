import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";

/** What a pasted URL does to the layout.
 *
 * People paste. A tracking link into a bill's name, a long ingredient string
 * into a meal, a run-on word into an activity title. None of that is abuse and
 * none of it is rare, and the app has nothing anywhere to stop it: 203 text
 * columns with no length limit, and 172 inputs with no maxLength between them.
 *
 * The database will hold it happily. The question this file asks is what the
 * page does with it, and specifically the one thing a person cannot ignore —
 * whether the page starts scrolling sideways on a phone, which makes every
 * screen feel broken, not just the one holding the long word.
 *
 * `overflow-wrap: anywhere` was set on chat bubbles and nowhere else, and the
 * Today brief truncates its own two lines. Everything else was unprotected.
 */

const RUN = `E2E-LONG-${Date.now().toString(36)}`;
// One unbroken "word", which is the case that breaks layouts: a normal long
// sentence wraps at its spaces without any help.
const LONG = `${RUN}-${"x".repeat(300)}`;

/** True when the document is wider than the window — the thing a person sees
 * as "the page scrolls sideways and everything is squashed". A couple of
 * pixels of slack, because sub-pixel rounding is not a bug. */
async function overflowsSideways(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

test.use({ viewport: { width: 390, height: 844 } }); // an iPhone, where it hurts

/** Removes the row this file created, through the API rather than the UI.
 *
 * The first attempt clicked through the app inside a try/catch, and it left
 * the row behind while the test went green -- a cleanup that silently does
 * nothing, which is the exact shape of bug this whole week was spent
 * removing. Measured: one row still there afterwards. So this deletes it
 * directly and ASSERTS the delete worked, and a failure here fails the run.
 */
test.afterAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !process.env.E2E_EMAIL) return;

  const api = await playwrightRequest.newContext();
  try {
    const auth = await api.post(`${url}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key, "Content-Type": "application/json" },
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(auth.ok(), "could not sign the throwaway account in to tidy up").toBeTruthy();
    const token = (await auth.json()).access_token;

    const del = await api.delete(`${url}/rest/v1/activities?title=like.${encodeURIComponent(RUN + "%")}`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    expect(del.ok(), `could not delete the long-title rows: ${del.status()}`).toBeTruthy();

    const left = await api.get(`${url}/rest/v1/activities?select=id&title=like.${encodeURIComponent(RUN + "%")}`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    expect(await left.json(), "a long-title row survived the tidy-up").toEqual([]);
  } finally {
    await api.dispose();
  }
});

test("a pasted wall of text does not push the planner sideways", async ({ page }) => {
  await page.goto("/planner/add?type=activity", { waitUntil: "networkidle" });
  await page.locator('[name="title"]').first().fill(LONG);
  await page.locator('[name="date"]').first().fill("2026-09-15");
  await page.locator('[name="from"]').first().fill("09:00");
  await page.locator('button[type="submit"]').first().click();
  // Somewhere other than the form -- a click that lands before hydration does
  // nothing, and networkidle is satisfied by that. See goal-contribute.
  await page.waitForURL((url) => new URL(url).pathname !== "/planner/add", { timeout: 30_000 });

  await page.goto("/planner?seg=calendar&view=month&date=2026-09-15", { waitUntil: "networkidle" });
  await expect(page.getByText(RUN, { exact: false }).first()).toBeVisible();

  const overflow = await overflowsSideways(page);
  expect(overflow, `the planner scrolls ${overflow}px sideways with a long title on it`).toBeLessThanOrEqual(2);
});

test("and neither does it push Today sideways", async ({ page }) => {
  await page.goto("/today", { waitUntil: "networkidle" });
  const overflow = await overflowsSideways(page);
  expect(overflow, `Today scrolls ${overflow}px sideways`).toBeLessThanOrEqual(2);
});
