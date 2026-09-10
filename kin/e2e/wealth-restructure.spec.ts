import { test, expect, request as playwrightRequest } from "@playwright/test";

/** The Wealth tab after it was rearranged, driven in a browser.
 *
 * On 10 September #37 and #40 moved most of this tab around: Cash Flow's
 * Graph, Income and Expenses became collapsible groups, the graph range
 * picker gained Days, the budget ceiling and the personal target moved off
 * Accounts and under the Cash Flow group each is measured against, and
 * Accounts lost its IN/OUT/NET summary to the same move.
 *
 * The pure parts of that are pinned in cash-flow-ranges.logic.spec.ts, and
 * they were pinned well. What no test looked at is whether the page is
 * actually wired to any of it -- and a move is precisely where a control goes
 * missing, because nothing fails to compile when a form ends up on a tab
 * nobody opens. The same gap of one layer up from a tested function is what
 * put a red tick on main this morning.
 *
 * Everything here only reads. No rows are written, so there is nothing to
 * tidy up and nothing another machine's run can collide with.
 */

async function whoAmI() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  test.skip(!url || !key || !process.env.E2E_EMAIL, "Supabase details are not set.");
  const ctx = await playwrightRequest.newContext();
  try {
    const auth = await ctx.post(`${url}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key!, "Content-Type": "application/json" },
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(auth.ok(), "could not sign the throwaway account in").toBeTruthy();
    const session = await auth.json();
    // The member row is the one carrying this login. Managed children have no
    // auth_user_id at all, so this cannot accidentally scope to one of them.
    const me = await ctx.get(`${url}/rest/v1/members?select=id&auth_user_id=eq.${session.user.id}`, {
      headers: { apikey: key!, Authorization: `Bearer ${session.access_token}` },
    });
    expect(me.ok(), `could not read the signed-in member: ${me.status()} ${await me.text()}`).toBeTruthy();
    const rows = (await me.json()) as { id: string }[];
    expect(rows.length, "the signed-in account has no member row in this household").toBe(1);
    return rows[0].id;
  } finally {
    await ctx.dispose();
  }
}

test("the graph range picker offers Days, and choosing it regroups the strip", async ({ page }) => {
  // "day" was added to CASH_FLOW_RANGES on 10 September. The function knows
  // about it; this is whether the page hands it to anybody.
  await page.goto("/wealth?seg=cashflow&who=all", { waitUntil: "networkidle" });

  // Months is the default, and the strip is titled after whatever is picked.
  await expect(page.getByText("BY MONTHS", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Choose graph range" }).click();
  await page.getByRole("menuitemradio", { name: "Days", exact: true }).click();
  await page.waitForURL(/range=day/);

  await expect(page.getByText("BY DAYS", { exact: true }), "the strip should regroup, not just change the label").toBeVisible();
  await expect(page.getByText(/grouped by days/i)).toBeVisible();
});

test("Accounts kept a range picker of its own", async ({ page }) => {
  // Accounts lost the IN/OUT/NET row to Cash Flow but deliberately kept its
  // own range picker and history graph. Losing both would have been easy to
  // do by accident and hard to notice.
  await page.goto("/wealth?seg=accounts&who=all", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Choose graph range" }).click();
  await page.getByRole("menuitemradio", { name: "Days", exact: true }).click();
  await page.waitForURL(/seg=accounts.*range=day|range=day.*seg=accounts/);
  await expect(page.getByText("BY DAYS", { exact: true })).toBeVisible();
  await expect(page.getByText(/money in against money out, grouped by days/i)).toBeVisible();
});

test("the budget ceiling moved to Cash Flow, under the spend it caps", async ({ page }) => {
  // It used to be on Accounts. The point of the move is that the control sits
  // next to the number it governs, so both halves are checked: it is here,
  // and it is inside EXPENSES rather than merely somewhere on the page.
  await page.goto("/wealth?seg=cashflow&who=all", { waitUntil: "networkidle" });

  await expect(page.getByText("SPENT OF BUDGET")).toBeVisible();
  await expect(page.getByRole("button", { name: "SET BUDGET" })).toBeVisible();

  // Collapsing EXPENSES should take the budget control with it -- which is
  // what proves it is in that group rather than sitting after it.
  await page.getByRole("button", { name: "EXPENSES", exact: true }).click();
  await expect(page.getByRole("button", { name: "SET BUDGET" })).toBeHidden();

  await expect(page.getByRole("button", { name: "SET BUDGET" }).or(page.getByText("SPENT OF BUDGET"))).toHaveCount(0);
});

test("the personal target moved to Cash Flow, under the income it measures", async ({ page }) => {
  const me = await whoAmI();
  await page.goto(`/wealth?seg=cashflow&who=${me}`, { waitUntil: "networkidle" });

  await expect(page.getByText("EARNED OF TARGET")).toBeVisible();
  await expect(page.getByRole("button", { name: "SET TARGET" })).toBeVisible();

  await page.getByRole("button", { name: "INCOME", exact: true }).click();
  await expect(page.getByRole("button", { name: "SET TARGET" })).toBeHidden();
});

test("Accounts no longer carries the IN/OUT/NET summary", async ({ page }) => {
  // The other half of the move. If FlowRow had been left on both tabs the
  // same number would be stated twice, from two different queries -- which is
  // how two screens start disagreeing about the same month.
  await page.goto("/wealth?seg=cashflow&who=all", { waitUntil: "networkidle" });
  const onCashFlow = page.getByText("NET", { exact: true });
  await expect(onCashFlow, "the summary should be on Cash Flow now").toHaveCount(1);

  await page.goto("/wealth?seg=accounts&who=all", { waitUntil: "networkidle" });
  await expect(page.getByText("NET", { exact: true }), "and gone from Accounts").toHaveCount(0);
});

test("a collapsed group stays out of the way and comes back", async ({ page }) => {
  await page.goto("/wealth?seg=cashflow&who=all", { waitUntil: "networkidle" });
  const graph = page.getByRole("button", { name: "GRAPH", exact: true });

  // Open by default: nothing that used to be visible collapses on first load.
  await expect(graph).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Choose graph range" })).toBeVisible();

  await graph.click();
  await expect(graph).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Choose graph range" })).toBeHidden();

  await graph.click();
  await expect(graph).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Choose graph range" })).toBeVisible();
});
