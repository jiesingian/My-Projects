import { test, expect, request as playwrightRequest, type Locator, type Page } from "@playwright/test";

/** Putting money into a savings goal, through the app rather than around it.
 *
 * `recalc_goal_total` and the row lock under it are pinned by
 * goal-totals.spec.ts, but every one of those tests talks to the database
 * directly. The two places that actually CALL the function — contributing,
 * and confirming a contribution — had no browser coverage at all, which
 * `KNOWN_RISKS.md` has said since 8 September: "the contribute flow still has
 * no browser test, so the two call sites are verified by the type checker and
 * the function's own tests rather than by driving the app."
 *
 * The type checker cannot see that a form posts the wrong field, that a
 * control is wired to the wrong goal, or that the total on screen is read
 * from somewhere other than the ledger. This drives the buttons a person
 * presses and then checks the number against the ledger itself, which is the
 * only claim worth making about money: what it says matches what is recorded.
 */

const RUN = `E2E-CONTRIB-${Date.now().toString(36)}`;
const TITLE = `${RUN} school fund`;
const CONTRIBUTION = 1500;

async function api() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  test.skip(!url || !key || !process.env.E2E_EMAIL, "Supabase details are not set; cannot read the ledger back.");
  const ctx = await playwrightRequest.newContext();
  const auth = await ctx.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key!, "Content-Type": "application/json" },
    data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
  });
  expect(auth.ok(), "could not sign the throwaway account in").toBeTruthy();
  const token = (await auth.json()).access_token;
  return { ctx, url: url!, headers: { apikey: key!, Authorization: `Bearer ${token}` } };
}

/** The goal's stored total, and what the ledger says it should be. */
async function goalAgainstLedger(): Promise<{ stored: number; fromLedger: number }> {
  const { ctx, url, headers } = await api();
  try {
    const goals = await ctx.get(`${url}/rest/v1/goals?select=id,current_amount&title=eq.${encodeURIComponent(TITLE)}`, { headers });
    const rows: { id: string; current_amount: string }[] = await goals.json();
    expect(rows.length, `expected exactly one goal called ${TITLE}`).toBe(1);

    const moves = await ctx.get(
      `${url}/rest/v1/wealth_transactions?select=amount,direction,status&goal_id=eq.${rows[0].id}`,
      { headers },
    );
    const ledger: { amount: string; direction: string; status: string }[] = await moves.json();
    const fromLedger = ledger
      .filter((t) => t.status === "confirmed")
      .reduce((sum, t) => sum + (t.direction === "out" ? Number(t.amount) : -Number(t.amount)), 0);

    return { stored: Number(rows[0].current_amount), fromLedger };
  } finally {
    await ctx.dispose();
  }
}

/** Goals live under the Assets segment since Janine reorganised Wealth into
 * Cash Flow / Accounts / A&L on 9 September. `seg=goals` no longer exists and
 * falls back to cashflow, where the goal is not listed -- so this asserts the
 * title is on the page rather than trusting the URL to be the right one. */
async function openTheGoal(page: Page) {
  await page.goto("/wealth?seg=assets", { waitUntil: "networkidle" });
  await expect(page.locator("body")).toContainText(TITLE);
}

test.beforeAll(async () => {
  // Nothing to do but assert the household has an account to pay from —
  // without one the contribute control renders nothing at all, and the test
  // below would fail in a way that says nothing about the flow.
  const { ctx, url, headers } = await api();
  try {
    const res = await ctx.get(`${url}/rest/v1/accounts?select=id&is_archived=eq.false`, { headers });
    const accounts = await res.json();
    expect(accounts.length, "the throwaway household needs an account to contribute from").toBeGreaterThan(0);
  } finally {
    await ctx.dispose();
  }
});

test.afterAll(async () => {
  const { ctx, url, headers } = await api();
  try {
    const goals = await ctx.get(`${url}/rest/v1/goals?select=id&title=eq.${encodeURIComponent(TITLE)}`, { headers });
    for (const g of (await goals.json()) as { id: string }[]) {
      await ctx.delete(`${url}/rest/v1/wealth_transactions?goal_id=eq.${g.id}`, { headers });
      await ctx.delete(`${url}/rest/v1/goals?id=eq.${g.id}`, { headers });
    }
    const left = await ctx.get(`${url}/rest/v1/goals?select=id&title=eq.${encodeURIComponent(TITLE)}`, { headers });
    expect(await left.json(), "the probe goal survived the tidy-up").toEqual([]);
  } finally {
    await ctx.dispose();
  }
});

test("a goal added through the app starts at nothing", async ({ page }) => {
  await page.goto("/wealth/add", { waitUntil: "networkidle" });
  await page.locator('[name="title"]').first().fill(TITLE);
  await page.locator('[name="target_amount"]').first().fill("50000");
  await page.locator('button[type="submit"]').first().click();

  // Wait to be somewhere other than the form, the way writes.spec does, rather
  // than for the network to go quiet. A click that lands before the page has
  // hydrated does nothing at all, and `networkidle` is perfectly satisfied by
  // that -- which is why this spec passed alone and failed inside the full
  // run, where the dev server is busy compiling and hydration lags.
  await page.waitForURL((url) => new URL(url).pathname !== "/wealth/add", { timeout: 30_000 });

  await openTheGoal(page);
  const { stored, fromLedger } = await goalAgainstLedger();
  expect(stored).toBe(0);
  expect(fromLedger).toBe(0);
});

test("putting money in moves the total, and the total matches the ledger", async ({ page }) => {
  await openTheGoal(page);

  // The control is collapsed until asked for, and there is one per goal — so
  // scope to the card holding this goal rather than taking the first on the
  // page, which would quietly put money into somebody else's goal.
  //
  // Both filters are needed. Filtering on the title alone matches every
  // ancestor up to the page wrapper, and `.last()` of those is the innermost
  // one -- a leaf holding the text and no button. Requiring the button too
  // picks the smallest element that has both, which is the card.
  // The card is re-found either side of the click rather than held onto. The
  // control swaps its button out for the form when it opens, so a locator that
  // identifies the card *by* that button stops matching the moment it is used.
  // That went unnoticed for as long as this ran against a household with other
  // goals in it -- an ancestor div still held some other goal's button, so the
  // filter kept matching by accident. Run it against a household whose only
  // goal is this one and it times out on the Amount field.
  const cardHaving = (inner: Locator) => page.locator("div").filter({ hasText: TITLE }).filter({ has: inner }).last();

  const putMoneyIn = page.getByRole("button", { name: /PUT MONEY IN/i });
  await cardHaving(putMoneyIn).getByRole("button", { name: /PUT MONEY IN/i }).click();

  const open = cardHaving(page.getByLabel("Amount"));
  await open.getByLabel("Amount").fill(String(CONTRIBUTION));
  await open.getByRole("button", { name: /^ADD TO GOAL$/i }).click();
  await page.waitForLoadState("networkidle");

  await expect
    .poll(async () => (await goalAgainstLedger()).stored, {
      message: "the goal total did not move after contributing",
      timeout: 10_000,
    })
    .toBe(CONTRIBUTION);

  // The claim worth making about money: the number shown is the number
  // recorded, not a running tally that drifted away from it.
  const { stored, fromLedger } = await goalAgainstLedger();
  expect(stored, "the stored total disagrees with the ledger behind it").toBe(fromLedger);
});

test("the page shows the contribution it just took", async ({ page }) => {
  await openTheGoal(page);
  // Rendered with a thousands separator, so match on the digits either way.
  await expect(page.locator("body")).toContainText(/1[,.]?500/);
});
