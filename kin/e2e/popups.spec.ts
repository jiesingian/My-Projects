import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";

/** The pop-ups (#1009, #1012, #1016, #1029): how they open, close and keep
 * what was typed. Nothing in CI opened one before Add expense's own spec,
 * which is how a sheet that opened by itself on every visit (Add a
 * medicine) and one that pinned the wrong row (Log a remittance) went out
 * on 26 October.
 *
 *   - a swipe down closes a sheet (Add to calendar)
 *   - an add page opened from a link is a sheet over the page, named after
 *     its heading, and Escape goes back to the page under it
 *   - saving from that sheet closes it and shows what was saved
 *   - typed work is not thrown away by Escape without asking
 *   - Add a medicine waits to be asked for
 *   - a pinned Save never stretches the fields beside it (#1052)
 *
 * The save writes a goal named with RUN, removed afterwards, so this runs
 * where writing is fine: on every pull request in smoke-private-db, and in
 * the weekly tier. */

const RUN = `E2E-POPUP-${Date.now().toString(36)}`;

let session: { url: string; headers: Record<string, string>; memberId: string } | null = null;

async function api() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  test.skip(!url || !key || !process.env.E2E_EMAIL, "Supabase details are not set; cannot check or tidy what was added.");
  const ctx = await playwrightRequest.newContext();
  if (!session) {
    const auth = await ctx.post(`${url}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key!, "Content-Type": "application/json" },
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(auth.ok(), "could not sign the sample account in").toBeTruthy();
    const { access_token, user } = await auth.json();
    const headers = { apikey: key!, Authorization: `Bearer ${access_token}` };
    const me = await ctx.get(`${url}/rest/v1/members?auth_user_id=eq.${user.id}&select=id`, { headers });
    const [row] = (await me.json()) as { id: string }[];
    session = { url: url!, headers, memberId: row.id };
  }
  return { ctx, ...session };
}

test.describe.configure({ mode: "serial" });
// A phone: the sheets come up from the bottom and follow a drag.
test.use({ viewport: { width: 390, height: 844 } });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  console.log(`[popups] failed at ${page.url()}`);
  try {
    console.log(await page.locator("body").ariaSnapshot({ timeout: 5000 }));
  } catch (e) {
    console.log(`[popups] no snapshot: ${e instanceof Error ? e.message : String(e)}`);
  }
});

test.afterAll(async () => {
  if (!session) return;
  const { ctx, url, headers } = await api();
  try {
    for (const table of ["planner_goals", "goals"]) {
      const res = await ctx.delete(`${url}/rest/v1/${table}?title=like.${encodeURIComponent(`${RUN}*`)}`, { headers });
      expect(res.ok(), `the test goal was left in ${table}: ${await res.text()}`).toBeTruthy();
    }
  } finally {
    await ctx.dispose();
  }
});

/** Drags a sheet down by its top edge, as a thumb would. */
async function swipeDown(page: Page, sheet: ReturnType<Page["getByRole"]>) {
  const box = await sheet.boundingBox();
  expect(box, "the sheet has no box to drag").not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(x, y + i * 40);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

test("Add to calendar closes on a swipe down", async ({ page }) => {
  await page.goto("/planner");
  await page.getByRole("button", { name: /add to calendar/i }).first().click();
  const sheet = page.getByRole("dialog", { name: /^Add to / });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600); // let the slide in finish before dragging
  await swipeDown(page, sheet);
  await expect(sheet).toBeHidden();
});

test("an add page opens over the page, named after its heading, and Escape goes back", async ({ page }) => {
  await page.goto("/planner?seg=goals");
  await page.locator('a[href="/planner/goals/new"]').first().click();
  await expect(page).toHaveURL(/\/planner\/goals\/new$/);
  const sheet = page.getByRole("dialog", { name: "Set a goal" });
  await expect(sheet).toBeVisible();
  // The page under it is still the Planner, not a page of its own (hidden
  // from a screen reader while the sheet is up, so found by its link).
  await expect(page.locator('main a[href="/planner/goals/new"]').first()).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/planner\?seg=goals$/);
});

test("saving from an add pop-up closes it and shows what was saved", async ({ page }) => {
  await api();
  await page.goto("/planner?seg=goals");
  await page.locator('a[href="/planner/goals/new"]').first().click();
  const sheet = page.getByRole("dialog", { name: "Set a goal" });
  await expect(sheet).toBeVisible();
  await sheet.locator('input[name="title"]').fill(`${RUN} water`);
  await sheet.getByRole("button", { name: "Set goal" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/planner\?seg=goals/);
  await expect(page.getByText(`${RUN} water`).first()).toBeVisible();
});

test("typed work is not thrown away by Escape without asking", async ({ page }) => {
  await page.goto("/family?seg=quicklinks");
  await page.getByRole("button", { name: /add contact/i }).click();
  const sheet = page.getByRole("dialog", { name: "Add a contact" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Name").fill("Dr. Santos");

  await page.keyboard.press("Escape");
  const ask = page.getByRole("alertdialog", { name: /discard what you've entered/i }).or(page.getByRole("dialog", { name: /discard what you've entered/i }));
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(ask).toBeHidden();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Name")).toHaveValue("Dr. Santos");

  await page.keyboard.press("Escape");
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Discard" }).click();
  await expect(sheet).toBeHidden();
});

test("Add a medicine waits to be asked for", async ({ page }) => {
  const { memberId } = await api();
  await page.goto(`/family/members/${memberId}?view=health&seg=medicines`);
  const add = page.getByRole("button", { name: /add a medicine/i });
  await expect(add).toBeVisible();
  const sheet = page.getByRole("dialog", { name: "Add a medicine" });
  await page.waitForTimeout(1000);
  await expect(sheet).toBeHidden();
  await add.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

/** No field in an open sheet stretched past an ordinary input's height. */
async function expectNoStretchedFields(sheet: ReturnType<Page["getByRole"]>) {
  const heights = await sheet
    .locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(heights.length, "the sheet has no fields to measure").toBeGreaterThan(0);
  for (const h of heights) expect(h, "a field stretched to fill the sheet").toBeLessThan(80);
}

test("pinned buttons never stretch the fields beside them", async ({ page }) => {
  // The category budget sheet (#1052): its button once shared a row with
  // the category box and the amount, and pinning it stretched them.
  const { memberId } = await api();
  await page.goto(`/wealth?seg=cashflow&open=expenses&who=${memberId}`);
  await page.getByRole("button", { name: /set a category budget/i }).first().click();
  const sheet = page.getByRole("dialog", { name: "Category budget" });
  await expect(sheet).toBeVisible();
  await expectNoStretchedFields(sheet);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();

  await page.goto("/family?seg=quicklinks");
  await page.getByRole("button", { name: /add contact/i }).click();
  const contact = page.getByRole("dialog", { name: "Add a contact" });
  await expect(contact).toBeVisible();
  await expectNoStretchedFields(contact);
});
