import { test, expect, request as playwrightRequest } from "@playwright/test";

/** LINK APP: the field, its one-tap chip, and its TEST button.
 *
 * The point of the control is that a member can find out whether a link
 * actually opens the app BEFORE saving it, rather than discovering it at the
 * moment they are trying to pay somebody. So the two things worth pinning are
 * that the chip fills in a link known to be correct, and that TEST is offered
 * exactly when there is something to test.
 *
 * TEST is deliberately never clicked here. It calls `window.open` on whatever
 * is typed -- that is the whole feature -- and a spec that clicked it would be
 * asking a headless browser to hand `gcash://` to an operating system that has
 * no GCash on it. What the button does when pressed is the browser's job; what
 * this can check is that it is enabled only when pressing it would mean
 * something.
 *
 * The last test is the one that matters most and is the least obvious: that
 * what a member typed is what the account ends up carrying. The field's value
 * is React state, not the DOM's own, and posts under `linked_app_url` -- a
 * rename on either side would leave the form looking perfectly correct and
 * quietly save nothing.
 */

const RUN = `E2E-LINKAPP-${Date.now().toString(36)}`;
const ACCOUNT = `${RUN} wallet`;
const TYPED_LINK = "https://example.invalid/pay";

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
  const token = (await auth.json()).access_token;
  return { ctx, url: url!, headers: { apikey: key!, Authorization: `Bearer ${token}` } };
}

test.afterAll(async () => {
  const { ctx, url, headers } = await api();
  try {
    await ctx.delete(`${url}/rest/v1/accounts?name=eq.${encodeURIComponent(ACCOUNT)}`, { headers });
    const left = await ctx.get(`${url}/rest/v1/accounts?select=id&name=eq.${encodeURIComponent(ACCOUNT)}`, { headers });
    expect(await left.json(), "the probe account survived the tidy-up").toEqual([]);
  } finally {
    await ctx.dispose();
  }
});

/** Opens the add-account form on the Accounts tab. It is collapsed behind a
 * button until asked for, and only offered where opening an account in your
 * own name is what you would mean. */
async function openAddAccount(page: import("@playwright/test").Page) {
  await page.goto("/wealth?seg=accounts&who=all", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^\+ ADD ACCOUNT$/i }).first().click();
  await expect(page.getByLabel("LINK APP")).toBeVisible();
}

test("TEST is offered only when there is something to test", async ({ page }) => {
  await openAddAccount(page);
  const field = page.getByLabel("LINK APP");
  const testButton = page.getByRole("button", { name: /^TEST$/ });

  await expect(testButton, "an empty field has nothing to open").toBeDisabled();

  // Whitespace is not something to test either -- the button trims before it
  // opens, so a field of spaces would otherwise offer to open "".
  await field.fill("   ");
  await expect(testButton, "a field of spaces has nothing to open either").toBeDisabled();

  await field.fill("gcash://");
  await expect(testButton).toBeEnabled();

  await field.fill("");
  await expect(testButton, "clearing the field should put the button back to sleep").toBeDisabled();
});

test("the GCash chip fills the link without anybody typing it", async ({ page }) => {
  await openAddAccount(page);
  const field = page.getByLabel("LINK APP");
  const chip = page.getByRole("button", { name: "GCash" });

  await expect(field).toHaveValue("");
  await chip.click();
  // The exact scheme matters -- it is the one link in the app verified
  // against a vendor's own documentation rather than guessed at.
  await expect(field).toHaveValue("gcash://");
  await expect(page.getByRole("button", { name: /^TEST$/ })).toBeEnabled();
});

test("the chip shows whether it is what the field currently holds", async ({ page }) => {
  await openAddAccount(page);
  const field = page.getByLabel("LINK APP");
  const chip = page.getByRole("button", { name: "GCash" });

  await expect(chip).toHaveAttribute("data-active", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("data-active", "true");

  // Typing something else must drop the mark. A chip that stayed lit while
  // the field said something different would be telling a member their
  // account points at GCash when it does not.
  await field.fill("https://example.invalid/somewhere");
  await expect(chip).toHaveAttribute("data-active", "false");
});

test("what was typed is what the account is saved with", async ({ page }) => {
  await openAddAccount(page);
  await page.locator('input[name="name"]').first().fill(ACCOUNT);
  await page.getByLabel("LINK APP").fill(TYPED_LINK);
  await page.getByRole("button", { name: /^SAVE ACCOUNT$/i }).click();

  // Wait for the account itself rather than for the network to go quiet: a
  // click landing before hydration does nothing at all, and `networkidle` is
  // perfectly happy with that.
  await expect(page.locator("body")).toContainText(ACCOUNT, { timeout: 30_000 });

  const { ctx, url, headers } = await api();
  try {
    const res = await ctx.get(
      `${url}/rest/v1/accounts?select=name,linked_app_url&name=eq.${encodeURIComponent(ACCOUNT)}`,
      { headers },
    );
    const rows: { name: string; linked_app_url: string | null }[] = await res.json();
    expect(rows.length, "the account was not saved at all").toBe(1);
    expect(rows[0].linked_app_url, "the link typed into LINK APP did not reach the account").toBe(TYPED_LINK);
  } finally {
    await ctx.dispose();
  }
});
