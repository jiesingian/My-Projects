import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";

/** Settings that actually do something.
 *
 * A preference the app stores, echoes back, and then ignores is worse than
 * one it never offered: it reads as a working feature. week_start was exactly
 * that -- Settings offers "Mon start" and "Sun start", families.week_start
 * defaults to monday, and every calendar laid its columns out with getDay(),
 * which counts from Sunday. So the household's setting saved cleanly, said so,
 * and changed nothing.
 *
 * These drive the preference from the outside and check the calendar moves. */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Sets the household's week start directly, rather than through Settings:
 * the point here is what the calendar does with it, and the Settings form is
 * organiser-gated and covered elsewhere. */
async function setWeekStart(token: string, familyId: string, value: "monday" | "sunday") {
  const api = await playwrightRequest.newContext();
  const res = await api.patch(`${SUPABASE_URL}/rest/v1/families?id=eq.${familyId}`, {
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: { week_start: value },
  });
  expect(res.ok(), `could not set week_start to ${value}`).toBeTruthy();
  await api.dispose();
}

/** The seven column headings above the month grid, in the order they run. */
async function weekdayHeadings(page: Page): Promise<string[]> {
  await page.goto("/planner?seg=calendar&view=month&date=2026-09-15", { waitUntil: "networkidle" });
  const row = page.locator('div[style*="repeat(7"]').first();
  await expect(row).toBeVisible();
  return (await row.innerText()).split("\n").map((s) => s.trim()).filter(Boolean);
}

test.describe("what the household's week starts on", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  let token: string;
  let familyId: string;
  let original: "monday" | "sunday";

  test.beforeAll(async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_KEY, "Supabase values are not set; skipping.");
    const api = await playwrightRequest.newContext();
    const auth = await api.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: SUPABASE_KEY!, "Content-Type": "application/json" },
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(auth.ok(), "could not sign the throwaway account in").toBeTruthy();
    token = (await auth.json()).access_token;

    const res = await api.get(`${SUPABASE_URL}/rest/v1/families?select=id,week_start`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
    });
    const rows: { id: string; week_start: string }[] = await res.json();
    expect(rows.length, "the throwaway account sees no household").toBe(1);
    familyId = rows[0].id;
    original = rows[0].week_start === "sunday" ? "sunday" : "monday";
    await api.dispose();
  });

  // Whatever these tests do to the household, it is put back.
  test.afterAll(async () => {
    if (token && familyId) await setWeekStart(token, familyId, original);
  });

  test("choosing Monday starts the calendar on Monday", async ({ page }) => {
    await setWeekStart(token, familyId, "monday");
    expect(await weekdayHeadings(page), "the month grid still starts on Sunday").toEqual([
      "M", "T", "W", "T", "F", "S", "S",
    ]);
  });

  test("choosing Sunday starts the calendar on Sunday", async ({ page }) => {
    await setWeekStart(token, familyId, "sunday");
    expect(await weekdayHeadings(page), "the month grid did not go back to Sunday").toEqual([
      "S", "M", "T", "W", "T", "F", "S",
    ]);
  });

  /** The headings are only half of it. If the columns move but the days do
   * not, every date sits under the wrong weekday -- a worse bug than the one
   * being fixed, and one that looks fine at a glance.
   *
   * So this counts the blanks the grid pads September with. 1 September 2026
   * is a Tuesday: one blank if the week starts on Monday, two if it starts on
   * Sunday. Scoped to September by its own data attribute, because the month
   * scroller renders two years at once and an unscoped "the cell reading 1"
   * finds March. */
  for (const [start, blanks] of [
    ["monday", 1],
    ["sunday", 2],
  ] as const) {
    test(`a ${start} week pads September with ${blanks} blank${blanks === 1 ? "" : "s"}`, async ({ page }) => {
      await setWeekStart(token, familyId, start);
      await page.goto("/planner?seg=calendar&view=month&date=2026-09-15", { waitUntil: "networkidle" });
      const september = page.locator('[data-month-iso^="2026-09"]');
      await expect(september, "September is not on the scroller").toHaveCount(1);

      const leading = await september.locator("> div").last().evaluate((grid) => {
        let n = 0;
        for (const child of Array.from(grid.children)) {
          if (child.tagName === "A") break;
          n += 1;
        }
        return n;
      });
      expect(leading, `1 September 2026 is a Tuesday, so a ${start} week leaves ${blanks} before it`).toBe(blanks);
    });
  }
});
