import { test, expect, type Page } from "@playwright/test";
import { restAsQa, type Rest } from "./support/qa-household";
import { expandAllCollapsedGroups } from "./support/collapsible-groups";

/** Archive, Delete, Restore, the account number and the "include my private
 * accounts" switch on Wealth → Accounts, driven the way a person drives them.
 *
 * #438 made Delete refuse an account with history and offer Archive instead,
 * and gave archived accounts a list of their own to be restored from. #441
 * added an account number shown masked with Copy, and a switch that leaves
 * the viewer's own private accounts out of All's totals. Each piece has a
 * logic test or an RLS probe; none had been seen working in the app.
 *
 * The accounts are made through the ordinary API as the QA account -- the
 * add form is writes.spec's business -- and everything here is then done in
 * the browser. They carry a fixed prefix so the afterAll can find exactly
 * them (see tidyUpAfter for why it's fixed rather than per run), and the
 * sweep runs as the QA account, so row-level security keeps it inside the
 * throwaway household whatever this file gets wrong. The switch is put back
 * to whatever it was before the run. */

const FAMILY = "E2E-ACCT";
const RUN = `${FAMILY}-${Date.now().toString(36)}`;

type Me = { memberId: string; familyId: string; includePrivate: boolean };

async function me(rest: Rest): Promise<Me> {
  const user = await rest.ctx.get(`${rest.url}/auth/v1/user`, { headers: rest.headers });
  expect(user.ok(), "could not read the signed-in user").toBeTruthy();
  const { id } = (await user.json()) as { id: string };
  const res = await rest.ctx.get(`${rest.url}/rest/v1/members?select=id,family_id,wealth_include_private&auth_user_id=eq.${id}`, { headers: rest.headers });
  expect(res.ok(), `could not read the signed-in member: ${res.status()} ${await res.text()}`).toBeTruthy();
  const rows = (await res.json()) as { id: string; family_id: string; wealth_include_private: boolean }[];
  expect(rows.length, "the signed-in account has no member row").toBe(1);
  return { memberId: rows[0].id, familyId: rows[0].family_id, includePrivate: rows[0].wealth_include_private };
}

async function addAccount(rest: Rest, who: Me, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await rest.ctx.post(`${rest.url}/rest/v1/accounts`, {
    headers: { ...rest.headers, "Content-Type": "application/json", Prefer: "return=representation" },
    data: { family_id: who.familyId, name, account_type: "bank", opening_balance: 1000, is_joint: false, owner_member_id: who.memberId, is_private: false, created_by: who.memberId, ...extra },
  });
  expect(res.ok(), `could not add ${name}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { id: string }[])[0].id;
}

async function account(rest: Rest, id: string): Promise<{ is_archived: boolean } | null> {
  const res = await rest.ctx.get(`${rest.url}/rest/v1/accounts?select=is_archived&id=eq.${id}`, { headers: rest.headers });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { is_archived: boolean }[])[0] ?? null;
}

/** What the switch should move All by: the balance of every unarchived
 * private account in the login's own name (opening balance plus confirmed
 * movements, the way the app works it out). */
async function myPrivateBalance(rest: Rest, who: Me): Promise<number> {
  const res = await rest.ctx.get(
    `${rest.url}/rest/v1/accounts?select=id,opening_balance&owner_member_id=eq.${who.memberId}&is_private=eq.true&is_joint=eq.false&is_archived=eq.false`,
    { headers: rest.headers },
  );
  expect(res.ok()).toBeTruthy();
  const accounts = (await res.json()) as { id: string; opening_balance: number }[];
  if (accounts.length === 0) return 0;
  const moves = await rest.ctx.get(
    `${rest.url}/rest/v1/wealth_transactions?select=direction,amount&status=eq.confirmed&account_id=in.(${accounts.map((a) => a.id).join(",")})`,
    { headers: rest.headers },
  );
  expect(moves.ok()).toBeTruthy();
  const net = ((await moves.json()) as { direction: string; amount: number }[]).reduce((sum, m) => sum + (m.direction === "in" ? 1 : -1) * Number(m.amount), 0);
  return accounts.reduce((sum, a) => sum + Number(a.opening_balance), 0) + net;
}

/** The number under ALL ACCOUNTS · COMBINED, as a number. */
async function allHeroTotal(page: Page): Promise<number> {
  const amount = page.locator(".kin-eyebrow", { hasText: /^ALL ACCOUNTS · COMBINED$/ }).locator("xpath=following-sibling::div[1]/span[1]");
  const text = (await amount.textContent()) ?? "";
  const value = Number(text.replace(/[^0-9.-]/g, ""));
  expect(Number.isFinite(value), `the All hero reads "${text}"`).toBeTruthy();
  return value;
}

/** The innermost element holding both a link named for the account and a
 * button -- one row of a list, rather than the whole list around it. */
function rowFor(page: Page, name: string, button: string) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("link", { name: new RegExp(name) }) })
    .filter({ has: page.getByRole("button", { name: button, exact: true }) })
    .last();
}

test.describe("archiving, deleting and numbering an account", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  let rest: Rest;
  let who: Me;

  test.beforeAll(async () => {
    const r = await restAsQa();
    test.skip(!r, "Supabase details are not set.");
    rest = r!;
    who = await me(rest);
  });

  test.afterAll(async () => {
    if (!rest) return;
    try {
      const list = await rest.ctx.get(`${rest.url}/rest/v1/accounts?select=id&name=like.${encodeURIComponent(FAMILY)}*`, { headers: rest.headers });
      const ids = ((await list.json()) as { id: string }[]).map((a) => a.id);
      if (ids.length > 0) {
        const inList = `(${ids.join(",")})`;
        // Movements first: the ledger keeps an account from going while it
        // has history, which is the very rule test (a) is about.
        await rest.ctx.delete(`${rest.url}/rest/v1/wealth_transactions?account_id=in.${inList}`, { headers: rest.headers });
        await rest.ctx.delete(`${rest.url}/rest/v1/accounts?id=in.${inList}`, { headers: rest.headers });
      }
      await rest.ctx.patch(`${rest.url}/rest/v1/members?id=eq.${who.memberId}`, {
        headers: { ...rest.headers, "Content-Type": "application/json" },
        data: { wealth_include_private: who.includePrivate },
      });

      // A refused delete comes back 200; look again rather than trusting it.
      const left = await rest.ctx.get(`${rest.url}/rest/v1/accounts?select=id&name=like.${encodeURIComponent(FAMILY)}*`, { headers: rest.headers });
      expect((await left.json()) as unknown[], "accounts this run made are still in the throwaway household").toEqual([]);
      expect((await me(rest)).includePrivate, "the include-private switch was not put back").toBe(who.includePrivate);
    } finally {
      await rest.ctx.dispose();
    }
  });

  test("an account with a movement can't be deleted, is archived instead, and can be restored", async ({ page }) => {
    const name = `${RUN} has history`;
    const id = await addAccount(rest, who, name);
    const tx = await rest.ctx.post(`${rest.url}/rest/v1/wealth_transactions`, {
      headers: { ...rest.headers, "Content-Type": "application/json" },
      data: { family_id: who.familyId, account_id: id, direction: "in", amount: 50, particulars: `${RUN} deposit`, status: "confirmed", recorded_by: who.memberId },
    });
    expect(tx.ok(), `could not record a movement: ${tx.status()} ${await tx.text()}`).toBeTruthy();

    await page.goto(`/wealth/accounts/${id}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const sheet = page.getByRole("alertdialog");
    await expect(sheet).toContainText(`"${name}" can't be deleted`);
    await expect(sheet).toContainText("1 movement in its history");
    await sheet.getByRole("button", { name: "Archive instead" }).click();

    await page.waitForURL(/\/wealth\?seg=accounts/);
    await expect.poll(async () => (await account(rest, id))?.is_archived, { message: "Archive instead did not archive it" }).toBe(true);

    await page.goto("/wealth?seg=accounts&who=all", { waitUntil: "networkidle" });
    await expandAllCollapsedGroups(page);
    const archivedRow = rowFor(page, name, "Restore");
    await expect(archivedRow, "the archived account should be listed under ARCHIVED").toBeVisible();
    await archivedRow.getByRole("button", { name: "Restore", exact: true }).click();

    await expect.poll(async () => (await account(rest, id))?.is_archived, { message: "Restore did not bring it back" }).toBe(false);
    await page.reload({ waitUntil: "networkidle" });
    await expandAllCollapsedGroups(page);
    await expect(rowFor(page, name, "Archive"), "the restored account should be back among the accounts").toBeVisible();
    await expect(rowFor(page, name, "Restore")).toHaveCount(0);
  });

  test("an account with no movements can be deleted, and is gone", async ({ page }) => {
    const name = `${RUN} never used`;
    const id = await addAccount(rest, who, name);

    await page.goto(`/wealth/accounts/${id}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const sheet = page.getByRole("alertdialog");
    await expect(sheet).toContainText(`Delete "${name}"?`);
    await sheet.getByRole("button", { name: "Delete", exact: true }).click();

    await page.waitForURL(/\/wealth\?seg=accounts/);
    await expect.poll(async () => account(rest, id), { message: "the account is still in the database" }).toBeNull();
    await page.goto("/wealth?seg=accounts&who=all", { waitUntil: "networkidle" });
    await expandAllCollapsedGroups(page);
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("an account number set on your own account shows masked, with Copy", async ({ page }) => {
    const name = `${RUN} numbered`;
    const id = await addAccount(rest, who, name, { is_private: true });

    await page.goto(`/wealth/accounts/${id}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Edit account" }).click();
    await page.locator('input[name="account_number"]').fill("1234 5678 9012");
    await page.getByRole("button", { name: "Save" }).click();

    // Saving redirects back to this page with the form closed. Waiting for
    // that, not for the network to go quiet, is what says the save is done.
    await expect(page.getByRole("button", { name: "Edit account" })).toBeVisible({ timeout: 30_000 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("•••• 9012", { exact: true })).toBeVisible();
    await expect(page.getByText("1234 5678 9012")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Show account number" }).click();
    await expect(page.getByText("1234 5678 9012", { exact: true })).toBeVisible();
  });

  test("Include my private accounts in All totals moves the All total by my private accounts' balance", async ({ page }) => {
    await addAccount(rest, who, `${RUN} private`, { is_private: true, opening_balance: 12_345 });
    // The switch moves every private account of mine, not only this one:
    // the QA household already has a private e-wallet of the login's.
    const balance = await myPrivateBalance(rest, who);
    expect(balance).toBeGreaterThanOrEqual(12_345);

    await page.goto("/wealth?seg=accounts&who=all", { waitUntil: "networkidle" });
    const toggle = page.getByLabel("Include my private accounts in All totals");
    const startedOn = await toggle.isChecked();
    const before = await allHeroTotal(page);

    await toggle.click();
    await expect(toggle).toBeChecked({ checked: !startedOn });
    await expect
      .poll(() => allHeroTotal(page), { message: "the All total should move by the private account's balance" })
      .toBeCloseTo(startedOn ? before - balance : before + balance, 2);

    await toggle.click();
    await expect(toggle).toBeChecked({ checked: startedOn });
    await expect.poll(() => allHeroTotal(page)).toBeCloseTo(before, 2);
  });
});
