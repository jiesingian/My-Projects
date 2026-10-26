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
// A second account, a goal and a loan, for Edit entry and the loan split.
let bankId = "";
let goalId = "";
let loanId = "";
const LOAN = 10000;

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

// What the page held when a test failed, in the job log (26 October): the
// report's own snapshot is left out once the folds have been clicked, and
// the report itself cannot be downloaded from a session.
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  console.log(`[add-expense] failed at ${page.url()}`);
  try {
    console.log(await page.locator("body").ariaSnapshot({ timeout: 5000 }));
  } catch (e) {
    console.log(`[add-expense] no snapshot: ${e instanceof Error ? e.message : String(e)}`);
  }
});

async function create(table: string, data: Record<string, unknown>): Promise<string> {
  const { ctx, url, headers, familyId, memberId } = await api();
  try {
    const res = await ctx.post(`${url}/rest/v1/${table}`, {
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      data: { family_id: familyId, created_by: memberId, ...data },
    });
    expect(res.ok(), `could not add the test ${table}: ${await res.text()}`).toBeTruthy();
    return ((await res.json()) as { id: string }[])[0].id;
  } finally {
    await ctx.dispose();
  }
}

test.beforeAll(async () => {
  // Its own accounts, goal and loan, joint so any grown-up sees them: the
  // private database's household starts with none, and "Already paid"
  // needs an account.
  accountId = await create("accounts", { name: `${RUN} wallet`, account_type: "ewallet", opening_balance: 5000, is_joint: true });
  bankId = await create("accounts", { name: `${RUN} bank`, account_type: "bank", opening_balance: 5000, is_joint: true });
  goalId = await create("goals", { title: `${RUN} fund`, target_amount: 10000, is_joint: true });
  loanId = await create("liabilities", { name: `${RUN} loan`, balance: LOAN, original_amount: LOAN, interest_rate: 12, is_joint: true });
});

test.afterAll(async () => {
  if (!session) return;
  await remove("wealth_transactions", `particulars=like.${encodeURIComponent(`${RUN}*`)}`);
  await remove("bills", `name=like.${encodeURIComponent(`${RUN}*`)}`);
  if (goalId) await remove("goals", `id=eq.${goalId}`);
  if (loanId) await remove("liabilities", `id=eq.${loanId}`);
  for (const id of [accountId, bankId]) if (id) await remove("accounts", `id=eq.${id}`);
});

/** Edit on the one entry named `name`, under its line in Spending by person. */
async function editEntry(page: Page, name: string) {
  await page.goto("/wealth?seg=cashflow&open=expenses");
  await expandAllCollapsedGroups(page);
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Edit" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit entry" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Already paid out of the wallet, for `against` ("goals:<id>", ...). */
async function addPaid(page: Page, name: string, amount: number, against: string) {
  await openSheet(page);
  await addSheet(page).getByLabel("What it's for").fill(name);
  await addSheet(page).getByLabel(/^Amount/).fill(String(amount));
  await addSheet(page).getByLabel("Paid from").selectOption(accountId);
  await addSheet(page).getByLabel("For (optional)").selectOption(against);
}

const goalTotal = async () => Number((await rows<{ current_amount: string }>("goals", `select=current_amount&id=eq.${goalId}`))[0].current_amount);
const loanOwed = async () => Number((await rows<{ balance: string }>("liabilities", `select=balance&id=eq.${loanId}`))[0].balance);
const entryNamed = async (name: string) =>
  (await rows<Entry & { goal_id: string | null; principal_amount: string | null }>("wealth_transactions", `select=id,particulars,amount,status,account_id,occurred_at,source_table,source_id,goal_id,principal_amount&particulars=eq.${encodeURIComponent(name)}`))[0];

test("Already paid lands in the ledger, confirmed, on the day, out of the account", async ({ page }) => {
  await openSheet(page);
  // The sheet opens on "Already paid", with today in Paid on.
  await expect(page.getByRole("button", { name: "Already paid" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('input[name="occurred_on"]')).toHaveValue(today());
  await addSheet(page).getByLabel("What it's for").fill(`${RUN} lunch`);
  await addSheet(page).getByLabel(/^Amount/).fill(String(LUNCH));
  await addSheet(page).getByLabel("Paid from").selectOption(accountId);
  await addSheet(page).getByRole("button", { name: "Save expense" }).click();
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
  await expect(addSheet(page).getByLabel("Remind me")).toBeVisible();
  await addSheet(page).getByLabel("What it's for").fill(`${RUN} tuition`);
  await addSheet(page).getByLabel(/^Amount/).fill(String(TUITION));
  await addSheet(page).getByLabel("Paid from").selectOption(accountId);
  await addSheet(page).getByRole("button", { name: "Save expense" }).click();
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

  // Its day come, the line asks; arrived from the bill's link (Today's
  // Pay), Settle is already open on that question with the bill's own
  // account, and Mark paid settles it. The sheet is checked before any
  // fold is touched: a modal sheet would block the clicks that open them.
  await page.goto(`/wealth?seg=cashflow&open=expenses&bill=${bill.id}`);
  const sheet = page.getByRole("dialog", { name: "Did it go through?" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Pay from")).toHaveValue(accountId);
  await sheet.getByRole("button", { name: "Mark paid" }).click();
  await expect(sheet).toBeHidden();
  // It repeats, so Kin offers next month's (next-bill-offer.tsx). Not now
  // adds nothing; the offer must be answered before the folds, which it
  // would otherwise sit over.
  const offer = page.getByRole("dialog", { name: /^Add next month's/ });
  await expect(offer).toBeVisible();
  await offer.getByRole("button", { name: "Not now" }).click();
  await expect(offer).toBeHidden();
  // The line, now settled, under its category.
  await expandAllCollapsedGroups(page);
  const line = page.getByText(new RegExp(`^Bills & utilities - ${RUN} tuition`)).first();
  await expect(line).toBeVisible();
  await expect(page.getByText(/Settled/).first()).toBeVisible();

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

test("Edit entry moves an expense to another account and off its goal; the goal is recounted", async ({ page }) => {
  const name = `${RUN} gym`;
  await addPaid(page, name, 200, `goals:${goalId}`);
  await addSheet(page).getByRole("button", { name: "Save expense" }).click();
  await expect(addSheet(page)).toBeHidden();
  const added = await entryNamed(name);
  expect(added.source_table).toBe("goals");
  expect(added.goal_id).toBe(goalId);
  expect(await goalTotal(), "the goal counts what went to it").toBe(200);

  // Cancel keeps nothing: reopened, the sheet shows the entry as saved.
  let sheet = await editEntry(page, name);
  await sheet.getByLabel("Paid from").selectOption(bankId);
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Edit" }).click();
  await expect(sheet.getByLabel("Paid from")).toHaveValue(accountId);
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();

  sheet = await editEntry(page, name);
  await expect(sheet.getByLabel("For (optional)")).toHaveValue(`goals:${goalId}`);
  await sheet.getByLabel("Paid from").selectOption(bankId);
  await sheet.getByLabel("For (optional)").selectOption({ label: "Nothing in particular" });
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  const edited = await entryNamed(name);
  expect(edited.account_id).toBe(bankId);
  expect(edited.source_table).toBeNull();
  expect(edited.goal_id).toBeNull();
  expect(await goalTotal(), "the goal it left is recounted").toBe(0);
});

test("A loan payment pays the loan down by the split given; Edit moves it, then off the loan, and the loan follows", async ({ page }) => {
  const name = `${RUN} loan payment`;
  await addPaid(page, name, 1000, `liabilities:${loanId}`);
  // Kin's split is there to change: the bank's statement says 900.
  const principal = addSheet(page).getByLabel("Pays the loan down");
  await expect(principal).toBeVisible();
  await principal.fill("900");
  await addSheet(page).getByRole("button", { name: "Save expense" }).click();
  await expect(addSheet(page)).toBeHidden();
  const added = await entryNamed(name);
  expect(added.source_table).toBe("liabilities");
  expect(added.source_id).toBe(loanId);
  expect(Number(added.principal_amount)).toBe(900);
  expect(await loanOwed()).toBe(LOAN - 900);

  // The split corrected on Edit entry: the loan moves by the difference.
  let sheet = await editEntry(page, name);
  await expect(sheet.getByLabel("For (optional)")).toHaveValue(`liabilities:${loanId}`);
  // It opens on the split as saved, not one worked out again on a balance
  // this payment already lowered.
  await expect(sheet.getByLabel("Pays the loan down")).toHaveValue(/^900(\.00)?$/);
  await sheet.getByLabel("Pays the loan down").fill("800");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  expect(Number((await entryNamed(name)).principal_amount)).toBe(800);
  expect(await loanOwed()).toBe(LOAN - 800);

  // Off the loan: what it had paid down is owed again.
  sheet = await editEntry(page, name);
  await sheet.getByLabel("For (optional)").selectOption({ label: "Nothing in particular" });
  await expect(sheet.getByLabel("Pays the loan down")).toBeHidden();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  const off = await entryNamed(name);
  expect(off.source_table).toBeNull();
  expect(off.principal_amount).toBeNull();
  expect(await loanOwed()).toBe(LOAN);
});
