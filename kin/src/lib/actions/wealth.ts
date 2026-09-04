"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars, type CalendarTarget } from "@/lib/actions/calendar-sync";
import type { ActionState } from "@/lib/actions/auth";

export async function addAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const subNote = String(formData.get("sub_note") ?? "").trim() || null;
  const balance = Number(formData.get("balance") ?? 0);
  const isJoint = formData.get("is_joint") === "on";
  if (!name) return { error: "Name the account." };

  const { error } = await supabase.from("accounts").insert({
    family_id: me.family_id,
    name,
    sub_note: subNote,
    balance,
    is_joint: isJoint,
    owner_member_id: isJoint ? null : me.id,
    created_by: me.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/wealth");
  return { error: null };
}

export async function setJointBudgetAction(familyId: string, month: number, year: number, amount: number) {
  const supabase = await createClient();
  await supabase.from("budget_periods").upsert(
    { family_id: familyId, period_month: month, period_year: year, budget_amount: amount },
    { onConflict: "family_id,period_month,period_year" },
  );
  revalidatePath("/wealth");
}

export async function setWealthTargetAction(memberId: string, familyId: string, month: number, year: number, amount: number) {
  const supabase = await createClient();
  await supabase.from("wealth_targets").upsert(
    { member_id: memberId, family_id: familyId, period_month: month, period_year: year, target_amount: amount },
    { onConflict: "member_id,period_month,period_year" },
  );
  revalidatePath("/wealth");
}

export async function createGoalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const subNote = String(formData.get("sub_note") ?? "").trim() || null;
  const isJoint = formData.get("is_joint") === "on";
  const ownerMemberId = isJoint ? null : me.id;
  const targetAmount = formData.get("target_amount") ? Number(formData.get("target_amount")) : null;
  const targetUnit = String(formData.get("target_unit") ?? "").trim() || null;
  const targetDate = String(formData.get("target_date") ?? "") || null;
  if (!title) return { error: "Give the goal a title." };

  const { data: goal, error } = await supabase
    .from("goals")
    .insert({
      family_id: me.family_id,
      title,
      sub_note: subNote,
      is_joint: isJoint,
      owner_member_id: ownerMemberId,
      target_amount: targetAmount,
      target_unit: targetUnit,
      target_date: targetDate,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  if (targetDate) {
    const target: CalendarTarget = isJoint ? { kind: "all" } : { kind: "member", memberId: ownerMemberId };
    await syncRowToCalendars(me.family_id, "goals", goal.id, { title, startAt: new Date(`${targetDate}T00:00:00`), allDay: true }, target);
  }

  revalidatePath("/wealth");
  redirect("/wealth?seg=goals");
}
