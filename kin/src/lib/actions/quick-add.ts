"use server";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { createActivityAction, createEventAction } from "@/lib/actions/planner";
import { addBuyItemAction } from "@/lib/actions/household";
import type { ActionState } from "@/lib/actions/auth";
import type { QuickParse } from "@/lib/quick-line";

/** Saves what one-line add read (lib/quick-line.ts), exactly as the preview
 * showed it, through the same actions the full forms use -- so validation,
 * calendar sync and the shopping push stay in one place each. A task or an
 * event lands on the Planner (those actions redirect there); a shopping item
 * returns, and the line says it was added. */
export async function quickAddAction(item: QuickParse): Promise<ActionState> {
  const me = await requireCurrentMember();
  const form = new FormData();

  if (item.kind === "shopping") {
    form.set("name", item.name);
    if (item.quantity !== null) form.set("quantity", String(item.quantity));
    if (item.unit) form.set("unit", item.unit);
    form.set("section", item.section);
    form.set("source", "house");
    return addBuyItemAction({ error: null }, form);
  }

  // The ids came from the phone: keep only people in this household.
  const supabase = await createClient();
  const { data: members } = await supabase.from("members").select("id").eq("family_id", me.family_id);
  const ours = new Set((members ?? []).map((m) => m.id));
  const who = item.who.filter((id) => ours.has(id));
  if (item.wholeFamily) form.set("whole_family", "on");
  else for (const id of who.length > 0 ? who : [me.id]) form.append("who", id);
  form.set("title", item.title);
  form.set("date", item.date);

  if (item.kind === "event") {
    form.set("kind", item.eventKind);
    if (item.note) form.set("sub_note", item.note);
    return createEventAction({ error: null }, form);
  }
  if (item.from) form.set("from", item.from);
  if (item.to) form.set("to", item.to);
  form.set("repeat", "once");
  return createActivityAction({ error: null }, form);
}
