"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";

export type ProfileFields = {
  full_name: string;
  dob: string | null;
  mobile: string | null;
  blood_type: string | null;
  allergies: string | null;
  insurance_info: string | null;
  physician_name: string | null;
};

/** Lets a member edit their own profile fields — everything here is
 * already covered by the pre-existing self-update RLS policy. */
export async function updateOwnProfileAction(fields: ProfileFields): Promise<ActionState> {
  const me = await requireCurrentMember();
  const fullName = fields.full_name.trim();
  if (!fullName) return { error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ ...fields, full_name: fullName }).eq("id", me.id);
  revalidatePath("/settings");
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Lets the organizer edit another member's profile fields — covered by
 * the members_update_by_organiser RLS policy. */
export async function updateMemberProfileAction(memberId: string, fields: ProfileFields): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can edit another member's profile." };
  const fullName = fields.full_name.trim();
  if (!fullName) return { error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ ...fields, full_name: fullName }).eq("id", memberId);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Records a newly uploaded avatar (already sitting in Storage — see
 * AvatarUpload, which uploads directly rather than through this action) and
 * cleans up the previous one, if any. */
export async function updateAvatarAction(path: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const previousUrl = me.avatar_url;

  const { error } = await supabase.from("members").update({ avatar_url: publicUrl }).eq("id", me.id);
  if (!error && previousUrl && previousUrl !== publicUrl) {
    const previousPath = previousUrl.split("/avatars/")[1];
    if (previousPath) await supabase.storage.from("avatars").remove([previousPath]).catch(() => {});
  }

  revalidatePath("/settings");
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Hands the organizer role to another active adult/parent member,
 * demoting the caller in the same transaction. */
export async function transferOrganiserRoleAction(newOrganiserMemberId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_organiser_role", { p_new_organiser_member_id: newOrganiserMemberId });
  revalidatePath("/family");
  revalidatePath("/settings");
  return { error: error?.message ?? null };
}

/** Deletes the caller's own account — removes their household membership
 * (or the whole household, if they're its sole member) and then deletes
 * their Supabase Auth user entirely via the admin client, so they can't
 * sign back in. */
export async function deleteOwnAccountAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase.rpc("leave_household_self");
  if (error) return { error: error.message };

  if (me.auth_user_id) {
    const admin = createAdminClient();
    if (admin) await admin.auth.admin.deleteUser(me.auth_user_id).catch(() => {});
  }

  await supabase.auth.signOut();
  redirect("/login");
}
