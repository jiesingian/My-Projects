import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sha256, toBase64Url } from "@/lib/security/crypto";

export const UNLOCK_COOKIE = "kin_docs_unlock";
export const CHALLENGE_COOKIE = "kin_webauthn_challenge";
/** Long enough to actually read a document, short enough that a phone left
 * on a table re-locks itself. */
export const UNLOCK_MINUTES = 10;

export type LockState = {
  /** Has this member set anything up? No lock configured means no gate --
   * the feature is opt-in, and a household that never turns it on should
   * never meet it. */
  configured: boolean;
  hasPin: boolean;
  credentialCount: number;
  unlocked: boolean;
  lockedUntil: string | null;
};

export async function getLockState(memberId: string): Promise<LockState> {
  const supabase = await createClient();
  const [{ data: row }, { count }] = await Promise.all([
    supabase
      .from("member_security")
      .select("pin_hash, unlock_token_hash, unlock_expires_at, locked_until")
      .eq("member_id", memberId)
      .maybeSingle(),
    supabase
      .from("member_webauthn_credentials")
      .select("id", { count: "exact", head: true })
      .eq("member_id", memberId),
  ]);

  const hasPin = Boolean(row?.pin_hash);
  const credentialCount = count ?? 0;
  const configured = hasPin || credentialCount > 0;

  if (!configured) {
    return { configured: false, hasPin: false, credentialCount: 0, unlocked: true, lockedUntil: null };
  }

  const jar = await cookies();
  const token = jar.get(UNLOCK_COOKIE)?.value;
  const fresh =
    Boolean(token) &&
    Boolean(row?.unlock_token_hash) &&
    Boolean(row?.unlock_expires_at) &&
    new Date(row!.unlock_expires_at!).getTime() > Date.now() &&
    toBase64Url(sha256(token!)) === row!.unlock_token_hash;

  return {
    configured: true,
    hasPin,
    credentialCount,
    unlocked: fresh,
    lockedUntil: row?.locked_until ?? null,
  };
}

/** The relying party is the hostname and nothing else -- a port or a scheme
 * in here is the single most common reason a credential registers happily
 * and then refuses to ever sign. */
export async function relyingParty(): Promise<{ rpId: string; origin: string }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { rpId: host.split(":")[0], origin: `${proto}://${host}` };
}
