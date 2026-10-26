import { test, expect, type Page } from "@playwright/test";
import { restAsQa, type Rest } from "./support/qa-household";
import { expandAllCollapsedGroups } from "./support/collapsible-groups";

/** The features shipped 14-19 October, each used once the way a grown-up in
 * the sample household would, on dev. smoke.spec.ts proves these screens
 * load; this proves they do what they say -- and, being write-heavy, it runs
 * in weekly-check.yml, not on every pull request.
 *
 * Every row a test makes carries this run's id and is deleted again before
 * the test ends, then looked for once more: none of these tables are swept by
 * tidyUpAfter, and a refused delete still answers 200.
 *
 * What a browser on dev cannot prove -- the helper accepting their link, a
 * trusted relative in another household asking for the vault, a share sheet,
 * a printed year book -- is listed in docs/BACKLOG.md for the weekly check on
 * a real iPhone. */

/** Rows are named after this run; tidy-ups match the fixed prefix, so a run
 * that died before its own tidy-up is swept by the next one (writes.spec's
 * habit too). */
const PREFIX = "E2EWK";
const RUN = `${PREFIX}${Date.now().toString(36)}`;

/** A REST session as the sample household for each test, disposed with it,
 * for the tidy-up. RLS-bound like the browser; no service key. */
let rest: Rest | null = null;
test.beforeEach(async () => {
  rest = await restAsQa();
});
test.afterEach(async () => {
  await rest?.ctx.dispose();
  rest = null;
});

/** Deletes what `query` finds in `table`, then proves it is gone. `key` is a
 * column the table has, for the second look (alkansya_plans has no id). */
async function removeRows(table: string, query: string, key = "id") {
  if (!rest) return;
  await rest.ctx.delete(`${rest.url}/rest/v1/${table}?${query}`, { headers: rest.headers });
  const left = await rest.ctx.get(`${rest.url}/rest/v1/${table}?${query}&select=${key}`, { headers: rest.headers });
  expect(await left.json(), `${table} rows from this run are still in the sample household`).toEqual([]);
}

async function onPlus(page: Page) {
  return !(await page.getByText("is part of Kin Plus").first().isVisible());
}

test("utang: lend, get paid back in full, settled", async ({ page }) => {
  test.skip(!rest, "No Supabase details -- see kin/e2e/README.md.");
  const who = `Tita ${RUN}`;
  try {
    await page.goto("/wealth/utang", { waitUntil: "networkidle" });
    test.skip(!(await onPlus(page)), "the sample household is not on Kin Plus");
    await page.getByRole("button", { name: "Record an IOU" }).click();
    await page.getByRole("radio", { name: "We lent" }).check();
    await page.getByLabel("Lent to").fill(who);
    await page.getByLabel("How much").fill("1500");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const payButton = page.getByRole("button", { name: "Record a payment" });
    const row = page.locator("div").filter({ hasText: `${who} owes us` }).filter({ has: payButton }).last();
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Record a payment" }).click();
    await page.getByLabel(/^Paid/).fill("1500");
    await page.getByRole("button", { name: "Save payment" }).click();
    await expect(page.locator("body")).toContainText("Settled");
  } finally {
    await removeRows("utang_entries", `person_name=like.*${PREFIX}*`);
  }
});

test("paluwagan: start one, mark our hulog paid for round 1", async ({ page }) => {
  test.skip(!rest, "No Supabase details -- see kin/e2e/README.md.");
  const name = `${RUN} paluwagan`;
  try {
    await page.goto("/wealth/utang", { waitUntil: "networkidle" });
    test.skip(!(await onPlus(page)), "the sample household is not on Kin Plus");
    await page.getByRole("button", { name: "Add a savings circle" }).click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Contribution per member, each round").fill("1000");
    await page.getByLabel("The other members, one per line, in turn order").fill("Ate Joy\nKuya Ben");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/wealth\/paluwagan\//);
    await expect(page.locator("body")).toContainText(name);

    const us = page.getByRole("button", { name: "Us", exact: true }).first();
    await us.click();
    await expect(page.getByRole("button", { name: "✓ Us" }).first()).toHaveAttribute("aria-pressed", "true");
  } finally {
    await removeRows("paluwagan_groups", `name=like.${PREFIX}*`);
  }
});

test("alkansya: money in, money out, the line taken off again", async ({ page }) => {
  test.skip(!rest, "No Supabase details -- see kin/e2e/README.md.");
  const note = `${RUN} pamasko`;
  try {
    await page.goto("/planner/alkansya", { waitUntil: "networkidle" });
    const child = page.locator('a[href^="/planner/alkansya/"]').first();
    test.skip((await child.count()) === 0, "the sample household has no children");
    await child.click();
    await page.waitForURL(/\/planner\/alkansya\/.+/);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /piggy bank/i })).toBeVisible();

    // The jars open once a plan exists ("Add money" waits for one). A child
    // without one gets a ₱100 weekly baon, and keeps it: a plan is paused,
    // never deleted (alkansya_plans has no delete policy), so the sample
    // child simply has one from the first run on.
    if (!(await page.getByRole("button", { name: "Add money" }).isVisible())) {
      await page.getByRole("textbox", { name: "Weekly allowance" }).fill("100");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("button", { name: "Add money" })).toBeVisible();
    }

    await page.getByRole("button", { name: "Add money" }).click();
    await page.getByLabel("How much").fill("200");
    await page.getByLabel("From (optional)").fill(note);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("body")).toContainText(note);

    await page.getByRole("button", { name: "Spend or give" }).click();
    await page.getByLabel("How much").fill("50");
    await page.getByLabel("What for (optional)").fill(`${RUN} merienda`);
    await page.getByRole("button", { name: "Take out" }).click();
    await expect(page.locator("body")).toContainText(`${RUN} merienda`);
  } finally {
    await removeRows("alkansya_entries", `note=like.*${PREFIX}*`);
  }
});

test("statement import: a BPI CSV becomes three transactions, and only once", async ({ page }) => {
  test.skip(!rest, "No Supabase details -- see kin/e2e/README.md.");
  const name = `${RUN} import test`;
  let accountId: string | undefined;
  try {
    await page.goto("/wealth?seg=accounts", { waitUntil: "networkidle" });
    test.skip(!(await onPlus(page)), "the sample household is not on Kin Plus");
    await page.getByRole("button", { name: /^\+ ADD ACCOUNT$/i }).click();
    await page.getByLabel("Account name").fill(name);
    await page.getByRole("button", { name: "Save account" }).click();
    await page.waitForURL(/new=/);
    await expandAllCollapsedGroups(page);
    const href = await page.locator('a[href^="/wealth/accounts/"]').filter({ hasText: name }).first().getAttribute("href");
    accountId = href?.split("/").pop()?.split("?")[0];
    expect(accountId, "the new account is listed").toBeTruthy();

    const csv = [
      "Account Name,E2E TESTER",
      "",
      "Transaction Date,Check Number,Description,Debit,Credit,Running Balance",
      `10/01/2026,,"${RUN} SM SUPERMARKET",1250.75,,48749.25`,
      `10/02/2026,,${RUN} PAYROLL,,"25,000.00","73,749.25"`,
      `10/03/2026,,${RUN} INSTAPAY FEE,25.00,,"73,724.25"`,
    ].join("\n");
    const importOnce = async () => {
      await page.goto(`/wealth/accounts/${accountId}/import`, { waitUntil: "networkidle" });
      await page.getByLabel("Whose statement").selectOption({ label: "BPI" });
      await page.getByLabel("The CSV or PDF file").setInputFiles({ name: "bpi.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
      await page.getByRole("button", { name: "Review the lines" }).click();
    };

    await importOnce();
    await page.getByRole("button", { name: /^Import 3 lines$/ }).click();
    await expect(page.locator("body")).toContainText("3 lines imported");

    // The same file again: every line is recognised, nothing doubles.
    await importOnce();
    await expect(page.getByText("ALREADY IN", { exact: false }).first()).toBeVisible();
  } finally {
    await removeRows("wealth_transactions", `particulars=like.*${PREFIX}*`);
    await removeRows("accounts", `name=like.${PREFIX}*`);
  }
});

test("helper access: a link is made for the helper, then taken back", async ({ page }) => {
  test.skip(!rest, "No Supabase details -- see kin/e2e/README.md.");
  const name = `Ate ${RUN}`;
  try {
    await page.goto("/settings/household", { waitUntil: "networkidle" });
    await page.getByLabel("Helper's name").fill(name);
    await page.getByRole("button", { name: "Make a helper link" }).click();
    await expect(page.getByText("Send this to your helper.")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.locator("body")).toContainText("Link not used yet");

    await page.getByRole("button", { name: `Remove ${name}` }).click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.isVisible()) await confirm.getByRole("button", { name: /remove/i }).click();
    await expect(page.locator("body")).not.toContainText(name);
  } finally {
    // A helper is never deleted, only marked removed (remove_helper), so
    // "gone" here means no live row left under this run's name.
    if (rest) {
      const live = `display_name=like.*${PREFIX}*&removed_at=is.null&select=id`;
      for (const { id } of await (await rest.ctx.get(`${rest.url}/rest/v1/household_helpers?${live}`, { headers: rest.headers })).json()) {
        await rest.ctx.post(`${rest.url}/rest/v1/rpc/remove_helper`, { headers: rest.headers, data: { p_helper: id } });
      }
      const left = await rest.ctx.get(`${rest.url}/rest/v1/household_helpers?${live}`, { headers: rest.headers });
      expect(await left.json(), "a helper from this run is still live in the sample household").toEqual([]);
    }
  }
});

test("vault emergency access: the card says who can be named", async ({ page }) => {
  await page.goto("/settings/privacy", { waitUntil: "networkidle" });
  const card = page.locator("section, div").filter({ hasText: "Emergency access" }).last();
  await expect(card).toBeVisible();
  // The sample household is linked to no other household, so nobody can be
  // named; naming and asking need a second, linked household (BACKLOG.md).
  await expect(page.locator("body")).toContainText(/Nobody to choose yet|Trusted person|part of Kin Plus|Unlock/);
});

test("stories on the tree: a story kept with a person", async ({ page }) => {
  test.skip(!rest, "No Supabase details -- see kin/e2e/README.md.");
  const title = `${RUN} how we came to Manila`;
  try {
    await page.goto("/family?seg=tree", { waitUntil: "networkidle" });
    // An empty tree starts with whoever opens it. The sample login stays on
    // the tree afterwards, as a person would -- the tree is the household's.
    const addMe = page.getByRole("button", { name: /add me to the tree/i });
    if (await addMe.isVisible()) {
      await addMe.click();
      await page.waitForLoadState("networkidle");
    }
    const me = page.getByRole("button", { name: /, you/ }).first();
    await expect(me, "the sample household's login is on the tree").toBeVisible();
    await me.click();
    await page.locator('a[href^="/family/stories/"]').first().click();
    await page.waitForURL(/\/family\/stories\//);

    await page.getByRole("button", { name: /^Add a story about/ }).click();
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("The story, written down").fill("Sakay ng barko, 1975.");
    await page.getByRole("button", { name: "Keep this story" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  } finally {
    await removeRows("tree_person_stories", `title=like.${PREFIX}*`);
  }
});

test('chat "To buy": a written list in a message goes on the To-Buy list', async ({ page }) => {
  test.slow(); // send, menu, sheet, the list, back to unsend: five round trips
  test.skip(!rest, "No Supabase details -- see kin/e2e/README.md.");
  const items = [`${RUN} rice 2kg`, `${RUN} eggs`];
  try {
    await page.goto("/chat/household", { waitUntil: "networkidle" });
    await page.locator("textarea.kin-composer-field").fill(items.map((i) => `- ${i}`).join("\n"));
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const bubble = page.locator("button.kin-bubble").filter({ hasText: items[1] }).last();
    await expect(bubble).toBeVisible();

    await bubble.click();
    await page.getByRole("button", { name: "To buy" }).click();
    await expect(page.getByRole("heading", { name: "Add to the To-Buy list" })).toBeVisible();
    await page.getByRole("button", { name: "Add 2 things" }).click();
    await expect(page.getByText(/Added 2 things to the To-Buy list/)).toBeVisible();

    // On the list itself: read back as the household, the way /household
    // reads it (its groups start collapsed, so the page text would not say).
    const onList = await rest!.ctx.get(`${rest!.url}/rest/v1/buy_items?name=like.*${RUN}*&select=name`, { headers: rest!.headers });
    expect((await onList.json()).length, "both things are on the To-Buy list").toBe(2);

    // Messages are never deleted, only unsent -- by their writer, the way the
    // menu does it -- so that is how this one leaves the room.
    await page.goto("/chat/household", { waitUntil: "networkidle" });
    await page.locator("button.kin-bubble").filter({ hasText: items[1] }).last().click();
    await page.getByRole("button", { name: /^Unsend/ }).click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.isVisible()) await confirm.getByRole("button", { name: /unsend/i }).click();
    await expect(page.locator("button.kin-bubble").filter({ hasText: items[1] })).toHaveCount(0);
  } finally {
    await removeRows("buy_items", `name=like.*${PREFIX}*`);
  }
});

test("password health: two entries sharing a weak password are both flagged", async ({ page }) => {
  test.skip(!rest, "No Supabase details -- see kin/e2e/README.md.");
  try {
    await page.goto("/family?seg=documents&tab=passwords", { waitUntil: "networkidle" });
    test.skip(await page.getByRole("button", { name: "Unlock" }).isVisible(), "the vault is locked behind a PIN");
    for (const label of [`${RUN} gate`, `${RUN} wifi`]) {
      await page.getByRole("button", { name: /^\+ ADD A PASSWORD$/i }).click();
      await page.getByLabel("Group").fill(RUN);
      await page.getByLabel("Name", { exact: true }).fill(label);
      await page.getByLabel("Password or code").fill("aaaaaa");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.locator("body")).toContainText(label);
    }
    const health = page.getByLabel("Password health");
    await expect(health).toContainText(/are worth changing/);
    await expect(page.locator("body")).toContainText(`Also used for ${RUN}`);
  } finally {
    await removeRows("family_vault_items", `label=like.*${PREFIX}*`);
  }
});

test("sinking fund: a yearly cost says what to set aside each payday", async ({ page }) => {
  test.skip(!rest, "No Supabase details -- see kin/e2e/README.md.");
  const title = `${RUN} car registration`;
  try {
    await page.goto("/wealth/add", { waitUntil: "networkidle" });
    test.skip(!(await onPlus(page)), "the sample household is not on Kin Plus");
    await page.getByRole("button", { name: "Every year" }).click();
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Target amount (₱)").fill("12000");
    const due = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
    await page.getByLabel("Next due").fill(due);
    await page.getByRole("button", { name: "Save goal" }).click();
    await page.waitForURL(/seg=assets/);
    await expandAllCollapsedGroups(page);
    await expect(page.locator("body")).toContainText(title);
    await expect(page.locator("body")).toContainText(/Set aside ₱[\d,.]+ a payday/);
  } finally {
    await removeRows("goals", `title=like.${PREFIX}*`);
  }
});
