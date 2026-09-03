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

export type AlbumPhoto = { id: string; url: string };

/** Records a freshly cropped/uploaded photo (already sitting in Storage —
 * see AvatarCropUpload) as a new album entry and makes it the active
 * avatar. Self only, matching the "each user manages their own photo"
 * boundary — the organizer can edit a member's profile fields but not
 * their photos. */
export async function addAvatarToAlbumAction(path: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;

  const { error: insertErr } = await supabase.from("member_avatars").insert({ member_id: me.id, family_id: me.family_id, storage_path: path });
  if (insertErr) return { error: insertErr.message };

  const { error } = await supabase.from("members").update({ avatar_url: publicUrl }).eq("id", me.id);
  revalidatePath("/settings");
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Makes a previously uploaded photo from the album the active avatar
 * again, without needing to re-upload it. Self only. */
export async function setActiveAvatarAction(avatarId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: photo } = await supabase.from("member_avatars").select("storage_path, member_id").eq("id", avatarId).maybeSingle();
  if (!photo || photo.member_id !== me.id) return { error: "Photo not found." };

  const publicUrl = supabase.storage.from("avatars").getPublicUrl(photo.storage_path).data.publicUrl;
  const { error } = await supabase.from("members").update({ avatar_url: publicUrl }).eq("id", me.id);
  revalidatePath("/settings");
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Removes a photo from the album entirely. If it was the active avatar,
 * falls back to the most recent remaining photo, or clears it if none are
 * left. Self only. */
export async function deleteAvatarFromAlbumAction(avatarId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: photo } = await supabase.from("member_avatars").select("storage_path, member_id").eq("id", avatarId).maybeSingle();
  if (!photo || photo.member_id !== me.id) return { error: "Photo not found." };

  const deletedUrl = supabase.storage.from("avatars").getPublicUrl(photo.storage_path).data.publicUrl;
  const { error } = await supabase.from("member_avatars").delete().eq("id", avatarId);
  if (error) return { error: error.message };
  await supabase.storage.from("avatars").remove([photo.storage_path]).catch(() => {});

  if (me.avatar_url === deletedUrl) {
    const { data: remaining } = await supabase
      .from("member_avatars")
      .select("storage_path")
      .eq("member_id", me.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fallbackUrl = remaining ? supabase.storage.from("avatars").getPublicUrl(remaining.storage_path).data.publicUrl : null;
    await supabase.from("members").update({ avatar_url: fallbackUrl }).eq("id", me.id);
  }

  revalidatePath("/settings");
  revalidatePath("/family");
  return { error: null };
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
