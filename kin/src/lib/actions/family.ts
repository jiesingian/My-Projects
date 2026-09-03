"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/actions/auth";

export async function saveProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const dob = String(formData.get("dob") ?? "") || null;
  const mobile = String(formData.get("mobile") ?? "").trim() || null;
  if (!fullName) return { error: "Tell us your name." };

  // Stashed in a cookie via the form's hidden fields is unnecessary — profile
  // fields are collected again on the create/join step, which is where the
  // member row actually gets created (create_family / join_family RPCs).
  const params = new URLSearchParams({ full_name: fullName });
  if (dob) params.set("dob", dob);
  if (mobile) params.set("mobile", mobile);
  redirect(`/onboarding/family?${params.toString()}`);
}

export async function createFamilyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const householdName = String(formData.get("household_name") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const dob = String(formData.get("dob") ?? "") || null;
  const mobile = String(formData.get("mobile") ?? "").trim() || null;
  if (!householdName || !fullName) return { error: "Household name and your name are required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_family", {
    p_household_name: householdName,
    p_full_name: fullName,
    p_dob: dob ?? undefined,
    p_mobile: mobile ?? undefined,
  });
  if (error) return { error: error.message };

  redirect("/onboarding/members");
}

export async function joinFamilyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const inviteCode = String(formData.get("invite_code") ?? "").trim().toUpperCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const dob = String(formData.get("dob") ?? "") || null;
  const mobile = String(formData.get("mobile") ?? "").trim() || null;
  if (!inviteCode || !fullName) return { error: "Invite code and your name are required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_family", {
    p_invite_code: inviteCode,
    p_full_name: fullName,
    p_dob: dob ?? undefined,
    p_mobile: mobile ?? undefined,
    p_role: "adult",
  });
  if (error) return { error: "That invite code didn't match a household. Double-check it and try again." };

  redirect("/onboarding/pending");
}

export async function addManagedChildAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const dob = String(formData.get("dob") ?? "") || null;
  const relationship = String(formData.get("relationship") ?? "child").trim();
  if (!fullName || !dob) return { error: "Name and date of birth are required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_managed_child", {
    p_full_name: fullName,
    p_dob: dob,
    p_relationship: relationship,
  });
  if (error) return { error: error.message };

  revalidatePath("/onboarding/members");
  revalidatePath("/family/members");
  return { error: null };
}

export async function regenerateInviteCodeAction(): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_invite_code");
  revalidatePath("/settings");
  revalidatePath("/onboarding/members");
  return { error: error?.message ?? null };
}

/** Approves a pending join request — RLS restricts this to the household's
 * organiser and only while the row is still 'pending'. */
export async function approveMemberAction(memberId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status: "active" }).eq("id", memberId);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Rejects a pending join request by removing it — RLS restricts this to
 * the household's organiser and only while the row is still 'pending'. */
export async function rejectMemberAction(memberId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("id", memberId);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}
