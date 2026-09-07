import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";

/** Changing things, where the danger is what you did not mean to change.
 *
 * Every one of these actions rewrites the whole row from the form, rather than
 * only the fields that moved. updateActivityAction writes title, start, end,
 * repeat, location, notes and applies_to_whole_family on every save. That is
 * fine exactly as long as the edit form arrives carrying what is already
 * there; the moment one input stops being populated -- or is populated with
 * the wrong value -- saving an unrelated change quietly rewrites it, and
 * nothing anywhere reports an error.
 *
 * So the shape of every test here is the same: set several fields, change one,
 * and check the others are still what they were. */

const RUN = `E2E-EDIT-${Date.now().toString(36)}`;

/** The calendar shows a month grid and, under it, the agenda for the day the
 * URL is anchored on. There is no day view; month is how you look at a day. */
const dayUrl = (iso: string) => `/planner?seg=calendar&view=month&date=${iso}`;

async function fill(page: Page, name: string, value: string) {
  const field = page.locator(`[name="${name}"]`).first();
  await expect(field, `the form has no field named ${name}`).toHaveCount(1);
  await field.fill(value);
}

/** The agenda row for one activity, which is also the link to its edit form. */
function rowFor(page: Page, title: string) {
  return page.locator('a[href*="type=activity"]').filter({ hasText: title }).first();
}

/** Creates an activity with every text field populated, and returns the URL of
 * its edit form -- which is how the calendar links to it. */
async function createRichActivity(page: Page, title: string, date: string, from: string) {
  await page.goto("/planner/add?type=activity", { waitUntil: "networkidle" });
  await fill(page, "title", title);
  await fill(page, "date", date);
  await fill(page, "from", from);
  await fill(page, "location", "Sacred Heart gym");
  await fill(page, "notes", "Bring the spare kit and the blue water bottle.");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => new URL(u).pathname !== "/planner/add", { timeout: 30_000 });

  await page.goto(dayUrl(date), { waitUntil: "networkidle" });
  const link = rowFor(page, title);
  await expect(link, "the new activity is not on the day it was given").toBeVisible();
  const href = await link.getAttribute("href");
  expect(href, "the activity has no edit link").toBeTruthy();
  return href!;
}


/** The stored instant for an activity, read as the household would through
 * PostgREST. Skipped rather than failed where the Supabase values are absent,
 * so the suite still runs against a deployment without them. */
async function storedStartAt(title: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  test.skip(!url || !key, "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are not set; cannot read the stored instant.");
  const api = await playwrightRequest.newContext();
  const auth = await api.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key!, "Content-Type": "application/json" },
    data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
  });
  expect(auth.ok(), "could not sign the throwaway account in").toBeTruthy();
  const token = (await auth.json()).access_token;
  const res = await api.get(`${url}/rest/v1/activities?select=start_at&title=eq.${encodeURIComponent(title)}`, {
    headers: { apikey: key!, Authorization: `Bearer ${token}` },
  });
  const rows: { start_at: string }[] = await res.json();
  await api.dispose();
  expect(rows.length, "the activity was not stored at all").toBe(1);
  return rows[0].start_at;
}

test.describe("changing things", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  /** The time you type is the time you get, and the time you get back.
   *
   * Activities are stored as instants built by parsing `${date}T${time}` in the
   * server's zone. While that zone was UTC and the Planner also rendered in
   * UTC, both were wrong and agreed, so nothing looked amiss -- until the
   * server was told where the household lives. The calendar now reads the
   * instant properly; the edit form has to as well, because whatever it shows
   * is what the next save writes back. */
  test("an activity keeps the time it was given", async ({ page }) => {
    const title = `${RUN} evening mass`;
    await page.goto("/planner/add?type=activity", { waitUntil: "networkidle" });
    await fill(page, "title", title);
    await fill(page, "date", "2026-09-19");
    await fill(page, "from", "18:00");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => new URL(u).pathname !== "/planner/add", { timeout: 30_000 });

    // As the day reads it,
    await page.goto(dayUrl("2026-09-19"), { waitUntil: "networkidle" });
    const row = rowFor(page, title);
    await expect(row, "the activity is not on the day it was given").toBeVisible();
    await expect(row, "the Planner shows a different time from the one entered").toContainText("18:00");

    // and as the form reads it back. These have to agree: the form's value is
    // what the next save stores.
    await row.click();
    await page.waitForURL(/type=activity&id=/, { timeout: 30_000 });
    await expect(page.locator('[name="date"]'), "the edit form opens on the wrong day").toHaveValue("2026-09-19");
    await expect(page.locator('[name="from"]'), "the edit form shows a different time from the one entered").toHaveValue(
      "18:00",
    );

    // And the instant underneath both is the right one. This is the only part
    // of the round trip a person cannot see, and the only part that says
    // whether the server knows where the household lives: when it does not,
    // the whole app is wrong by the same eight hours and so reads as right.
    const stored = await storedStartAt(title);
    expect(
      stored,
      "18:00 in Manila was not stored as the instant it is -- the server is probably not in the household's zone",
    ).toMatch(/^2026-09-19T10:00:00/);
  });

  test("editing one field leaves the others alone", async ({ page }) => {
    const before = `${RUN} football practice`;
    const after = `${RUN} football practice, moved`;

    const editUrl = await createRichActivity(page, before, "2026-09-18", "14:30");

    // The edit form must arrive already holding what was saved. If it does
    // not, saving is what destroys the row -- so this is checked before
    // touching anything.
    await page.goto(editUrl, { waitUntil: "networkidle" });
    await expect(page.locator('[name="title"]')).toHaveValue(before);
    await expect(page.locator('[name="location"]'), "the edit form lost the location").toHaveValue("Sacred Heart gym");
    await expect(page.locator('[name="notes"]'), "the edit form lost the notes").toHaveValue(
      "Bring the spare kit and the blue water bottle.",
    );

    // Change only the title.
    await fill(page, "title", after);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => new URL(u).pathname !== "/planner/add", { timeout: 30_000 });

    // And everything else survived the save.
    await page.goto(editUrl, { waitUntil: "networkidle" });
    await expect(page.locator('[name="title"]')).toHaveValue(after);
    await expect(page.locator('[name="location"]'), "saving a new title emptied the location").toHaveValue(
      "Sacred Heart gym",
    );
    await expect(page.locator('[name="notes"]'), "saving a new title emptied the notes").toHaveValue(
      "Bring the spare kit and the blue water bottle.",
    );
    await expect(page.locator('[name="date"]'), "saving a new title moved the day").toHaveValue("2026-09-18");
    await expect(page.locator('[name="from"]'), "saving a new title moved the time").toHaveValue("14:30");

    // And the calendar agrees: the row is still on the day it was given, at
    // the time it was given. Saving twice must not walk it anywhere.
    await page.goto(dayUrl("2026-09-18"), { waitUntil: "networkidle" });
    const row = rowFor(page, after);
    await expect(row, "saving a new title moved the activity off its day").toBeVisible();
    await expect(row, "saving a new title moved the time").toContainText("14:30");
  });
});
