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

/** Sets a household preference directly, rather than through Settings: the
 * point here is what the app does with it, and the Settings form is
 * organiser-gated and covered elsewhere. */
async function setPref(token: string, familyId: string, patch: Record<string, string>) {
  const api = await playwrightRequest.newContext();
  const res = await api.patch(`${SUPABASE_URL}/rest/v1/families?id=eq.${familyId}`, {
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: patch,
  });
  expect(res.ok(), `could not set ${JSON.stringify(patch)}`).toBeTruthy();
  await api.dispose();
}

const setWeekStart = (t: string, f: string, v: "monday" | "sunday") => setPref(t, f, { week_start: v });
const setDateFormat = (t: string, f: string, v: "DD/MM/YYYY" | "MM/DD/YYYY") => setPref(t, f, { date_format: v });

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

/** The household's date format, which every hub header shows and which nothing
 * read. formatDate takes a pattern and defaults it to DD/MM/YYYY; all 22 call
 * sites took the default, so families.date_format was stored, echoed back in
 * Settings, and ignored everywhere it mattered.
 *
 * The hub header is the assertion target because it renders today's date on
 * five hubs and needs no fixture: under DD/MM/YYYY the day comes first, under
 * MM/DD/YYYY the month does, and today's date tells them apart. */
test.describe("what the household's dates look like", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  let token: string;
  let familyId: string;
  let original: string;

  test.beforeAll(async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_KEY, "Supabase values are not set; skipping.");
    const api = await playwrightRequest.newContext();
    const auth = await api.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: SUPABASE_KEY!, "Content-Type": "application/json" },
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(auth.ok(), "could not sign the throwaway account in").toBeTruthy();
    token = (await auth.json()).access_token;
    const res = await api.get(`${SUPABASE_URL}/rest/v1/families?select=id,date_format`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
    });
    const rows: { id: string; date_format: string }[] = await res.json();
    expect(rows.length, "the throwaway account sees no household").toBe(1);
    familyId = rows[0].id;
    original = rows[0].date_format;
    await api.dispose();
  });

  test.afterAll(async () => {
    if (token && familyId) await setPref(token, familyId, { date_format: original });
  });

  /** Today, written both ways, from the browser's own clock so this does not
   * rot: 8 September is 08/09 one way round and 09/08 the other. */
  function todayBothWays() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    return { dayFirst: `${dd}/${mm}/${now.getFullYear()}`, monthFirst: `${mm}/${dd}/${now.getFullYear()}` };
  }

  for (const [pattern, want] of [
    ["DD/MM/YYYY", "dayFirst"],
    ["MM/DD/YYYY", "monthFirst"],
  ] as const) {
    test(`choosing ${pattern} writes dates that way`, async ({ page }) => {
      await setDateFormat(token, familyId, pattern);
      const both = todayBothWays();
      const expected = both[want];
      const other = want === "dayFirst" ? both.monthFirst : both.dayFirst;

      await page.goto("/journal", { waitUntil: "networkidle" });
      const header = (await page.locator("body").innerText()).replace(/\s+/g, " ");

      // Skipped rather than failed on the two days a month when both readings
      // are the same string -- the 1st to the 12th where day equals month --
      // because on those days this test cannot tell right from wrong.
      test.skip(expected === other, "day and month are equal today; the two formats are indistinguishable");

      expect(header, `the hub header does not show today as ${pattern}`).toContain(expected);
      expect(header, `the hub header is still writing dates the other way round`).not.toContain(other);
    });
  }
});

/** A native date input cannot be told what the household's date_format is --
 * the browser's locale decides how it draws itself, and the page has no say.
 * Chrome set to US renders 2026-09-07 as 09/07/2026, which everyone here reads
 * as the 9th of July.
 *
 * So the picker is left alone -- on a phone the native one is much better than
 * anything we would build -- and the date is written out beneath it, spelled,
 * because a month name has no digit order to get wrong.
 *
 * The date below is chosen so that both of its numbers are twelve or under.
 * That is the only case where the picker can genuinely mislead: with a day of
 * 19 there is no month it could be mistaken for, and the test would pass
 * against a broken component. */
test.describe("a date that cannot be misread", () => {
  test("the planner spells out the date under the picker", async ({ page }) => {
    await page.goto("/planner/add?type=activity", { waitUntil: "networkidle" });

    const date = page.locator('[name="date"]');
    await date.fill("2026-09-07");
    await expect(
      page.locator(".date-echo").first(),
      "the date is not spelled out, so 09/07/2026 stays ambiguous",
    ).toHaveText("Monday 7 September 2026");

    // And it follows the field rather than being written once at render.
    await date.fill("2026-07-09");
    await expect(page.locator(".date-echo").first(), "the spelled date did not follow the picker").toHaveText(
      "Thursday 9 July 2026",
    );
  });
});
