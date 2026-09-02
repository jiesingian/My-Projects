"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
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
