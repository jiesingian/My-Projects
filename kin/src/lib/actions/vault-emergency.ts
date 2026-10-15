"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { getLockState } from "@/lib/security/gate";
import { isGrownUp } from "@/lib/roles";
import { emergencyError, isWaitDays, reasonProblem } from "@/lib/vault-emergency";
import type { ActionState } from "@/lib/actions/auth";

// Emergency access to the vault (20261015120000). Every rule -- who may name,
// ask, answer or read, and whether a request is open -- is enforced by the
// database's own functions; the browser could call them directly and get the
// same answers. What these add is the lock (a person's own PIN or Face ID)
// in front of anything that opens the vault or widens who can, and the
// database's refusals in words.
//
// Saying no is never behind the lock: Deny, Revoke and Remove work as soon
// as a grown-up is signed in. Stopping should never be harder than starting.

async function unlockedGrownUp(): Promise<{ error: string } | { memberId: string; familyId: string }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only grown-ups can do that." };
  const lock = await getLockState(me.id);
  if (!lock.unlocked) return { error: "Unlock first — the lock closed while this was open." };
  return { memberId: me.id, familyId: me.family_id };
}

function done(): ActionState {
  revalidatePath("/settings/privacy", "layout");
  return { error: null };
}

export async function nameTrustedPersonAction(memberId: string, waitDays: number): Promise<ActionState> {
  const g = await unlockedGrownUp();
  if ("error" in g) return g;
  if (!isWaitDays(waitDays)) return { error: "Choose a wait of 1, 3 or 7 days." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("name_vault_emergency_contact", { p_member: memberId, p_wait_days: waitDays });
  return error ? { error: emergencyError(error.message) } : done();
}

export async function removeTrustedPersonAction(contactId: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_vault_emergency_contact", { p_contact: contactId });
  return error ? { error: emergencyError(error.message) } : done();
}

export async function answerEmergencyRequestAction(requestId: string, answer: "deny" | "allow" | "revoke"): Promise<ActionState> {
  if (answer === "allow") {
    // Opening the vault early is a widening, so it meets the lock.
    const g = await unlockedGrownUp();
    if ("error" in g) return g;
  } else {
    await requireCurrentMember();
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_vault_emergency_request", { p_request: requestId, p_answer: answer });
  return error ? { error: emergencyError(error.message) } : done();
}

export async function requestEmergencyAccessAction(familyId: string, reason: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only grown-ups can ask for emergency access." };
  const problem = reasonProblem(reason);
  if (problem) return { error: problem };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_vault_emergency_access", { p_family: familyId, p_reason: reason.trim() });
  return error ? { error: emergencyError(error.message) } : done();
}

export type OpenedPassword = { kind: "password"; id: string; group: string; label: string; username: string | null; secret: string; note: string | null };
export type OpenedFile = { id: string; name: string; provider: string; storagePath: string | null };
export type OpenedDocument = {
  kind: "document";
  id: string;
  title: string;
  folder: string | null;
  owner: string | null;
  docType: string | null;
  referenceNo: string | null;
  expiresAt: string | null;
  note: string | null;
  files: OpenedFile[];
};

/** Open one item of the other household's vault. The database logs the
 * opening in the same step as handing it over, so it cannot be read without
 * the household seeing that it was. Behind the reader's own lock. */
export async function openEmergencyItemAction(
  requestId: string,
  kind: "password" | "document",
  id: string,
): Promise<{ error: string } | { item: OpenedPassword | OpenedDocument }> {
  const g = await unlockedGrownUp();
  if ("error" in g) return g;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_vault_emergency_item", { p_request: requestId, p_kind: kind, p_id: id });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { error: emergencyError(error?.message ?? "") };
  const d = data as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  if (d.kind === "password") {
    return {
      item: { kind: "password", id: String(d.id), group: str(d.group) ?? "", label: str(d.label) ?? "", username: str(d.username), secret: str(d.secret) ?? "", note: str(d.note) },
    };
  }
  const files = Array.isArray(d.files) ? (d.files as Record<string, unknown>[]) : [];
  return {
    item: {
      kind: "document",
      id: String(d.id),
      title: str(d.title) ?? "",
      folder: str(d.folder),
      owner: str(d.owner),
      docType: str(d.docType),
      referenceNo: str(d.referenceNo),
      expiresAt: str(d.expiresAt),
      note: str(d.note),
      files: files.map((f) => ({ id: String(f.id), name: str(f.name) ?? "File", provider: str(f.provider) ?? "", storagePath: str(f.storagePath) })),
    },
  };
}

/** A short-lived link to one file of an opened document. Storage's own
 * policy decides: only while access is open, only a file indexed on an
 * entry opened in the last hour, only under that household's folder. */
export async function emergencyFileUrlAction(path: string): Promise<string | null> {
  const g = await unlockedGrownUp();
  if ("error" in g) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 5);
  if (error) return null;
  return data.signedUrl;
}
