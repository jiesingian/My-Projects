"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { databaseError } from "@/lib/report-error";
import { isGrownUp } from "@/lib/roles";
import { UUID } from "@/lib/ids";
import { READY_DEFAULTS, cleanReadyLabel } from "@/lib/typhoon";
import { askAreYouOkayAction } from "@/lib/actions/member-card";
import type { ActionState } from "@/lib/actions/auth";

function revalidate() {
  revalidatePath("/today");
  revalidatePath("/family/ready");
}

/** Typhoon mode on or off (a grown-up; set_typhoon_mode checks it again).
 * Switching it on with an empty checklist starts it from READY_DEFAULTS. */
export async function setTyphoonModeAction(on: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can switch Typhoon mode." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_typhoon_mode", { p_on: on === true });
  if (error) return { error: databaseError(error) };
  if (on) {
    const seeded = await startChecklist(supabase, me.family_id);
    if (seeded) return { error: seeded };
  }
  revalidate();
  return { error: null };
}

async function startChecklist(supabase: Awaited<ReturnType<typeof createClient>>, familyId: string): Promise<string | null> {
  const { count } = await supabase.from("ready_items").select("id", { count: "exact", head: true }).eq("family_id", familyId);
  if ((count ?? 0) > 0) return null;
  const { error } = await supabase.from("ready_items").insert(READY_DEFAULTS.map((label, i) => ({ family_id: familyId, label, sort: i })));
  return error ? databaseError(error) : null;
}

/** The checklist from the defaults, for a household that opens it before a
 * storm is near. Anyone in the household. */
export async function startReadyChecklistAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const err = await startChecklist(await createClient(), me.family_id);
  if (err) return { error: err };
  revalidate();
  return { error: null };
}

/** Tick or untick an item; who ticked it is stamped by the database. */
export async function tickReadyItemAction(id: string, done: boolean): Promise<ActionState> {
  if (!UUID.test(id)) return { error: "That item wasn't found." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("ready_items").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidate();
  return { error: null };
}

export async function addReadyItemAction(label: string): Promise<ActionState> {
  const clean = cleanReadyLabel(String(label ?? ""));
  if (!clean) return { error: "Say what to get ready, in up to 80 characters." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("ready_items").insert({ family_id: me.family_id, label: clean, sort: 1000 });
  if (error) return { error: databaseError(error) };
  revalidate();
  return { error: null };
}

export async function removeReadyItemAction(id: string): Promise<ActionState> {
  if (!UUID.test(id)) return { error: "That item wasn't found." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("ready_items").delete().eq("id", id).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidate();
  return { error: null };
}

/** "Are you okay?" to everyone in the household with Kin on a phone, in one
 * tap: the same check-in a member card sends, one per person. A grown-up. */
export async function askEveryoneAction(): Promise<ActionState & { asked?: number }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "A grown-up asks everyone at once." };
  const supabase = await createClient();
  const { data: people } = await supabase.from("members").select("id, auth_user_id, status").eq("family_id", me.family_id);
  const targets = (people ?? []).filter((p) => p.id !== me.id && p.status === "active" && p.auth_user_id);
  if (targets.length === 0) return { error: "Nobody else in the household has Kin on a phone of their own yet." };
  const results = await Promise.all(targets.map((t) => askAreYouOkayAction(t.id)));
  const asked = results.filter((r) => !r.error).length;
  return asked > 0 ? { error: null, asked } : { error: results[0]?.error ?? "Nobody could be asked." };
}
