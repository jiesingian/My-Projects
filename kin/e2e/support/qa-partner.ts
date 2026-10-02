import { expect, request as playwrightRequest } from "@playwright/test";
import type { Rest } from "./qa-household";

/** The second grown-up in the throwaway household.
 *
 * Privacy between members can only be tested by a member who is not the one
 * that owns the thing, and until 2 October the QA household had one login.
 * E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD are a second login in kin-dev
 * (docs/QA_HOUSEHOLDS.md), joined to "ZZ QA Testbed (throwaway)" as an adult.
 *
 * Returns null when the two variables are unset, so a spec can skip -- and
 * say so -- rather than pass having checked nothing. */
export async function restAsPartner(): Promise<Rest | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_PARTNER_EMAIL;
  const password = process.env.E2E_PARTNER_PASSWORD;
  if (!url || !key || !email || !password) return null;

  const ctx = await playwrightRequest.newContext();
  const auth = await ctx.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: { email, password },
  });
  if (!auth.ok()) {
    await ctx.dispose();
    throw new Error(`Could not sign the QA partner in: ${auth.status()} ${await auth.text()}`);
  }
  return { ctx, url, headers: { apikey: key, Authorization: `Bearer ${(await auth.json()).access_token}` } };
}

export const PARTNER_NAME = "Pat QA Partner";

type MemberRow = { id: string; family_id: string; role: string; status: string };

/** Puts the partner in the QA account's household as an active adult, the
 * way a person gets there: the partner redeems the household's invite code
 * (join_family, what joinFamilyAction calls -- it always asks for "adult"),
 * then the QA account, as organizer, lets them in as an adult (the update
 * approveMemberAction makes). No elevated key; RLS decides each step.
 *
 * A one-time setup that is safe to repeat: if the partner is already an
 * active adult there, nothing is written. Anything else unexpected -- the
 * partner in some other household, removed, a different role -- fails
 * loudly instead of being "fixed" by a test. */
export async function ensurePartnerInHousehold(qa: Rest, partner: Rest, familyId: string): Promise<string> {
  const user = await partner.ctx.get(`${partner.url}/auth/v1/user`, { headers: partner.headers });
  expect(user.ok(), "could not read the partner's sign-in").toBeTruthy();
  const { id: authId } = (await user.json()) as { id: string };

  const find = async (): Promise<MemberRow[]> => {
    const res = await qa.ctx.get(`${qa.url}/rest/v1/members?select=id,family_id,role,status&auth_user_id=eq.${authId}`, { headers: qa.headers });
    expect(res.ok(), `could not look the partner up: ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json()) as MemberRow[];
  };

  let rows = await find();
  if (rows.length === 0) {
    const fam = await qa.ctx.get(`${qa.url}/rest/v1/families?select=invite_code&id=eq.${familyId}`, { headers: qa.headers });
    expect(fam.ok(), "could not read the household's invite code").toBeTruthy();
    const [{ invite_code }] = (await fam.json()) as { invite_code: string }[];
    const join = await partner.ctx.post(`${partner.url}/rest/v1/rpc/join_family`, {
      headers: { ...partner.headers, "Content-Type": "application/json" },
      data: { p_invite_code: invite_code, p_full_name: PARTNER_NAME, p_role: "adult" },
    });
    // "already a member" means the partner is in a household the QA account
    // cannot see -- somebody else's. Not something to paper over.
    expect(join.ok(), `the partner could not redeem the invite code: ${join.status()} ${await join.text()}`).toBeTruthy();
    rows = await find();
  }
  expect(rows.length, "the partner is not in the QA household (in another one, or the join did not land)").toBe(1);
  const row = rows[0];

  // Pending: approveMemberAction's update. Active but not an adult:
  // setMemberRoleAction's, made by the QA account as a parent.
  if (row.family_id === familyId && (row.status === "pending" || (row.status === "active" && row.role !== "adult"))) {
    const change = await qa.ctx.patch(`${qa.url}/rest/v1/members?id=eq.${row.id}&family_id=eq.${familyId}`, {
      headers: { ...qa.headers, "Content-Type": "application/json", Prefer: "return=representation" },
      data: row.status === "pending" ? { status: "active", role: "adult" } : { role: "adult" },
    });
    expect(change.ok(), `the QA account could not make the partner an active adult: ${change.status()} ${await change.text()}`).toBeTruthy();
    expect((await change.json()) as unknown[], "making the partner an active adult changed nothing -- is the QA account the organizer, and a parent?").toHaveLength(1);
    Object.assign(row, (await find())[0]);
  }
  expect(row.family_id, "the partner belongs to a different household").toBe(familyId);
  expect({ status: row.status, role: row.role }, "the partner should be an active adult in the QA household").toEqual({ status: "active", role: "adult" });
  return row.id;
}
