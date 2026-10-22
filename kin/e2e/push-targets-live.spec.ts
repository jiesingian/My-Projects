import { test, expect } from "@playwright/test";
import { restAsQa, type Rest } from "./support/qa-household";
import { restAsPartner, ensurePartnerInHousehold } from "./support/qa-partner";

/** Who a push reaches, against the live dev schema with two real logins
 * (20261021130000_push_targets_per_push.sql). The PGlite probe proves the
 * function; this proves the function dev actually runs, under real RLS.
 *
 * Pat (the QA partner) saves a stand-in device whose address goes nowhere
 * (push.invalid); Quinn (the QA account) adds a list line and asks who to
 * tell. The answer must be Pat's device, once -- and nothing for a second
 * ask, for an event nobody caused, for the wrong kind, for Pat borrowing
 * Quinn's line, or for Quinn's own devices. No push is sent: the step
 * from here to a phone (deliver(), web-push) did not change.
 *
 * Writes one To-Buy line and one device row, both removed in afterAll.
 * Nothing on a page counts either while this runs (smoke.spec reads no
 * To-Buy totals; the screenshots run after this step). Without Pat's login
 * it skips and says so. */

const RUN = `pt-${Date.now().toString(36)}`;
const DEVICE = `https://push.invalid/kin-e2e/${RUN}`;

let qa: Rest | null = null;
let pat: Rest | null = null;
let familyId = "";
let quinnId = "";
let patId = "";
let item = "";

async function call(r: Rest, fn: string, body: unknown) {
  return r.ctx.post(`${r.url}/rest/v1/rpc/${fn}`, { headers: { ...r.headers, "Content-Type": "application/json" }, data: body });
}

async function targets(r: Rest, kind: string, members: string[], source: string): Promise<string[]> {
  const res = await call(r, "push_targets", { p_kind: kind, p_member_ids: members, p_source: source });
  expect(res.ok(), `push_targets: ${res.status()} ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { endpoint: string }[]).map((t) => t.endpoint);
}

async function myMember(r: Rest): Promise<{ id: string; family_id: string }> {
  const user = await r.ctx.get(`${r.url}/auth/v1/user`, { headers: r.headers });
  const { id } = (await user.json()) as { id: string };
  const res = await r.ctx.get(`${r.url}/rest/v1/members?select=id,family_id&status=eq.active&auth_user_id=eq.${id}`, { headers: r.headers });
  const [row] = (await res.json()) as { id: string; family_id: string }[];
  return row;
}

test.describe("push_targets on dev: only the people this push is for", () => {
  test.beforeAll(async () => {
    qa = await restAsQa();
    pat = await restAsPartner();
    if (!qa || !pat) return;
    ({ id: quinnId, family_id: familyId } = await myMember(qa));
    patId = await ensurePartnerInHousehold(qa, pat, familyId);
    const device = await pat.ctx.post(`${pat.url}/rest/v1/push_subscriptions`, {
      headers: { ...pat.headers, "Content-Type": "application/json" },
      data: { member_id: patId, family_id: familyId, endpoint: DEVICE, p256dh: "e2e-stand-in", auth: "e2e" },
    });
    expect(device.ok(), `Pat's stand-in device: ${device.status()} ${await device.text()}`).toBeTruthy();
    const line = await qa.ctx.post(`${qa.url}/rest/v1/buy_items`, {
      headers: { ...qa.headers, "Content-Type": "application/json", Prefer: "return=representation" },
      data: { family_id: familyId, name: `E2E push check ${RUN}`, created_by: quinnId, source: "house", section: "Other" },
    });
    expect(line.ok(), `Quinn's list line: ${line.status()} ${await line.text()}`).toBeTruthy();
    item = ((await line.json()) as { id: string }[])[0].id;
  });

  test.afterAll(async () => {
    if (qa && item) await qa.ctx.delete(`${qa.url}/rest/v1/buy_items?id=eq.${item}`, { headers: qa.headers });
    if (pat) await pat.ctx.delete(`${pat.url}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(DEVICE)}`, { headers: pat.headers });
    await qa?.ctx.dispose();
    await pat?.ctx.dispose();
  });

  test("a list line reaches Pat's device once, and nothing else gets anything", async () => {
    test.skip(!qa || !pat, "E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD are not set -- push targets were NOT checked (docs/QA_HOUSEHOLDS.md).");
    const everyone = [quinnId, patId];

    const old = await call(qa!, "push_targets", { p_kind: "shopping", p_member_ids: everyone });
    expect(old.ok(), "the old two-argument push_targets is gone").toBeFalsy();

    expect(await targets(qa!, "shopping", everyone, crypto.randomUUID()), "no event behind it").toEqual([]);
    expect(await targets(qa!, "chat", everyone, item), "a list line is not a chat message").toEqual([]);
    expect(await targets(pat!, "shopping", everyone, item), "Pat cannot borrow Quinn's line").toEqual([]);

    const first = await targets(qa!, "shopping", everyone, item);
    expect(first, "Quinn's line reaches Pat's device").toContain(DEVICE);
    expect(await targets(qa!, "shopping", everyone, item), "and only once").toEqual([]);
  });
});
