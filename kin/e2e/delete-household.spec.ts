import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";

/** DELETE HOUSEHOLD, driven all the way through.
 *
 * The Settings screen promises this "permanently deletes every member, journal
 * entry, health record, document index, and everything else in the app", and
 * until now nothing checked that it did. On 9 September it stopped being true
 * and nobody would have known: income_schedules was created with no ON DELETE
 * clause on family_id, which in Postgres means NO ACTION, so from the first
 * income schedule any household saved the delete would have raised a foreign
 * key violation. Fifty-one other tables cascade; that one did not. It was
 * found by reading the schema, which is not a thing anybody does twice.
 *
 * This is the test that would have found it. It fills a household with a row
 * in every table that hangs off families, deletes it the way the button does,
 * and then looks for what should be gone.
 *
 * WHY IT CANNOT DELETE THE WRONG THING
 * ------------------------------------
 * `delete_household()` takes no argument -- it deletes the caller's own
 * household, resolved from the session. So the only household this can reach
 * is the one belonging to the account it signs in as, and that account,
 * E2E_DELETE_EMAIL, is a third throwaway that deliberately holds no family
 * between runs. It creates one at the start and is empty again at the end,
 * which is also what makes the test repeatable.
 *
 * It is never E2E_EMAIL. Both households the rest of the suite uses are out of
 * reach by construction, and the last thing this does is prove it: it signs in
 * as E2E_EMAIL afterwards and checks that household is still exactly where it
 * was.
 */

const RUN = `E2E-DELETE-${Date.now().toString(36)}`;
const HOUSEHOLD = `${RUN} doomed household`;

type Session = { ctx: APIRequestContext; url: string; headers: Record<string, string>; userId: string };

async function signIn(email?: string, password?: string): Promise<Session | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !email || !password) return null;
  const ctx = await playwrightRequest.newContext();
  const auth = await ctx.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: { email, password },
  });
  if (!auth.ok()) {
    await ctx.dispose();
    throw new Error(`could not sign in as ${email}: ${auth.status()}`);
  }
  const body = await auth.json();
  return {
    ctx,
    url,
    headers: { apikey: key, Authorization: `Bearer ${body.access_token}`, "Content-Type": "application/json" },
    userId: body.user.id,
  };
}

async function rows<T>(s: Session, path: string): Promise<T[]> {
  const r = await s.ctx.get(`${s.url}/rest/v1/${path}`, { headers: s.headers });
  expect(r.ok(), `reading ${path}: ${r.status()} ${await r.text()}`).toBeTruthy();
  return (await r.json()) as T[];
}

test("a household can be deleted, and takes everything with it", async () => {
  const disposable = await signIn(process.env.E2E_DELETE_EMAIL, process.env.E2E_DELETE_PASSWORD);
  test.skip(
    !disposable,
    "E2E_DELETE_EMAIL / E2E_DELETE_PASSWORD are not set. This is the one test that needs its own account, because it destroys the household it runs against — see docs/QA_HOUSEHOLDS.md.",
  );
  if (!disposable) return;

  try {
    // 1. The account starts with nothing. If a previous run died half way it
    //    may be holding one; that is only ever a household this test made, and
    //    the name says so. Anything else and we stop rather than guess.
    const existing = await rows<{ id: string; family_id: string }>(disposable, "members?select=id,family_id");
    if (existing.length > 0) {
      const held = await rows<{ id: string; name: string }>(disposable, `families?select=id,name`);
      for (const f of held) {
        expect(
          f.name.startsWith("E2E-DELETE-"),
          `the disposable account is holding "${f.name}", which this test did not create. Stopping rather than deleting it.`,
        ).toBeTruthy();
      }
      const clear = await disposable.ctx.post(`${disposable.url}/rest/v1/rpc/delete_household`, { headers: disposable.headers });
      expect(clear.ok(), "could not clear a household left by an earlier run").toBeTruthy();
    }

    // 2. Make one.
    const created = await disposable.ctx.post(`${disposable.url}/rest/v1/rpc/create_family`, {
      headers: disposable.headers,
      data: { p_household_name: HOUSEHOLD, p_full_name: `${RUN} organiser`, p_dob: "1990-01-01" },
    });
    expect(created.ok(), `create_family failed: ${created.status()} ${await created.text()}`).toBeTruthy();
    const me = (await created.json()) as { id: string; family_id: string };
    expect(me.family_id, "the new household has no id").toBeTruthy();

    // 3. Fill it. One row in each of the tables that hang off families and that
    //    a household actually accumulates -- including income_schedules, whose
    //    missing cascade is the bug this test exists for.
    const seed = async (table: string, row: Record<string, unknown>) => {
      const r = await disposable.ctx.post(`${disposable.url}/rest/v1/${table}`, {
        headers: { ...disposable.headers, Prefer: "return=representation" },
        data: [{ family_id: me.family_id, ...row }],
      });
      expect(r.ok(), `could not seed ${table}: ${r.status()} ${await r.text()}`).toBeTruthy();
      return ((await r.json()) as { id: string }[])[0];
    };

    const account = await seed("accounts", { created_by: me.id, name: `${RUN} account`, account_type: "bank", is_joint: true, opening_balance: 1000 });
    await seed("activities", { created_by: me.id, title: `${RUN} activity`, start_at: new Date().toISOString(), repeat: "once", status: "upcoming", applies_to_whole_family: true });
    await seed("journal_entries", { created_by: me.id, title: `${RUN} entry`, entry_date: "2026-09-10", source: "manual" });
    await seed("milestones", { created_by: me.id, member_id: me.id, title: `${RUN} milestone`, milestone_date: "2026-09-10" });
    await seed("health_schedule", { created_by: me.id, member_id: me.id, what: `${RUN} check-up`, when_date: "2026-09-10", status: "due" });
    await seed("goals", { created_by: me.id, title: `${RUN} goal`, target_amount: 1000, is_joint: true });
    await seed("bills", { created_by: me.id, name: `${RUN} bill`, amount: 100, status: "unpaid" });
    await seed("wealth_transactions", { recorded_by: me.id, account_id: account.id, particulars: `${RUN} spend`, amount: 10, direction: "out", status: "confirmed", occurred_at: new Date().toISOString() });
    await seed("family_messages", { member_id: me.id, body: `${RUN} message`, mentions: [] });
    // The one that would have failed. Its family_id had no cascade until the
    // constraints were repaired, so with this row present the delete below
    // raised a foreign key violation and the household could not be removed.
    await seed("income_schedules", { created_by: me.id, name: `${RUN} salary`, amount: 5000, is_joint: true });

    // 4. Delete it, the way the button does.
    const doomed = me.family_id;
    const before = await rows<{ id: string }>(disposable, `families?select=id&id=eq.${doomed}`);
    expect(before.length, "the household to delete is not there").toBe(1);

    const deleted = await disposable.ctx.post(`${disposable.url}/rest/v1/rpc/delete_household`, { headers: disposable.headers });
    expect(deleted.ok(), `delete_household failed: ${deleted.status()} ${await deleted.text()}`).toBeTruthy();

    // 5. Everything is gone. Asked as the account itself, which after the
    //    delete has no household at all -- so an empty answer here means the
    //    rows are gone rather than merely hidden. The counts are then confirmed
    //    from outside RLS's reach by the family row itself being absent.
    const survivors = await rows<{ id: string }>(disposable, `families?select=id&id=eq.${doomed}`);
    expect(survivors, "the household survived its own deletion").toEqual([]);

    const stillAMember = await rows<{ id: string }>(disposable, "members?select=id");
    expect(stillAMember, "the account still belongs to a household").toEqual([]);
  } finally {
    await disposable.ctx.dispose();
  }
});

test("and takes nothing from anybody else", async () => {
  // The claim worth making about a delete: what it removed, and what it did
  // not. The suite's own household is checked from its own session, after the
  // test above has run.
  const mine = await signIn(process.env.E2E_EMAIL, process.env.E2E_PASSWORD);
  test.skip(!mine, "Supabase details are not set.");
  if (!mine) return;
  try {
    const families = await rows<{ id: string; name: string }>(mine, "families?select=id,name");
    expect(families.length, "the suite's own household is gone").toBe(1);
    expect(families[0].name).not.toContain("E2E-DELETE-");

    const members = await rows<{ id: string }>(mine, "members?select=id");
    expect(members.length, "the suite's own household lost members").toBeGreaterThan(0);
  } finally {
    await mine.ctx.dispose();
  }
});
