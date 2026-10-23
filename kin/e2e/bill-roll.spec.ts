import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";
import { nextBillDate } from "@/lib/bill-roll";
import { familyDay } from "@/lib/time";

/** "Add next month's <bill>?" (#833), driven in the app as the sample
 * household, a grown-up on Plus.
 *
 * bill-roll.logic.spec.ts holds the date rules. This holds what a person
 * sees and what lands in the database: paying a repeating bill outside Kin
 * raises the sheet with the amount and the next date filled in; Add makes
 * exactly one next bill, at that date and amount; Not now makes nothing;
 * and a bill whose next one already exists raises nothing; Cash Flow lists
 * the offer without Expenses being opened. Then the offer
 * card at 320px and 390px, Simple Kin off and on: nothing wider than the
 * phone, and in Simple Kin every button a finger reaches 44px tall.
 *
 * Weekly tier (weekly-check.yml runs every spec): it writes bills, so it
 * stays off the per-pull-request smoke run on shared dev. Everything it
 * makes is named with RUN and removed afterwards; the Simple Kin switch on
 * the sample member is put back. */

const RUN = `E2E-ROLL-${Date.now().toString(36)}`;
const AMOUNT = 1234;

type Bill = { id: string; name: string; amount: string; due_date: string | null; recurrence: string | null; status: string };

let session: { url: string; headers: Record<string, string>; familyId: string; memberId: string; tz: string } | null = null;
let original: { simple_mode: boolean; text_scale: number } | null = null;

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
    const me = await ctx.get(`${url}/rest/v1/members?auth_user_id=eq.${user.id}&select=id,family_id,simple_mode,text_scale,families(time_zone)`, { headers });
    const [row] = (await me.json()) as { id: string; family_id: string; simple_mode: boolean; text_scale: number; families: { time_zone: string | null } }[];
    original = { simple_mode: row.simple_mode, text_scale: row.text_scale };
    session = { url: url!, headers, familyId: row.family_id, memberId: row.id, tz: row.families?.time_zone || "Asia/Manila" };
  }
  return { ctx, ...session };
}

async function addBill(name: string, dueDate: string, status = "unpaid"): Promise<string> {
  const { ctx, url, headers, familyId } = await api();
  try {
    const res = await ctx.post(`${url}/rest/v1/bills`, {
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      data: { family_id: familyId, name, amount: AMOUNT, due_date: dueDate, recurrence: "monthly", status, category: "Utilities", ...(status === "paid" ? { paid_at: dueDate } : {}) },
    });
    expect(res.ok(), `could not add ${name}: ${await res.text()}`).toBeTruthy();
    return ((await res.json()) as { id: string }[])[0].id;
  } finally {
    await ctx.dispose();
  }
}

async function billsNamed(name: string): Promise<Bill[]> {
  const { ctx, url, headers } = await api();
  try {
    const res = await ctx.get(`${url}/rest/v1/bills?select=id,name,amount,due_date,recurrence,status&name=eq.${encodeURIComponent(name)}&order=due_date`, { headers });
    expect(res.ok(), `could not read ${name} back: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as Bill[];
  } finally {
    await ctx.dispose();
  }
}

async function setSimple(on: boolean) {
  const { ctx, url, headers, memberId } = await api();
  try {
    // Off is off: a run that died with Simple Kin on is not the baseline.
    const patch = on ? { simple_mode: true, text_scale: 130 } : { simple_mode: false, text_scale: original!.simple_mode ? 100 : original!.text_scale };
    const res = await ctx.patch(`${url}/rest/v1/members?id=eq.${memberId}`, { headers: { ...headers, "Content-Type": "application/json" }, data: patch });
    expect(res.ok(), "could not switch Simple Kin").toBeTruthy();
  } finally {
    await ctx.dispose();
  }
}

/** Cash Flow, scrolled to the bill, its Settle sheet open, "Paid outside Kin". */
async function settleOutsideKin(page: Page, billId: string) {
  await page.goto(`/wealth?seg=cashflow&open=expenses&bill=${billId}`);
  const row = page.locator(`#bill-${billId}`);
  await row.getByRole("button", { name: "Settle" }).click();
  await page.getByRole("button", { name: /Paid outside Kin/ }).click();
}

const today = () => familyDay(new Date(), session?.tz ?? "Asia/Manila");

/** Cash Flow with Expenses open (the offers sit above it, open; Expenses
 * holds the settled bill this anchors on): the paid one is there, settled,
 * and no offer for it -- so a page that failed to render cannot pass for
 * "none". */
async function expectNoOffer(page: Page, name: string, billId: string) {
  await page.goto("/wealth?seg=cashflow&open=expenses");
  // Its line in the owner → category breakdown: "Utilities - <name>",
  // marked settled underneath.
  await expect(page.getByText(`Utilities - ${name}`, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Settled/).first()).toBeVisible();
  await expect(page.locator(`[data-next-bill="${billId}"]`)).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const { ctx } = await api();
  await ctx.dispose();
});

test.afterAll(async () => {
  if (!session) return;
  const { ctx, url, headers } = await api();
  try {
    const res = await ctx.delete(`${url}/rest/v1/bills?name=like.${encodeURIComponent(`${RUN}*`)}`, { headers });
    expect(res.ok(), `the test bills were left in the sample household: ${await res.text()}`).toBeTruthy();
  } finally {
    await ctx.dispose();
  }
  if (original) await setSimple(false);
});

test("Add makes exactly one next bill, at the date and amount offered", async ({ page }) => {
  const name = `${RUN} add`;
  const due = today();
  const billId = await addBill(name, due);
  const expected = nextBillDate(due, "monthly", today())!;

  await settleOutsideKin(page, billId);
  const sheet = page.getByRole("dialog", { name: `Add next month's ${name} for`, exact: false });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('input[type="date"]')).toHaveValue(expected);
  await expect(sheet.getByLabel(/Amount/)).toHaveValue(/1,?234/);
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet).toBeHidden();

  await expect.poll(async () => (await billsNamed(name)).length).toBe(2);
  const bills = await billsNamed(name);
  const next = bills.find((b) => b.id !== billId)!;
  expect(bills.find((b) => b.id === billId)!.status).toBe("paid");
  expect(next.due_date).toBe(expected);
  expect(Number(next.amount)).toBe(AMOUNT);
  expect(next.recurrence).toBe("monthly");
  expect(next.status).toBe("unpaid");

  // The next one exists, so nothing is offered for it any more.
  await expectNoOffer(page, name, billId);
});

test("Not now makes nothing, and the offer stays away on this phone", async ({ page }) => {
  const name = `${RUN} not now`;
  const billId = await addBill(name, today());

  await settleOutsideKin(page, billId);
  const sheet = page.getByRole("dialog", { name: `Add next month's ${name} for`, exact: false });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Not now" }).click();
  await expect(sheet).toBeHidden();

  const bills = await billsNamed(name);
  expect(bills.map((b) => b.status)).toEqual(["paid"]);
  // Hidden on this phone, by Not now.
  await expectNoOffer(page, name, billId);
});

test("A bill whose next one is already there offers nothing", async ({ page }) => {
  const name = `${RUN} has next`;
  const due = today();
  const billId = await addBill(name, due);
  await addBill(name, nextBillDate(due, "monthly", today())!);

  await settleOutsideKin(page, billId);
  // The Settle sheet closes in the same step that would raise the question,
  // and the page refreshes; once that is done, no question has followed.
  await expect(page.getByRole("button", { name: /Paid outside Kin/ })).toBeHidden();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog", { name: /Add next month's/ })).toHaveCount(0);
  expect((await billsNamed(name)).map((b) => b.status).sort()).toEqual(["paid", "unpaid"]);
  await expectNoOffer(page, name, billId);
});

for (const simple of [false, true]) {
  for (const width of [320, 390]) {
    test(`the offer fits ${width}px, Simple Kin ${simple ? "on" : "off"}`, async ({ page }) => {
      const name = `${RUN} fit`;
      if ((await billsNamed(name)).length === 0) await addBill(name, today(), "paid");
      const [paid] = await billsNamed(name);
      const openName = `${RUN} open`;
      if ((await billsNamed(openName)).length === 0) await addBill(openName, today());
      const [open] = await billsNamed(openName);
      await setSimple(simple);
      try {
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        // Today lists it too, outside Simple Kin (Simple Kin's Today is its own, shorter page).
        for (const path of simple ? ["/wealth?seg=cashflow&open=expenses"] : ["/wealth?seg=cashflow&open=expenses", "/today"]) {
          await page.goto(path);
          const card = page.locator(`[data-next-bill="${paid.id}"]`);
          await card.scrollIntoViewIfNeeded();
          await expect(card).toBeVisible();
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, `${path} is wider than the phone`).toBeLessThanOrEqual(0);
          const box = await card.boundingBox();
          expect(box!.x + box!.width, `the card runs off the right edge of ${path}`).toBeLessThanOrEqual(width);
          const fields = await card.locator("input").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
          for (const right of fields) expect(right, `a field runs off the card on ${path}`).toBeLessThanOrEqual(box!.x + box!.width + 0.5);
          const tall = await card.locator("button").evaluateAll((els) => els.map((e) => [e.textContent?.trim(), e.getBoundingClientRect().height] as const));
          for (const [label, height] of tall) expect(height, `"${label}" on ${path}`).toBeGreaterThanOrEqual(simple ? 44 : 40);
          if (path.startsWith("/wealth")) {
            // The open bill's own row: Settle, the reminder and Remove.
            const row = page.locator(`#bill-${open.id}`);
            await expect(row).toBeVisible();
            const controls = await row.locator(":is(button, select)").evaluateAll((els) => els.map((e) => [e.textContent?.trim().slice(0, 20), e.getBoundingClientRect().right, e.getBoundingClientRect().height] as const));
            for (const [label, right, height] of controls) {
              expect(right, `"${label}" runs off the phone`).toBeLessThanOrEqual(width);
              if (simple) expect(height, `"${label}" in Simple Kin`).toBeGreaterThanOrEqual(44);
            }
          }
        }
      } finally {
        await setSimple(false);
      }
    });
  }
}

test("Cash Flow shows the offer without opening Expenses", async ({ page }) => {
  const name = `${RUN} seen`;
  const billId = await addBill(name, today(), "paid");
  await page.goto("/wealth?seg=cashflow");
  await expect(page.locator(`[data-next-bill="${billId}"]`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next bills to add" })).toBeVisible();
  // Expenses is closed: its settled bills are not on the page.
  await expect(page.getByText(/Settled/)).toHaveCount(0);
});

test("the question sheet fits 320px with Simple Kin on", async ({ page }) => {
  const name = `${RUN} sheet`;
  const billId = await addBill(name, today());
  await setSimple(true);
  try {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await settleOutsideKin(page, billId);
    const sheet = page.getByRole("dialog", { name: `Add next month's ${name} for`, exact: false });
    await expect(sheet).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the sheet makes the page wider than the phone").toBeLessThanOrEqual(0);
    for (const el of await sheet.locator("input, button").all()) {
      const box = (await el.boundingBox())!;
      expect(box.x + box.width, "a field or button runs off the sheet").toBeLessThanOrEqual(320);
    }
    for (const label of ["Add", "Not now"]) {
      const box = (await sheet.getByRole("button", { name: label, exact: true }).boundingBox())!;
      expect(box.height, `"${label}"`).toBeGreaterThanOrEqual(44);
    }
    await sheet.getByRole("button", { name: "Not now" }).click();
    await expect(sheet).toBeHidden();
  } finally {
    await setSimple(false);
  }
});
