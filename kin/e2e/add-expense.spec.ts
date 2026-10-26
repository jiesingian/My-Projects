import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";
import { familyDay } from "@/lib/time";
import { expandAllCollapsedGroups } from "./support/collapsible-groups";

/** The Add expense sheet (#996, #1001), driven in the app as the signed-in
 * household: "Already paid" lands in the ledger confirmed, on the day, out
 * of the account; "Due later" makes a bill dated today out of the account,
 * its line asks whether it went through, and Settle marks it paid with the
 * payment tied to it. What a person sees and what lands in the database,
 * both -- a sheet that closes is not the same as a row that exists.
 *
 * Writes, so it is not in the post-merge smoke on shared dev: it runs on
 * every pull request in smoke-private-db (a database that exists for one
 * run, e2e.yml) and in the weekly tier. Everything it makes is named with
 * RUN and removed afterwards, the account it adds included. */

const RUN = `E2E-EXPENSE-${Date.now().toString(36)}`;
const LUNCH = 123;
const TUITION = 456;

type Entry = { id: string; particulars: string; amount: string; status: string; account_id: string; occurred_at: string; source_table: string | null; source_id: string | null };
type Bill = { id: string; name: string; amount: string; due_date: string | null; status: string; account_id: string | null; transaction_id: string | null; recurrence: string | null };

let session: { url: string; headers: Record<string, string>; familyId: string; memberId: string; tz: string } | null = null;
let accountId = "";

async function api() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  test.skip(!url || !key || !process.env.E2E_EMAIL, "Supabase details are not set; cannot check what was added.");
  const ctx = await playwrightRequest.newContext();
  if (!session) {
    const auth = await ctx.post(`${url}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key!, "Content-Type": "application/json" },
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(auth.ok(), "could not sign the sample account in").toBeTruthy();
    const { access_token, user } = await auth.json();
    const headers = { apikey: key!, Authorization: `Bearer ${access_token}` };
    const me = await ctx.get(`${url}/rest/v1/members?auth_user_id=eq.${user.id}&select=id,family_id,families(time_zone)`, { headers });
    const [row] = (await me.json()) as { id: string; family_id: string; families: { time_zone: string | null } }[];
    session = { url: url!, headers, familyId: row.family_id, memberId: row.id, tz: row.families?.time_zone || "Asia/Manila" };
  }
  return { ctx, ...session };
}

const today = () => familyDay(new Date(), session?.tz ?? "Asia/Manila");

async function rows<T>(table: string, query: string): Promise<T[]> {
  const { ctx, url, headers } = await api();
  try {
    const res = await ctx.get(`${url}/rest/v1/${table}?${query}`, { headers });
    expect(res.ok(), `could not read ${table}: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T[];
  } finally {
    await ctx.dispose();
  }
}

async function remove(table: string, query: string) {
  const { ctx, url, headers } = await api();
  try {
    const res = await ctx.delete(`${url}/rest/v1/${table}?${query}`, { headers });
    expect(res.ok(), `the test ${table} were left in the household: ${await res.text()}`).toBeTruthy();
  } finally {
    await ctx.dispose();
  }
}

/** Cash Flow with Expenses open and every fold opened, the sheet raised. */
async function openSheet(page: Page) {
  await page.goto("/wealth?seg=cashflow&open=expenses");
  await expandAllCollapsedGroups(page);
  await page.getByRole("button", { name: /ADD EXPENSE/ }).click();
  await expect(addSheet(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Already paid" })).toBeVisible();
}

/** The Add expense sheet itself. Saved = the sheet gone, not the Save
 * button gone: while the action runs the button reads "…", so a check on
 * the button's name alone passed before the row had landed (first run,
 * 26 October). */
const addSheet = (page: Page) => page.getByRole("dialog", { name: "Add expense" });

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Its own account, joint so any grown-up sees it: the private database's
  // household starts with none, and "Already paid" needs one.
  const { ctx, url, headers, familyId, memberId } = await api();
  try {
    const res = await ctx.post(`${url}/rest/v1/accounts`, {
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      data: { family_id: familyId, name: `${RUN} wallet`, account_type: "ewallet", opening_balance: 5000, is_joint: true, created_by: memberId },
    });
    expect(res.ok(), `could not add the test account: ${await res.text()}`).toBeTruthy();
    accountId = ((await res.json()) as { id: string }[])[0].id;
  } finally {
    await ctx.dispose();
  }
});

test.afterAll(async () => {
  if (!session) return;
  await remove("wealth_transactions", `particulars=like.${encodeURIComponent(`${RUN}*`)}`);
  await remove("bills", `name=like.${encodeURIComponent(`${RUN}*`)}`);
  if (accountId) await remove("accounts", `id=eq.${accountId}`);
});

test("Already paid lands in the ledger, confirmed, on the day, out of the account", async ({ page }) => {
  await openSheet(page);
  // The sheet opens on "Already paid", with today in Paid on.
  await expect(page.getByRole("button", { name: "Already paid" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('input[name="occurred_on"]')).toHaveValue(today());
  await page.getByLabel("What it's for").fill(`${RUN} lunch`);
  await page.getByLabel(/^Amount/).fill(String(LUNCH));
  await page.getByLabel("Paid from").selectOption(accountId);
  await page.getByRole("button", { name: "Save expense" }).click();
  // Saved: the sheet closes.
  await expect(addSheet(page)).toBeHidden();

  const entries = await rows<Entry>("wealth_transactions", `select=id,particulars,amount,status,account_id,occurred_at,source_table,source_id&particulars=eq.${encodeURIComponent(`${RUN} lunch`)}`);
  expect(entries, "one entry, no more").toHaveLength(1);
  expect(Number(entries[0].amount)).toBe(LUNCH);
  expect(entries[0].status).toBe("confirmed");
  expect(entries[0].account_id).toBe(accountId);
  expect(entries[0].source_table).toBeNull();
  expect(familyDay(new Date(entries[0].occurred_at), session!.tz)).toBe(today());

  // On its line under Spending by person: "<category> - <name>".
  await page.goto("/wealth?seg=cashflow&open=expenses");
  await expandAllCollapsedGroups(page);
  await expect(page.getByText(new RegExp(`^Groceries - ${RUN} lunch`)).first()).toBeVisible();
});

test("Due later makes a bill dated today out of the account, asking on its day; Settle marks it paid", async ({ page }) => {
  await openSheet(page);
  await page.getByRole("button", { name: "Due later" }).click();
  await expect(page.getByRole("button", { name: "Due later" })).toHaveAttribute("aria-pressed", "true");
  // Required, and starting on today.
  await expect(page.locator('input[name="due_date"]')).toHaveValue(today());
  await expect(page.locator('input[name="due_date"]')).toHaveAttribute("required", "");
  // Remind me is a bill's question, not an expense already paid.
  await expect(page.getByLabel("Remind me")).toBeVisible();
  await page.getByLabel("What it's for").fill(`${RUN} tuition`);
  await page.getByLabel(/^Amount/).fill(String(TUITION));
  await page.getByLabel("Paid from").selectOption(accountId);
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(addSheet(page)).toBeHidden();

  const bills = await rows<Bill>("bills", `select=id,name,amount,due_date,status,account_id,transaction_id,recurrence&name=eq.${encodeURIComponent(`${RUN} tuition`)}`);
  expect(bills, "one bill, no more").toHaveLength(1);
  const bill = bills[0];
  expect(Number(bill.amount)).toBe(TUITION);
  expect(bill.due_date?.slice(0, 10)).toBe(today());
  expect(bill.status).toBe("unpaid");
  expect(bill.account_id).toBe(accountId);
  expect(bill.recurrence).toBe("monthly");
  // Nothing moved yet.
  expect(await rows<Entry>("wealth_transactions", `select=id&particulars=eq.${encodeURIComponent(`${RUN} tuition bill`)}`)).toHaveLength(0);

  // Its day come, the line asks; Settle opens on that question, with the
  // bill's own account, and Mark paid settles it.
  await page.goto(`/wealth?seg=cashflow&open=expenses&bill=${bill.id}`);
  await expandAllCollapsedGroups(page);
  const line = page.getByText(new RegExp(`^Bills & utilities - ${RUN} tuition`)).first();
  await expect(line).toBeVisible();
  await expect(page.getByText(/Due today .*did it go through\?/).first()).toBeVisible();
  // Arrived from the bill's link, the sheet is already open on the question.
  const sheet = page.getByRole("dialog", { name: "Did it go through?" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Pay from")).toHaveValue(accountId);
  await sheet.getByRole("button", { name: "Mark paid" }).click();
  await expect(sheet).toBeHidden();

  const [paid] = await rows<Bill>("bills", `select=id,name,amount,due_date,status,account_id,transaction_id,recurrence&id=eq.${bill.id}`);
  expect(paid.status).toBe("paid");
  expect(paid.transaction_id).not.toBeNull();
  const payments = await rows<Entry>("wealth_transactions", `select=id,particulars,amount,status,account_id,occurred_at,source_table,source_id&id=eq.${paid.transaction_id}`);
  expect(payments).toHaveLength(1);
  expect(Number(payments[0].amount)).toBe(TUITION);
  expect(payments[0].status).toBe("confirmed");
  expect(payments[0].account_id).toBe(accountId);
  expect(payments[0].source_table).toBe("bills");
  expect(payments[0].source_id).toBe(bill.id);
});
