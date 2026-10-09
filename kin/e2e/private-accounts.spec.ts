import { test, expect, type Browser, type Page } from "@playwright/test";
import { restAsQa, type Rest } from "./support/qa-household";
import { restAsPartner, ensurePartnerInHousehold } from "./support/qa-partner";
import { expandAllCollapsedGroups } from "./support/collapsible-groups";

/** A private account is its owner's alone -- seen from the other grown-up.
 *
 * Every other Wealth spec signs in as the account's owner, which is the one
 * person a private account is meant to show to, so none of them could ever
 * notice a private account leaking. This one makes three accounts as the QA
 * account (Quinn) -- private, shared with the household, and joint -- each
 * with a movement, then looks as the second login in the same household (the
 * partner, an adult; docs/QA_HOUSEHOLDS.md), through the REST API and on
 * every Wealth page that lists or totals accounts:
 *
 *   - the private account, its movement and its number are invisible, and
 *     its balance moves no total on any page, under any Who;
 *   - the shared and joint accounts and their movements are visible;
 *   - the joint account's number is readable; the private one's is not;
 *   - a monthly income landing in it and a bill paid from it are on no
 *     page (Cash Flow, Subscriptions, the Planner's month) and move no total.
 *
 * "In no total" is measured rather than reasoned about: every amount on each
 * page is read before the private account exists and again after, and they
 * must be the same. A balance of ₱7,654,321.09 cannot hide in a rounding.
 *
 * Without E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD it skips, and says so --
 * a privacy test that passes having looked at nothing would be worse than
 * none. Everything it makes carries a fixed prefix and is swept in afterAll
 * as the QA account, whose RLS keeps the sweep inside the throwaway
 * household. */

const FAMILY = "E2E-PRIV";
const RUN = `${FAMILY}-${Date.now().toString(36)}`;
const PRIVATE_BALANCE = 7_654_321.09;

const PAGES = (who: string[]) => [
  ...who.map((w) => `/wealth?seg=accounts&who=${w}`),
  ...who.map((w) => `/wealth?seg=cashflow&who=${w}`),
  ...who.map((w) => `/wealth?seg=assets&who=${w}`),
  "/wealth/transact",
  "/wealth/subscriptions",
  "/planner?seg=calendar&view=month",
];

type Me = { memberId: string; familyId: string };

async function me(rest: Rest): Promise<Me> {
  const user = await rest.ctx.get(`${rest.url}/auth/v1/user`, { headers: rest.headers });
  expect(user.ok()).toBeTruthy();
  const { id } = (await user.json()) as { id: string };
  const res = await rest.ctx.get(`${rest.url}/rest/v1/members?select=id,family_id&auth_user_id=eq.${id}`, { headers: rest.headers });
  expect(res.ok()).toBeTruthy();
  const rows = (await res.json()) as { id: string; family_id: string }[];
  expect(rows.length, "the QA account has no member row").toBe(1);
  return { memberId: rows[0].id, familyId: rows[0].family_id };
}

async function post(rest: Rest, table: string, data: Record<string, unknown>): Promise<string> {
  const res = await rest.ctx.post(`${rest.url}/rest/v1/${table}`, {
    headers: { ...rest.headers, "Content-Type": "application/json", Prefer: "return=representation" },
    data,
  });
  expect(res.ok(), `could not add to ${table}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { id?: string; account_id?: string }[]).map((r) => r.id ?? r.account_id)[0]!;
}

/** An account in Quinn's name (or joint), with a confirmed movement in this
 * month and a number, the way the app's own forms write them. */
async function addAccount(rest: Rest, who: Me, name: string, kind: { is_private: boolean; is_joint: boolean }, opening: number) {
  const id = await post(rest, "accounts", {
    family_id: who.familyId, name, account_type: "bank", opening_balance: opening,
    owner_member_id: kind.is_joint ? null : who.memberId, created_by: who.memberId, ...kind,
  });
  await post(rest, "wealth_transactions", {
    family_id: who.familyId, account_id: id, direction: "in", amount: 4_321.17, particulars: `${name} movement`, status: "confirmed", recorded_by: who.memberId,
  });
  await post(rest, "account_numbers", { account_id: id, family_id: who.familyId, number: "9876 5432 1098", updated_by: who.memberId });
  return id;
}

async function rows(rest: Rest, path: string): Promise<unknown[]> {
  const res = await rest.ctx.get(`${rest.url}/rest/v1/${path}`, { headers: rest.headers });
  expect(res.ok(), `${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as unknown[];
}

/** Every peso amount the page shows, in order. */
async function amounts(page: Page): Promise<string[]> {
  return (await page.locator("body").innerText()).match(/-?₱\s?-?[\d,]+(?:\.\d+)?/g) ?? [];
}

/** Opens `path` and refuses to go on unless the page on screen is that page.
 *
 * The weekly check of 9 October failed here on a child's Cash Flow tab with
 * 15 amounts before and 3 after -- and the 3 were not Cash Flow at all. The
 * service worker gives a navigation 10 seconds (NAVIGATION_TIMEOUT_MS,
 * public/sw.js) and then redirects to the offline shell, whose saved Today
 * screen lists the bills due: ₱890, ₱4,380.5, ₱2,499. A slow render on the
 * CI server, read as "an amount changed".
 *
 * This spec measures what the server renders for the partner, not offline
 * Kin, so the browser context it signs in with blocks service workers. The
 * address check stays as well: a redirect -- to /offline, /today, /login --
 * fails loudly as the wrong page, never as a quiet comparison of two
 * different screens. */
async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  const want = new URL(path, page.url());
  const got = new URL(page.url());
  expect(`${got.pathname}${got.search}`, `${path} was not the page on screen`).toBe(`${want.pathname}${want.search}`);
  await expandAllCollapsedGroups(page);
}

async function signIn(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 900 }, timezoneId: "America/New_York", serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.fill('input[name="email"]', process.env.E2E_PARTNER_EMAIL!);
  await page.fill('input[name="password"]', process.env.E2E_PARTNER_PASSWORD!);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  return page;
}

test.describe("a private account, seen by the other grown-up", () => {
  let qa: Rest | null = null;
  let partner: Rest | null = null;
  let quinn: Me;

  test.beforeAll(async () => {
    partner = await restAsPartner();
    if (!partner) {
      // Loud on purpose: a skipped privacy test should be noticed.
      console.warn("\n*** private-accounts.spec SKIPPED: E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD are not set. Private accounts were NOT checked. ***\n");
    }
    test.skip(!partner, "E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD are not set -- private accounts were NOT checked (docs/QA_HOUSEHOLDS.md).");
    qa = await restAsQa();
    test.skip(!qa, "Supabase details are not set.");
    quinn = await me(qa!);
    await ensurePartnerInHousehold(qa!, partner!, quinn.familyId);
  });

  test.afterAll(async () => {
    try {
      if (!qa) return;
      const list = (await rows(qa, `accounts?select=id&name=like.${encodeURIComponent(FAMILY)}*`)) as { id: string }[];
      // Repeating income and bills tied to this run's accounts (the
      // Subscriptions page), before the accounts they point at.
      await qa.ctx.delete(`${qa.url}/rest/v1/income_schedules?name=like.${encodeURIComponent(FAMILY)}*`, { headers: qa.headers });
      await qa.ctx.delete(`${qa.url}/rest/v1/bills?name=like.${encodeURIComponent(FAMILY)}*`, { headers: qa.headers });
      if (list.length > 0) {
        const inList = `(${list.map((a) => a.id).join(",")})`;
        // Movements first: an account with history refuses to go.
        await qa.ctx.delete(`${qa.url}/rest/v1/wealth_transactions?account_id=in.${inList}`, { headers: qa.headers });
        await qa.ctx.delete(`${qa.url}/rest/v1/accounts?id=in.${inList}`, { headers: qa.headers });
      }
      // A refused delete comes back 200; look again.
      expect(await rows(qa, `accounts?select=id&name=like.${encodeURIComponent(FAMILY)}*`), "accounts this run made are still in the throwaway household").toEqual([]);
    } finally {
      await qa?.ctx.dispose();
      await partner?.ctx.dispose();
    }
  });

  test("the private account, its movement, number and balance are nowhere; shared and joint are", async ({ browser }) => {
    test.setTimeout(240_000);
    const shared = `${RUN} shared`;
    const joint = `${RUN} joint`;
    const secret = `${RUN} private`;

    const sharedId = await addAccount(qa!, quinn, shared, { is_private: false, is_joint: false }, 2_000);
    const jointId = await addAccount(qa!, quinn, joint, { is_private: false, is_joint: true }, 3_000);

    const page = await signIn(browser);
    const visible = (await rows(partner!, `members?select=id,status&family_id=eq.${quinn.familyId}`)) as { id: string; status: string }[];
    const who = ["all", "family", ...visible.filter((m) => !["pending", "removed", "moved"].includes(m.status)).map((m) => m.id)];
    expect(who, "Quinn should be one of the partner's Who options").toContain(quinn.memberId);
    const pages = PAGES(who);

    // Before the private account exists: every amount on every page.
    const before = new Map<string, string[]>();
    for (const path of pages) {
      await open(page, path);
      before.set(path, await amounts(page));
    }

    const secretId = await addAccount(qa!, quinn, secret, { is_private: true, is_joint: false }, PRIVATE_BALANCE);
    // Something repeating tied to it: a monthly income that lands in it and a
    // monthly bill paid from it. Both are the household's kind of row, but
    // they point at the private account, so Cash Flow, Subscriptions and
    // the Planner leave them out for the partner -- every page below checks that.
    await post(qa!, "income_schedules", {
      family_id: quinn.familyId, name: `${secret} salary`, amount: 87_654.32, recurrence: "monthly", next_date: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10),
      status: "expected", account_id: secretId, is_joint: false, owner_member_id: quinn.memberId, created_by: quinn.memberId,
    });
    await post(qa!, "bills", {
      family_id: quinn.familyId, name: `${secret} subscription`, amount: 765.43, recurrence: "monthly", due_date: new Date().toISOString().slice(0, 10),
      status: "paid", paid_at: new Date().toISOString(), paid_from_account_id: secretId, created_by: quinn.memberId,
    });

    // Through the API, as the partner.
    await test.step("REST: the private account is invisible, shared and joint are not", async () => {
      const ids = `(${[sharedId, jointId, secretId].join(",")})`;
      const accounts = ((await rows(partner!, `accounts?select=id&id=in.${ids}`)) as { id: string }[]).map((a) => a.id).sort();
      expect(accounts).toEqual([sharedId, jointId].sort());
      const moves = ((await rows(partner!, `wealth_transactions?select=account_id&account_id=in.${ids}`)) as { account_id: string }[]).map((m) => m.account_id).sort();
      expect(moves, "the partner should see the shared and joint movements and not the private one").toEqual([sharedId, jointId].sort());
      expect(await rows(partner!, `wealth_transactions?select=id&particulars=eq.${encodeURIComponent(`${secret} movement`)}`)).toEqual([]);
      expect(await rows(partner!, `account_numbers?select=account_id&account_id=eq.${secretId}`), "the partner can read the private account's number").toEqual([]);
      expect(await rows(partner!, `account_numbers?select=account_id&account_id=eq.${jointId}`), "the partner should read the joint account's number").toHaveLength(1);
      // And the owner still sees all three -- otherwise "invisible" proves nothing.
      expect(await rows(qa!, `accounts?select=id&id=in.${ids}`)).toHaveLength(3);
    });

    // In the app, as the partner: the same pages again.
    for (const path of pages) {
      await test.step(`UI: ${path}`, async () => {
        await open(page, path);
        const html = await page.content();
        expect(html, `${path} carries the private account's name`).not.toContain(secret);
        expect(html, `${path} carries the private account's id`).not.toContain(secretId);
        expect(await amounts(page), `${path}: an amount changed when Quinn's private account was added`).toEqual(before.get(path));
      });
    }

    await test.step("UI: shared and joint accounts are listed for the partner", async () => {
      await page.goto("/wealth?seg=accounts&who=all", { waitUntil: "networkidle" });
      await expandAllCollapsedGroups(page);
      await expect(page.getByRole("link", { name: new RegExp(shared) }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: new RegExp(joint) }).first()).toBeVisible();
      await page.goto(`/wealth?seg=accounts&who=${quinn.memberId}`, { waitUntil: "networkidle" });
      await expandAllCollapsedGroups(page);
      await expect(page.getByRole("link", { name: new RegExp(shared) }).first()).toBeVisible();
      await page.goto("/wealth?seg=accounts&who=family", { waitUntil: "networkidle" });
      await expandAllCollapsedGroups(page);
      await expect(page.getByRole("link", { name: new RegExp(joint) }).first()).toBeVisible();
      await page.goto("/wealth/transact", { waitUntil: "networkidle" });
      const html = await page.content();
      expect(html).toContain(shared);
      expect(html).toContain(joint);
    });

    await page.context().close();
  });
});
