"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { clamp } from "@/lib/text";
import type { ActionState } from "@/lib/actions/auth";

/** Linking two households is the only thing in Kin that reaches past
 * family_id, so all three writes go through security-definer functions that
 * re-check the caller themselves. What is here is the wording: the database
 * raises in its own voice, and these turn that into a sentence somebody can
 * act on. */
function readable(message: string): string {
  if (message.includes("No household has that code")) return "No household has that code. Check it and try again.";
  if (message.includes("your own household")) return "That's your own code.";
  if (message.includes("not made to your household")) return "That request was made to a different household.";
  if (message.includes("no longer open")) return "That request has already been answered.";
  if (message.includes("not yours to change")) return "That link isn't yours to change.";
  if (message.includes("parent or another adult")) return "Only a parent or another adult can do that.";
  return "That didn't work. Try again in a moment.";
}

export async function requestFamilyLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can link households." };

  const code = clamp(String(formData.get("code") ?? "").trim(), 40);
  if (!code) return { error: "Enter the other household's code." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_family_link", { code });
  if (error) return { error: readable(error.message) };

  revalidatePath("/journal");
  return { error: null };
}

export async function respondFamilyLinkAction(linkId: string, accept: boolean): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_family_link", { link_id: linkId, accept });
  if (error) return { error: readable(error.message) };
  revalidatePath("/journal");
  return { error: null };
}

export async function revokeFamilyLinkAction(linkId: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_family_link", { link_id: linkId });
  if (error) return { error: readable(error.message) };
  revalidatePath("/journal");
  return { error: null };
}

/** Sharing is per entry and opt-in. Nothing is shared by writing it, and
 * un-sharing takes effect on the next read rather than leaving a copy
 * anywhere -- the other household sees the row through a policy, so there is
 * nothing to withdraw. */
export async function setEntrySharedAction(entryId: string, shared: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("journal_entries")
    .update({ shared_at: shared ? new Date().toISOString() : null })
    .eq("id", entryId)
    .eq("family_id", me.family_id);
  if (error) return { error: "That memory couldn't be updated." };
  revalidatePath("/journal");
  return { error: null };
}
