import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";

/** Goal totals, checked against the ledger they are supposed to summarise.
 *
 * goals.current_amount used to be maintained by reading it, adding the amount
 * in JavaScript, and writing the sum back. Two round trips with no lock
 * between them, which lost one of two simultaneous contributions and -- more
 * cheaply reproduced -- double-counted any Confirm that got clicked twice,
 * because confirmTransactionAction never checked whether the entry was
 * already confirmed.
 *
 * A serial test cannot stage the race. What it can pin is the property that
 * makes the race unwinnable: recalc_goal_total writes a destination rather
 * than a distance, so calling it twice is calling it once. If that ever stops
 * being true, both bugs are back, and this fails.
 *
 * These talk to PostgREST as the signed-in household, because the thing under
 * test is a database function and the guarantee is a database guarantee. */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const stamp = Date.now().toString(36);
const TAG = `E2E-GOALS-${stamp}`;

test.describe.configure({ mode: "serial" });

test.describe("a goal total is its ledger", () => {
  let api: APIRequestContext;
  let token: string;
  let familyId: string;
  let accountId: string;
  let goalId: string;
  const txIds: string[] = [];

  const auth = () => ({ apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

  /** The stored total, straight off the row. */
  async function storedTotal(): Promise<number> {
    const res = await api.get(`${SUPABASE_URL}/rest/v1/goals?select=current_amount&id=eq.${goalId}`, { headers: auth() });
    expect(res.ok(), "could not read the goal back").toBeTruthy();
    return Number((await res.json())[0].current_amount);
  }

  /** One call to the function under test. */
  async function recalc(): Promise<number> {
    const res = await api.post(`${SUPABASE_URL}/rest/v1/rpc/recalc_goal_total`, {
      headers: auth(),
      data: { p_goal_id: goalId },
    });
    expect(res.ok(), `recalc_goal_total was refused: ${await res.text()}`).toBeTruthy();
    return Number(await res.json());
  }

  async function addEntry(direction: "in" | "out", amount: number, status: "confirmed" | "pending") {
    const res = await api.post(`${SUPABASE_URL}/rest/v1/wealth_transactions`, {
      headers: { ...auth(), Prefer: "return=representation" },
      data: {
        family_id: familyId,
        account_id: accountId,
        goal_id: goalId,
        direction,
        amount,
        status,
        particulars: `${TAG} ${direction} ${amount} ${status}`,
      },
    });
    expect(res.ok(), `could not write a ledger row: ${await res.text()}`).toBeTruthy();
    const id = (await res.json())[0].id as string;
    txIds.push(id);
    return id;
  }

  test.beforeAll(async () => {
    test.skip(
      !SUPABASE_URL || !SUPABASE_KEY,
      "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are not set; skipping the database-level checks.",
    );
    api = await playwrightRequest.newContext();

    const signIn = await api.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: SUPABASE_KEY!, "Content-Type": "application/json" },
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(signIn.ok(), "could not sign the throwaway account in").toBeTruthy();
    token = (await signIn.json()).access_token;

    const meRes = await api.get(`${SUPABASE_URL}/rest/v1/members?select=id,family_id,role&limit=200`, { headers: auth() });
    const me = (await meRes.json()).find((r: { role: string }) => r.role === "parent");
    expect(me, "the throwaway household has no parent row").toBeTruthy();
    familyId = me.family_id;

    const acc = await api.post(`${SUPABASE_URL}/rest/v1/accounts`, {
      headers: { ...auth(), Prefer: "return=representation" },
      data: { family_id: familyId, name: `${TAG} account`, is_private: false, is_joint: true },
    });
    expect(acc.ok(), `could not create the test account: ${await acc.text()}`).toBeTruthy();
    accountId = (await acc.json())[0].id;

    const goal = await api.post(`${SUPABASE_URL}/rest/v1/goals`, {
      headers: { ...auth(), Prefer: "return=representation" },
      data: { family_id: familyId, title: `${TAG} new roof`, target_amount: 100000, is_joint: true },
    });
    expect(goal.ok(), `could not create the test goal: ${await goal.text()}`).toBeTruthy();
    goalId = (await goal.json())[0].id;
  });

  /** Cleanup that refuses rather than shrugs. A test that cannot clear up
   * after itself must say so, because the alternative is poisoning whichever
   * run comes next -- which is exactly how the routine-duration test failed. */
  test.afterAll(async () => {
    if (!api || !token) return;
    for (const id of txIds) {
      const res = await api.delete(`${SUPABASE_URL}/rest/v1/wealth_transactions?id=eq.${id}`, { headers: auth() });
      expect(res.ok(), `left a ledger row behind: ${id}`).toBeTruthy();
    }
    if (goalId) {
      const res = await api.delete(`${SUPABASE_URL}/rest/v1/goals?id=eq.${goalId}`, { headers: auth() });
      expect(res.ok(), `left the test goal behind: ${goalId}`).toBeTruthy();
    }
    if (accountId) {
      const res = await api.delete(`${SUPABASE_URL}/rest/v1/accounts?id=eq.${accountId}`, { headers: auth() });
      expect(res.ok(), `left the test account behind: ${accountId}`).toBeTruthy();
    }
    await api.dispose();
  });

  test("a new goal starts at nothing", async () => {
    expect(await storedTotal()).toBe(0);
  });

  test("only confirmed money counts", async () => {
    await addEntry("out", 1000, "confirmed");
    await addEntry("out", 250, "confirmed");
    await addEntry("out", 9999, "pending"); // still sitting in someone's banking app

    expect(await recalc()).toBe(1250);
    expect(await storedTotal()).toBe(1250);
  });

  /** The one that matters. Under the old read-add-write, a second settlement
   * of the same movement added the amount again; here the second and third
   * calls must land on the number the first did. */
  test("recalculating twice is recalculating once", async () => {
    const first = await recalc();
    const second = await recalc();
    const third = await recalc();

    expect(first).toBe(1250);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(await storedTotal()).toBe(first);
  });

  test("money coming back out of the goal takes the total down", async () => {
    await addEntry("in", 100, "confirmed");
    expect(await recalc()).toBe(1150);
    expect(await storedTotal()).toBe(1150);
  });

  /** deleteTransactionAction recomputes after the rows are gone rather than
   * before, which is the ordering this pins. */
  test("deleting a contribution takes it off the total", async () => {
    const doomed = txIds[1]; // the 250
    const res = await api.delete(`${SUPABASE_URL}/rest/v1/wealth_transactions?id=eq.${doomed}`, { headers: auth() });
    expect(res.ok()).toBeTruthy();
    txIds.splice(1, 1);

    expect(await recalc()).toBe(900);
    expect(await storedTotal()).toBe(900);
  });

  /** Drift written directly into the row -- which is how the one drifting goal
   * in the database got there -- is corrected rather than preserved. */
  test("a total that has drifted is put back", async () => {
    const patch = await api.patch(`${SUPABASE_URL}/rest/v1/goals?id=eq.${goalId}`, {
      headers: auth(),
      data: { current_amount: 424242 },
    });
    expect(patch.ok()).toBeTruthy();
    expect(await storedTotal()).toBe(424242);

    expect(await recalc()).toBe(900);
    expect(await storedTotal()).toBe(900);
  });
});
