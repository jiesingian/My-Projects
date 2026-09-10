"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { familyDay } from "@/lib/time";
import { humanDatabaseError } from "@/lib/db-errors";
import { explainVisibilityRefusal } from "@/lib/visibility";
import { clamp } from "@/lib/text";

const GROUPED_TYPES = new Set(["illness", "checkup", "medication", "vaccination"]);

export async function createHealthEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const memberId = String(formData.get("member_id") ?? "");
  const type = String(formData.get("type") ?? "");
  const date = String(formData.get("date") ?? familyDay());
  const title = clamp(String(formData.get("title") ?? ""), 150);
  const value = clamp(String(formData.get("value") ?? ""), 100);
  const seenBy = clamp(String(formData.get("seen_by") ?? ""), 100) || null;
  const where = clamp(String(formData.get("where") ?? ""), 150) || null;
  const notes = clamp(String(formData.get("notes") ?? ""), 1000);
  const visibility = String(formData.get("visibility") ?? "family");

  if (!memberId || !title) return { error: "Fill in the title." };

  if (GROUPED_TYPES.has(type)) {
    let groupId = String(formData.get("group_id") ?? "");
    const newGroupName = clamp(String(formData.get("new_group_name") ?? title), 150);
    if (!groupId || groupId === "__new__") {
      const { data: group, error: groupErr } = await supabase
        .from("health_conditions")
        .insert({
          family_id: me.family_id,
          member_id: memberId,
          name: newGroupName,
          status: type === "illness" ? "active" : "routine",
          visibility,
          created_by: me.id,
        })
        .select()
        .single();
      // A refusal here is the SELECT policy declining to hand back a
      // "parents" row to someone who is not a parent -- the insert is allowed,
      // the RETURNING is not, and the statement rolls back. Correct, but the
      // raw message is a sentence about tables and policies.
      if (groupErr) return { error: explainVisibilityRefusal(groupErr.message) };
      groupId = group.id;
    }
    const note = [title, seenBy && `Seen by ${seenBy}`, where, notes].filter(Boolean).join(" — ");
    const { error } = await supabase.from("health_condition_entries").insert({
      condition_id: groupId,
      family_id: me.family_id,
      entry_date: date,
      note,
      created_by: me.id,
    });
    if (error) return { error: humanDatabaseError(error.message) };
  } else if (type === "lab") {
    const { error } = await supabase.from("health_labs").insert({
      family_id: me.family_id,
      member_id: memberId,
      name: title,
      test_date: date,
      result: value || null,
      flag: "REVIEWED",
      tag_class: "tag-neutral",
      visibility,
      created_by: me.id,
    });
    if (error) return { error: humanDatabaseError(error.message) };
  } else if (type === "blood_pressure" || type === "weight") {
    const { error } = await supabase.from("health_vitals").insert({
      family_id: me.family_id,
      member_id: memberId,
      vital_type: type,
      reading_date: date,
      value_text: value,
      unit: type === "blood_pressure" ? "mmHg" : "kg",
      source: "manual",
      visibility,
      created_by: me.id,
    });
    if (error) return { error: humanDatabaseError(error.message) };
  }

  revalidatePath(`/family/members/${memberId}`);
  redirect(`/family/members/${memberId}?view=health`);
}

export async function updateConditionEntryAction(input: { entryId: string; memberId: string; date: string; note: string }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const note = clamp(input.note, 1000);
  if (!note) return { error: "Give the entry something to say." };

  const { error, count } = await supabase
    .from("health_condition_entries")
    .update({ entry_date: input.date, note }, { count: "exact" })
    .eq("id", input.entryId)
    .eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  if (count === 0) return { error: "That entry is no longer there — someone may have removed it." };
  revalidatePath(`/family/members/${input.memberId}`);
  return { error: null };
}

export async function deleteConditionEntryAction(entryId: string, memberId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("health_condition_entries").delete().eq("id", entryId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath(`/family/members/${memberId}`);
  return { error: null };
}

/** Deletes the whole condition, taking its entries with it -- for when the
 * condition itself was logged by mistake, not just one note under it. */
export async function deleteConditionAction(conditionId: string, memberId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("health_conditions").delete().eq("id", conditionId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath(`/family/members/${memberId}`);
  return { error: null };
}

export async function updateLabAction(input: { labId: string; memberId: string; date: string; name: string; result: string }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const name = clamp(input.name, 150);
  if (!name) return { error: "Give the lab a name." };

  const { error, count } = await supabase
    .from("health_labs")
    .update({ test_date: input.date, name, result: clamp(input.result, 300) || null }, { count: "exact" })
    .eq("id", input.labId)
    .eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  if (count === 0) return { error: "That lab result is no longer there — someone may have removed it." };
  revalidatePath(`/family/members/${input.memberId}`);
  return { error: null };
}

export async function deleteLabAction(labId: string, memberId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("health_labs").delete().eq("id", labId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath(`/family/members/${memberId}`);
  return { error: null };
}

/** The member stays an argument -- a parent linking a child's monitor is the
 * ordinary case -- but the household comes from the session, so a link cannot
 * be filed against somebody else's. */
export async function toggleOmronAction(memberId: string, connected: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("omron_links").upsert({
    member_id: memberId,
    family_id: me.family_id,
    connected,
    last_synced_at: connected ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath(`/family/members/${memberId}`);
  return { error: null };
}
