"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { clamp } from "@/lib/text";
import type { ActionState } from "@/lib/actions/auth";

/** Every write to a connection goes through a security-definer function that
 * re-checks the caller (20260929060000_connections.sql). These turn the
 * database's own refusals into sentences. */
function readable(message: string): string {
  if (message.includes("No one has that code")) return "No one has that code. Check it and try again.";
  if (message.includes("That is you")) return "That's your own code.";
  if (message.includes("not in your family tree")) return "That person isn't in your family tree.";
  if (message.includes("no longer open")) return "That request has already been answered.";
  if (message.includes("not yours to change")) return "That connection isn't yours to change.";
  if (message.includes("grown-ups")) return "Codes are for grown-ups. You can still connect with anyone in your family.";
  return "That didn't work. Try again in a moment.";
}

function done(): ActionState {
  revalidatePath("/family/connections");
  revalidatePath("/chat", "layout");
  return { error: null };
}

export async function requestConnectionAction(personId: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_connection", { p_person_id: personId });
  return error ? { error: readable(error.message) } : done();
}

export async function requestConnectionByCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: readable("grown-ups") };
  const code = clamp(String(formData.get("code") ?? "").replace(/[\s-]/g, ""), 20);
  if (!code) return { error: "Enter the code they gave you." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_connection_by_code", { p_code: code });
  return error ? { error: readable(error.message) } : done();
}

export async function respondConnectionAction(id: string, accept: boolean): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_connection", { p_id: id, p_accept: accept });
  return error ? { error: readable(error.message) } : done();
}

export async function removeConnectionAction(id: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_connection", { p_id: id });
  return error ? { error: readable(error.message) } : done();
}

/** A fresh code; the old one stops working at once. */
export async function newConnectionCodeAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: readable("grown-ups") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("my_connection_code", { p_new: true });
  return error ? { error: readable(error.message) } : done();
}
