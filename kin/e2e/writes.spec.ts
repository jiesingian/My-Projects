import { test, expect, type Page } from "@playwright/test";
import { tidyUpAfter } from "./support/qa-household";

/** The forms that add things, driven the way a person drives them.
 *
 * Reading a page proves the query works. It says nothing about whether the
 * household can actually put anything in, which is most of what the app is
 * for. A redirect after submitting is not proof either -- a silently failed
 * insert redirects exactly like a successful one -- so each test goes back and
 * looks for what it just made.
 *
 * Every row is named with a run id so a second run does not trip over the
 * first, and so the tidy-up at the foot can find exactly what this run made
 * and nothing else. It used to leave all of it behind: 612 rows were cleared
 * out of the throwaway household on 9 September, and this file and
 * deletes.spec had put 162 back by that evening, one batch per run. */

/** The prefix every row this file makes carries, and the one the sweep at the
 * foot clears. It is fixed rather than per-run on purpose -- see tidyUpAfter. */
const FAMILY = "E2E-WRITES";
const RUN = `${FAMILY}-${Date.now().toString(36)}`;

/** Fills a field only if the form actually has it, and says so if it does not:
 * a form that quietly lost an input is itself worth failing over. */
async function fill(page: Page, name: string, value: string) {
  const field = page.locator(`[name="${name}"]`).first();
  await expect(field, `the form has no field named ${name}`).toHaveCount(1);
  await field.fill(value);
}

async function submit(page: Page) {
  await page.locator('button[type="submit"]').first().click();
}

/** Waits until the browser is somewhere other than the form.
 *
 * `toHaveURL(/\/household/)` also matches `/household/meals/new`, so a form
 * that never submitted satisfied it. That is how a meal that was never saved
 * looked like a pass. */
async function leftTheForm(page: Page, formPath: string) {
  await page.waitForURL((url) => new URL(url).pathname !== formPath, { timeout: 30_000 });
}

/** Today, in the household's own zone -- which is what the app renders. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

test.describe("adding things", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  /* Everything above is proved by looking for it on the page, so it all has
   * to exist while the tests run and none of it should exist afterwards. The
   * sweep runs as the QA account through the ordinary API, so RLS decides
   * what it can reach and the real household is out of its range whatever
   * this file gets wrong. It asserts what is left rather than assuming the
   * deletes worked -- a delete refused by a policy returns 200. */
  test.afterAll(async () => {
    await tidyUpAfter(FAMILY);
  });

  test("an activity can be added and comes back", async ({ page }) => {
    const title = `${RUN} piano lesson`;
    await page.goto("/planner/add", { waitUntil: "networkidle" });
    await fill(page, "title", title);
    await fill(page, "date", "2026-09-11");
    await fill(page, "location", "Music room");
    await submit(page);

    await leftTheForm(page, "/planner/add");
    await page.goto("/planner?view=month&date=2026-09-11", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(title);
  });

  test("a journal entry can be added and comes back", async ({ page }) => {
    const title = `${RUN} first swim`;
    await page.goto("/journal/new", { waitUntil: "networkidle" });
    await fill(page, "title", title);
    await fill(page, "note", "Written by the end-to-end suite.");
    await submit(page);

    await leftTheForm(page, "/journal/new");
    await page.goto("/journal?seg=entries", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(title);
  });

  test("a milestone can be added and comes back", async ({ page }) => {
    const title = `${RUN} rode a bike`;
    await page.goto("/journal/milestones/new", { waitUntil: "networkidle" });
    await fill(page, "title", title);
    await submit(page);

    await leftTheForm(page, "/journal/milestones/new");
    await page.goto("/journal?seg=milestones", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(title);
  });

  test("a savings goal can be added and comes back", async ({ page }) => {
    const title = `${RUN} new roof`;
    await page.goto("/wealth/add", { waitUntil: "networkidle" });
    await fill(page, "title", title);
    await fill(page, "target_amount", "250000");
    await submit(page);

    await leftTheForm(page, "/wealth/add");
    await page.goto("/wealth?seg=assets", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(title);
  });

  test("an asset can be added and comes back", async ({ page }) => {
    const name = `${RUN} piano`;
    await page.goto("/wealth/assets/new", { waitUntil: "networkidle" });
    await fill(page, "name", name);
    await fill(page, "value", "85000");
    await submit(page);

    await leftTheForm(page, "/wealth/assets/new");
    await page.goto("/wealth?seg=assets", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(name);
  });

  test("a meal can be planned and comes back", async ({ page }) => {
    const dish = `${RUN} bulalo`;
    await page.goto("/household/meals/new", { waitUntil: "networkidle" });
    await fill(page, "dish", dish);
    // Both are required, in the form and again in the action.
    await fill(page, "date", today());
    await submit(page);

    await leftTheForm(page, "/household/meals/new");
    await page.goto("/household?seg=meals", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(dish);
  });

  /** A routine needs someone to be for, and saying so is the form's job.
   * Submitting without it must not look like nothing happened. */
  test("a routine refuses to save without saying who it is for", async ({ page }) => {
    await page.goto("/planner/routines/new", { waitUntil: "networkidle" });
    await fill(page, "title", `${RUN} evening walk`);
    await submit(page);
    await page.waitForTimeout(2500);

    await expect(page, "it should stay on the form").toHaveURL(/\/planner\/routines\/new/);
    await expect(page.locator("body"), "and it should say why").toContainText(
      /Choose who this is for|mark it for the whole family/i,
    );
  });

  test("a routine can be added once it is for the whole family", async ({ page }) => {
    const title = `${RUN} evening walk`;
    await page.goto("/planner/routines/new", { waitUntil: "networkidle" });
    await fill(page, "title", title);
    await page.getByText("Whole family", { exact: true }).first().click();
    await submit(page);

    await leftTheForm(page, "/planner/routines/new");
    await page.goto("/planner?seg=routines", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(title);
  });
});
