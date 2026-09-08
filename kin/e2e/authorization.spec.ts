import { test, expect, request as playwrightRequest } from "@playwright/test";

/** What the database refuses, checked against the database.
 *
 * Several server actions carry no authorisation check of their own --
 * removeMemberAction is a bare `update ... eq("id", memberId)` with no
 * family scope -- and rely entirely on row-level security. That is a
 * reasonable design, because RLS is enforced by Postgres rather than by
 * whoever remembered to write the check. It is only reasonable while the
 * policies are actually right, and nothing in the build or the type checker
 * has any opinion about that.
 *
 * So these talk to PostgREST directly, as the signed-in household would, and
 * assert the refusals. They were written after checking each one by hand;
 * this is what keeps them checked. */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

test.describe("what row-level security refuses", () => {
  let token: string;
  let me: { id: string; family_id: string; is_organiser: boolean; role: string };

  test.beforeAll(async () => {
    test.skip(
      !SUPABASE_URL || !SUPABASE_KEY,
      "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are not set; skipping the database-level checks.",
    );
    const api = await playwrightRequest.newContext();
    const res = await api.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: SUPABASE_KEY!, "Content-Type": "application/json" },
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(res.ok(), "could not sign the throwaway account in").toBeTruthy();
    token = (await res.json()).access_token;

    const meRes = await api.get(`${SUPABASE_URL}/rest/v1/members?select=id,family_id,is_organiser,role&limit=200`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
    });
    const rows = await meRes.json();
    me = rows.find((r: typeof me & { role: string }) => r.role === "parent");
    expect(me, "the throwaway household has no parent row").toBeTruthy();
    await api.dispose();
  });

  /** A household may only ever see itself. This is the single assumption every
   * other query in the app is built on. */
  test("a household sees only its own members", async () => {
    const api = await playwrightRequest.newContext();
    const res = await api.get(`${SUPABASE_URL}/rest/v1/members?select=family_id&limit=500`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
    });
    const rows: { family_id: string }[] = await res.json();
    expect(rows.length).toBeGreaterThan(0);
    const families = [...new Set(rows.map((r) => r.family_id))];
    expect(families, "members from more than one household are visible").toEqual([me.family_id]);
    await api.dispose();
  });

  /** Nobody promotes themselves. The policies allow a member to update their
   * own row -- they have a profile to edit -- so a trigger holds the line on
   * the fields that decide what they may do. */
  test("a member cannot promote themselves", async () => {
    const api = await playwrightRequest.newContext();

    // Each value has to differ from what is already there. The trigger fires on
    // a field that changes, so patching a field to the value it already holds
    // is a no-op that rightly succeeds and proves nothing -- which is exactly
    // how the first version of this test managed to fail.
    const patches: Record<string, unknown>[] = [
      { role: me.role === "parent" ? "adult" : "parent" },
      { status: "removed" },
      { is_organiser: !me.is_organiser },
    ];

    for (const patch of patches) {
      const field = Object.keys(patch)[0];
      const res = await api.patch(`${SUPABASE_URL}/rest/v1/members?id=eq.${me.id}`, {
        headers: {
          apikey: SUPABASE_KEY!,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        data: patch,
      });
      expect(res.status(), `changing ${field} on your own membership was allowed`).toBeGreaterThanOrEqual(400);
    }

    // And the row is exactly as it was. If any of the above had slipped
    // through, this is where a demoted organiser would show up.
    const after = await api.get(`${SUPABASE_URL}/rest/v1/members?select=role,status,is_organiser&id=eq.${me.id}`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
    });
    expect((await after.json())[0]).toEqual({
      role: me.role,
      status: "active",
      is_organiser: me.is_organiser,
    });
    await api.dispose();
  });

  /** A row may not be moved into somebody else's household. Verified by hand
   * against a second throwaway family, which was refused with 42501; this
   * keeps it refused. A foreign key would also refuse an invented id, so the
   * assertion is only that it never succeeds. */
  test("a member cannot be moved into another household", async () => {
    const api = await playwrightRequest.newContext();
    const res = await api.patch(`${SUPABASE_URL}/rest/v1/members?id=eq.${me.id}`, {
      headers: {
        apikey: SUPABASE_KEY!,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      data: { family_id: "00000000-0000-4000-a000-0000000000ff" },
    });
    expect(res.status(), "a member was moved into another household").toBeGreaterThanOrEqual(400);
    await api.dispose();
  });

  /** A managed child's privileges are not a parent's to hand out.
   *
   * Applied 8 September, and this came off fixme in the same change, as the
   * migration file said it should.
   *
   * What it holds: members_guard_self_update opens with
   * `auth.uid() = old.auth_user_id`, and a managed child has no login, so
   * that is null rather than true and the guard is skipped for exactly the
   * rows nobody is signed in as. members_update_managed_by_parent then lets
   * any parent write the row, with no WITH CHECK of its own. Since
   * attach_login_to_child leaves is_organiser alone, a parent can set it on a
   * child and then give that child a login they control -- parent becomes
   * organiser. Reproduced against this household on 8 September and
   * reverted. */
  test("a managed child cannot be handed privileges", async () => {
    const api = await playwrightRequest.newContext();
    const res = await api.get(`${SUPABASE_URL}/rest/v1/members?select=id&auth_user_id=is.null&status=eq.managed&limit=1`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
    });
    const [child] = await res.json();
    expect(child, "the throwaway household has no managed child to test with").toBeTruthy();

    const patch = await api.patch(`${SUPABASE_URL}/rest/v1/members?id=eq.${child.id}`, {
      headers: {
        apikey: SUPABASE_KEY!,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      data: { is_organiser: true },
    });
    expect(patch.status(), "a managed child was made an organiser").toBeGreaterThanOrEqual(400);

    const after = await api.get(`${SUPABASE_URL}/rest/v1/members?select=is_organiser&id=eq.${child.id}`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
    });
    expect((await after.json())[0].is_organiser, "the child is an organiser now").toBe(false);
    await api.dispose();
  });

  /** A revenue target belongs to the person it is for.
   *
   * wealth_targets is private to read -- its SELECT policy names
   * member_id = current_member_id() -- and was open to write: both the INSERT
   * and UPDATE policies checked only the household. So anyone could set, and
   * silently overwrite, anyone else's target, and could not then see what
   * they had done.
   *
   * The page renders the control only for your own pane, with the comment
   * "Only your own target is yours to set." That is the right rule stated in
   * the one layer that cannot enforce it.
   *
   * Reproduced against this household on 8 September: HTTP 201, row confirmed
   * as the other member's, then removed.
   *
   * NOTE: no `Prefer: return=representation` below. With it, the SELECT policy
   * refuses to hand back somebody else's row and the write reports an error it
   * did not have -- which is how the first probe of this nearly passed. */
  test.fixme("nobody may set another member's revenue target", async () => {
    const api = await playwrightRequest.newContext();
    const others = await api.get(`${SUPABASE_URL}/rest/v1/members?select=id&id=neq.${me.id}&limit=1`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
    });
    const [other] = await others.json();
    expect(other, "the throwaway household has nobody else to test against").toBeTruthy();

    const res = await api.post(`${SUPABASE_URL}/rest/v1/wealth_targets`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { member_id: other.id, family_id: me.family_id, period_month: 9, period_year: 2031, target_amount: 999999 },
    });
    expect(res.status(), "another member's revenue target was writable").toBeGreaterThanOrEqual(400);
    await api.dispose();
  });

  /** The other half, and the one that catches a policy tightened into
   * uselessness: a policy that refuses everything also passes the test above. */
  test("your own revenue target is still yours to set", async () => {
    const api = await playwrightRequest.newContext();
    const res = await api.post(`${SUPABASE_URL}/rest/v1/wealth_targets`, {
      headers: {
        apikey: SUPABASE_KEY!,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      data: { member_id: me.id, family_id: me.family_id, period_month: 9, period_year: 2031, target_amount: 4242 },
    });
    expect(res.ok(), `could not set my own target: ${await res.text()}`).toBeTruthy();

    const cleanup = await api.delete(
      `${SUPABASE_URL}/rest/v1/wealth_targets?member_id=eq.${me.id}&period_year=eq.2031&period_month=eq.9`,
      { headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` } },
    );
    expect(cleanup.ok(), "left a test target behind").toBeTruthy();
    await api.dispose();
  });

  /** The tokens behind Google Drive and Calendar are deliberately invisible to
   * the signed-in roles -- only the server's own key may read them. */
  test("connected-account tokens are not readable", async () => {
    const api = await playwrightRequest.newContext();
    for (const table of ["drive_tokens", "calendar_tokens"]) {
      const res = await api.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5`, {
        headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
      });
      const rows = res.ok() ? await res.json() : [];
      expect(Array.isArray(rows) ? rows.length : 0, `${table} is readable by a signed-in member`).toBe(0);
    }
    await api.dispose();
  });
});
