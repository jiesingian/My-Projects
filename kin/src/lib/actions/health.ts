"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";

const GROUPED_TYPES = new Set(["illness", "checkup", "medication", "vaccination"]);

export async function createHealthEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const memberId = String(formData.get("member_id") ?? "");
  const type = String(formData.get("type") ?? "");
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const title = String(formData.get("title") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  const seenBy = String(formData.get("seen_by") ?? "").trim() || null;
  const where = String(formData.get("where") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "family");

  if (!memberId || !title) return { error: "Fill in the title." };

  if (GROUPED_TYPES.has(type)) {
    let groupId = String(formData.get("group_id") ?? "");
    const newGroupName = String(formData.get("new_group_name") ?? title).trim();
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
      if (groupErr) return { error: groupErr.message };
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
    if (error) return { error: error.message };
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
    if (error) return { error: error.message };
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
    if (error) return { error: error.message };
  }

  revalidatePath(`/family/members/${memberId}`);
  redirect(`/family/members/${memberId}`);
}

export async function toggleOmronAction(memberId: string, familyId: string, connected: boolean) {
  const supabase = await createClient();
  await supabase.from("omron_links").upsert({
    member_id: memberId,
    family_id: familyId,
    connected,
    last_synced_at: connected ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  revalidatePath(`/family/members/${memberId}`);
}
