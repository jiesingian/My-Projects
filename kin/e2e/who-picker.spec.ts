import { test, expect, request as playwrightRequest, type Locator, type Page } from "@playwright/test";
import { expandAllCollapsedGroups } from "./support/collapsible-groups";

/** The Who picker in the app, on the three tabs that offer one.
 *
 * `who-picker.logic.spec.ts` pins the rule the picker filters by. This drives
 * the control itself, because three things about it cannot be seen from that
 * predicate: whether the picker is on the tab at all, whether the tab still
 * renders once a person is named, and whether choosing somebody keeps the
 * rest of the query string.
 *
 * The middle one is the one that has already gone wrong. A&L's
 * "+ PUT MONEY IN" was built from the scoped account list, and
 * GoalContributeControl renders nothing at all when handed an empty list --
 * so naming anybody, yourself included, silently removed the only way to put
 * money into a goal. No error, no empty state, just a missing button.
 */

const RUN = `E2E-WHO-${Date.now().toString(36)}`;
const GOAL = `${RUN} my own goal`;

async function api() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  test.skip(!url || !key || !process.env.E2E_EMAIL, "Supabase details are not set.");
  const ctx = await playwrightRequest.newContext();
  const auth = await ctx.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key!, "Content-Type": "application/json" },
    data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
  });
  expect(auth.ok(), "could not sign the throwaway account in").toBeTruthy();
  const body = await auth.json();
  return { ctx, url: url!, authUserId: body.user.id as string, headers: { apikey: key!, Authorization: `Bearer ${body.access_token}` } };
}

/** The signed-in account's own member row — the id the picker uses for "Me". */
async function meAndFamily() {
  const { ctx, url, headers, authUserId } = await api();
  try {
    const res = await ctx.get(`${url}/rest/v1/members?select=id,family_id&auth_user_id=eq.${authUserId}`, { headers });
    const rows: { id: string; family_id: string }[] = await res.json();
    expect(rows.length, "the throwaway account has no member row").toBe(1);
    return rows[0];
  } finally {
    await ctx.dispose();
  }
}

test.beforeAll(async () => {
  // A goal that is mine and NOT joint, so it is certain to be on screen under
  // my own name -- a joint one would sit under Everyone only, and the test
  // would pass by finding nothing to check.
  const me = await meAndFamily();
  const { ctx, url, headers } = await api();
  try {
    const res = await ctx.post(`${url}/rest/v1/goals`, {
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      data: { family_id: me.family_id, title: GOAL, target_amount: 10000, is_joint: false, owner_member_id: me.id, created_by: me.id },
    });
    expect(res.ok(), `could not create the probe goal: ${await res.text()}`).toBeTruthy();
  } finally {
    await ctx.dispose();
  }
});

test.afterAll(async () => {
  const { ctx, url, headers } = await api();
  try {
    await ctx.delete(`${url}/rest/v1/goals?title=eq.${encodeURIComponent(GOAL)}`, { headers });
    const left = await ctx.get(`${url}/rest/v1/goals?select=id&title=eq.${encodeURIComponent(GOAL)}`, { headers });
    expect(await left.json(), "the probe goal survived the tidy-up").toEqual([]);
  } finally {
    await ctx.dispose();
  }
});

/** Opens the Who menu and returns it. Scoped to the menu's own accessible
 * name so it cannot pick up Cash Flow's range picker, which is the same
 * control sitting a few pixels away. */
async function openWho(page: Page) {
  await page.getByRole("button", { name: /^Choose who$/i }).first().click();
  const menu = page.getByRole("menu", { name: "Who" });
  await expect(menu).toBeVisible();
  return menu;
}

for (const seg of ["cashflow", "accounts", "assets"] as const) {
  test(`the ${seg} tab offers a Who picker, and every member is in it`, async ({ page }) => {
    await page.goto(`/wealth?seg=${seg}`, { waitUntil: "networkidle" });
    const menu = await openWho(page);
    await expect(menu.getByRole("menuitemradio", { name: "Everyone" })).toBeVisible();
    // Everyone plus at least one member. A picker that lost its members would
    // still render "Everyone" and look fine.
    expect(await menu.getByRole("menuitemradio").count()).toBeGreaterThan(1);
  });
}

test("naming a person keeps the way to put money into their goal", async ({ page }) => {
  const me = await meAndFamily();

  // Everyone first: the control is there, which is what makes the comparison
  // below mean something rather than being a test of an absent goal. ASSETS
  // (where goals live) starts collapsed since 18 September.
  await page.goto("/wealth?seg=assets&who=all", { waitUntil: "networkidle" });
  await expandAllCollapsedGroups(page);
  const everyoneCard = page.locator("div").filter({ hasText: GOAL }).filter({ has: page.getByRole("button", { name: /PUT MONEY IN/i }) }).last();
  await expect(everyoneCard).toBeVisible();

  // Then my own tab, where the goal is mine and must behave the same.
  await page.goto(`/wealth?seg=assets&who=${me.id}`, { waitUntil: "networkidle" });
  await expandAllCollapsedGroups(page);
  await expect(page.locator("body"), "my own goal should be on my own tab").toContainText(GOAL);

  // The card has to be re-found after the click rather than held onto: the
  // control swaps the button out for the form when it opens, so a locator
  // that identifies the card *by* that button stops matching the moment it
  // is used. Both halves filter on the goal's own title, which is unique to
  // this run, so neither can wander onto somebody else's goal.
  const cardHaving = (inner: Locator) => page.locator("div").filter({ hasText: GOAL }).filter({ has: inner }).last();

  const putMoneyIn = page.getByRole("button", { name: /PUT MONEY IN/i });
  await expect(cardHaving(putMoneyIn), "the contribute control vanished once a person was named").toBeVisible();

  // And it is a working control, not just a button: opening it must offer an
  // account to pay from. An empty list is how this failed the first time --
  // GoalContributeControl renders nothing at all when handed one.
  await cardHaving(putMoneyIn).getByRole("button", { name: /PUT MONEY IN/i }).click();
  const openForm = cardHaving(page.getByLabel("Amount"));
  await expect(openForm.getByLabel("Amount")).toBeVisible();
  await expect(openForm, "the form opened without an account to pay from").toContainText(/FROM/i);
});

test("choosing who keeps the graph range you were looking at", async ({ page }) => {
  // Cash Flow carries two query params and one picker rewrites the other's.
  // `hrefFor` exists to preserve it; nothing said so if it stopped.
  await page.goto("/wealth?seg=cashflow&range=years", { waitUntil: "networkidle" });
  const menu = await openWho(page);
  const someone = menu.getByRole("menuitemradio").nth(1);
  await someone.click();

  await page.waitForURL((url) => new URL(url).searchParams.get("who") !== "all", { timeout: 30_000 });
  const params = new URL(page.url()).searchParams;
  expect(params.get("seg"), "the tab changed under us").toBe("cashflow");
  expect(params.get("range"), "the range was lost when who changed").toBe("years");
});
