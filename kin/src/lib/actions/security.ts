"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { constantTimeEquals, hashPin, newSalt, randomToken, sha256, toBase64Url } from "@/lib/security/crypto";
import { verifyAssertion, ES256, RS256 } from "@/lib/security/webauthn";
import { CHALLENGE_COOKIE, UNLOCK_COOKIE, UNLOCK_MINUTES, getLockState, relyingParty } from "@/lib/security/gate";
import { lockChangeProblem } from "@/lib/security/lock-rules";
import type { ActionState } from "@/lib/actions/auth";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;
const secure = process.env.NODE_ENV === "production";

/** Whether the lock is a real obstacle comes down to two numbers: how slow
 * the hash is, and how many guesses you get. scrypt is the first; this is
 * the second, and it is counted server side because an attacker holding the
 * phone owns everything on it. */
async function readSecurity(memberId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("member_security")
    .select("pin_hash, pin_salt, failed_attempts, locked_until")
    .eq("member_id", memberId)
    .maybeSingle();
  return { supabase, row: data };
}

/** The server's half of lockChangeProblem: null when this member may change
 * their lock now, otherwise the reason they may not. */
async function lockedAgainstChanges(memberId: string): Promise<string | null> {
  return lockChangeProblem(await getLockState(memberId));
}

async function grantUnlock(memberId: string): Promise<ActionState> {
  const supabase = await createClient();
  const token = randomToken();
  const expires = new Date(Date.now() + UNLOCK_MINUTES * 60_000);

  const { error } = await supabase
    .from("member_security")
    .update({
      unlock_token_hash: toBase64Url(sha256(token)),
      unlock_expires_at: expires.toISOString(),
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("member_id", memberId);
  if (error) return { error: humanDatabaseError(error.message) };

  const jar = await cookies();
  jar.set(UNLOCK_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires });
  jar.delete(CHALLENGE_COOKIE);

  revalidatePath("/family");
  return { error: null };
}

export async function lockDocumentsAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  await supabase
    .from("member_security")
    .update({ unlock_token_hash: null, unlock_expires_at: null, updated_at: new Date().toISOString() })
    .eq("member_id", me.id);

  const jar = await cookies();
  jar.delete(UNLOCK_COOKIE);
  revalidatePath("/family");
  return { error: null };
}

// -- PIN ---------------------------------------------------------------

function pinProblem(pin: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return "A PIN is 4 to 8 digits.";
  if (/^(\d)\1+$/.test(pin)) return "That PIN is all one digit. Pick something else.";
  return null;
}

export async function setDocumentsPinAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const refused = await lockedAgainstChanges(me.id);
  if (refused) return { error: refused };
  const pin = String(formData.get("pin") ?? "");
  const again = String(formData.get("pin_confirm") ?? "");
  const problem = pinProblem(pin);
  if (problem) return { error: problem };
  if (pin !== again) return { error: "Those two PINs don't match." };

  // Changing an existing PIN needs the old one. Otherwise anybody holding
  // the unlocked phone can simply replace the lock.
  const { supabase, row } = await readSecurity(me.id);
  if (row?.pin_hash && row.pin_salt) {
    const current = String(formData.get("current_pin") ?? "");
    const attempt = await hashPin(current, row.pin_salt);
    if (!constantTimeEquals(attempt, row.pin_hash)) return { error: "That isn't your current PIN." };
  }

  const salt = newSalt();
  const { error } = await supabase.from("member_security").upsert(
    {
      member_id: me.id,
      pin_hash: await hashPin(pin, salt),
      pin_salt: salt,
      pin_set_at: new Date().toISOString(),
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "member_id" },
  );
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/family");
  revalidatePath("/settings", "layout");
  return { error: null };
}

export async function unlockWithPinAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const pin = String(formData.get("pin") ?? "");
  const { supabase, row } = await readSecurity(me.id);
  if (!row?.pin_hash || !row.pin_salt) return { error: "No PIN is set for this account." };

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 60_000));
    return { error: `Too many tries. Wait ${mins} minute${mins === 1 ? "" : "s"}.` };
  }

  const attempt = await hashPin(pin, row.pin_salt);
  if (!constantTimeEquals(attempt, row.pin_hash)) {
    const failed = (row.failed_attempts ?? 0) + 1;
    await supabase
      .from("member_security")
      .update({
        failed_attempts: failed,
        locked_until: failed >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("member_id", me.id);
    const left = MAX_ATTEMPTS - failed;
    return {
      error: left > 0 ? `That PIN didn't match. ${left} ${left === 1 ? "try" : "tries"} left.` : `Too many tries. Wait ${LOCKOUT_MINUTES} minutes.`,
    };
  }

  return grantUnlock(me.id);
}

export async function removeDocumentsPinAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const refused = await lockedAgainstChanges(me.id);
  if (refused) return { error: refused };
  const supabase = await createClient();
  const { error } = await supabase
    .from("member_security")
    .update({ pin_hash: null, pin_salt: null, pin_set_at: null, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
    .eq("member_id", me.id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  revalidatePath("/settings", "layout");
  return { error: null };
}

// -- Face, fingerprint, device passcode --------------------------------

/** A challenge the server issued, kept where the page cannot read it. Both
 * ceremonies use the same cookie, and it is single-use: consumed on the way
 * back, so a captured response cannot be replayed. */
async function issueChallenge(): Promise<string> {
  const challenge = randomToken();
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(Date.now() + 5 * 60_000),
  });
  return challenge;
}

export type RegistrationOptions = { challenge: string; rpId: string; memberId: string; memberName: string; excludeIds: string[] };

export async function beginBiometricSetupAction(): Promise<RegistrationOptions> {
  const me = await requireCurrentMember();
  // Throws rather than returning an error: this hands back the options the
  // browser needs, and the screen only offers setup once the lock is open.
  const refused = await lockedAgainstChanges(me.id);
  if (refused) throw new Error(refused);
  const supabase = await createClient();
  const { data } = await supabase.from("member_webauthn_credentials").select("credential_id").eq("member_id", me.id);
  const { rpId } = await relyingParty();
  return {
    challenge: await issueChallenge(),
    rpId,
    memberId: me.id,
    memberName: me.full_name,
    excludeIds: (data ?? []).map((d) => d.credential_id),
  };
}

export async function finishBiometricSetupAction(input: {
  credentialId: string;
  publicKeySpkiBase64: string;
  alg: number;
  clientDataJSON: string;
  label: string;
}): Promise<ActionState> {
  const me = await requireCurrentMember();
  const refused = await lockedAgainstChanges(me.id);
  if (refused) return { error: refused };
  const jar = await cookies();
  const expected = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!expected) return { error: "That took too long. Try setting it up again." };

  if (input.alg !== ES256 && input.alg !== RS256) {
    return { error: "This device uses a signature we don't support yet. A PIN will still work." };
  }

  // Registration is not signed, so the checks that matter are the challenge
  // and the origin -- the same two the assertion path checks, for the same
  // reason.
  const { origin } = await relyingParty();
  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(Buffer.from(input.clientDataJSON, "base64").toString("utf8"));
  } catch {
    return { error: "That setup response was malformed." };
  }
  if (clientData.type !== "webauthn.create") return { error: "That setup response was for something else." };
  if (clientData.challenge !== expected) return { error: "That took too long. Try setting it up again." };
  if (clientData.origin !== origin) return { error: "That setup came from the wrong place." };

  const supabase = await createClient();
  const { error } = await supabase.from("member_webauthn_credentials").insert({
    member_id: me.id,
    credential_id: input.credentialId,
    public_key: input.publicKeySpkiBase64,
    alg: input.alg,
    label: input.label.slice(0, 60) || "This device",
  });
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/family");
  revalidatePath("/settings", "layout");
  return { error: null };
}

export type AssertionOptions = { challenge: string; rpId: string; allowIds: string[] };

export async function beginBiometricUnlockAction(): Promise<AssertionOptions> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data } = await supabase.from("member_webauthn_credentials").select("credential_id").eq("member_id", me.id);
  const { rpId } = await relyingParty();
  return { challenge: await issueChallenge(), rpId, allowIds: (data ?? []).map((d) => d.credential_id) };
}

export async function finishBiometricUnlockAction(input: {
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}): Promise<ActionState> {
  const me = await requireCurrentMember();
  const jar = await cookies();
  const expected = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!expected) return { error: "That took too long. Try again." };

  const supabase = await createClient();
  // Scoped to this member, so a credential id from somebody else's account
  // finds nothing rather than verifying against their key.
  const { data: credential } = await supabase
    .from("member_webauthn_credentials")
    .select("id, public_key, alg, sign_count")
    .eq("member_id", me.id)
    .eq("credential_id", input.credentialId)
    .maybeSingle();
  if (!credential) return { error: "That device isn't set up for this account." };

  const { rpId, origin } = await relyingParty();
  const result = await verifyAssertion({
    publicKeySpkiBase64: credential.public_key,
    alg: credential.alg,
    authenticatorData: input.authenticatorData,
    clientDataJSON: input.clientDataJSON,
    signature: input.signature,
    expectedChallenge: expected,
    expectedOrigin: origin,
    expectedRpId: rpId,
    storedSignCount: Number(credential.sign_count ?? 0),
  });
  if (!result.ok) return { error: result.reason };

  await supabase
    .from("member_webauthn_credentials")
    .update({ sign_count: result.signCount, last_used_at: new Date().toISOString() })
    .eq("id", credential.id);

  return grantUnlock(me.id);
}

export async function removeBiometricCredentialAction(credentialRowId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const refused = await lockedAgainstChanges(me.id);
  if (refused) return { error: refused };
  const supabase = await createClient();
  const { error } = await supabase
    .from("member_webauthn_credentials")
    .delete()
    .eq("id", credentialRowId)
    .eq("member_id", me.id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  revalidatePath("/settings", "layout");
  return { error: null };
}
