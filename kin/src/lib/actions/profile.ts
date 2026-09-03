"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember } from "@/lib/session";
import { getValidDriveAccessToken, deleteDriveFile } from "@/lib/google-drive";
import { resolvePhotoUrl } from "@/lib/photo-url";
import type { ActionState } from "@/lib/actions/auth";
import type { ProfileFields } from "@/lib/profile-fields";
import type { UploadedFile } from "@/lib/upload-client";
import type { TablesInsert } from "@/lib/database.types";

// Server Action files may only export async functions, so the ProfileFields
// type and the memberToProfileFields helper (a plain sync function) live in
// ./lib/profile-fields.ts — re-exported here so existing imports of the
// type from this file keep working.
export type { ProfileFields };

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

/** Records a freshly cropped/uploaded photo (already sitting in Drive or
 * Storage — see AvatarCropUpload) as a new album entry and makes it the
 * active avatar. Self only, matching the "each user manages their own
 * photo" boundary — the organizer can edit a member's profile fields but
 * not their photos. */
export async function addAvatarToAlbumAction(uploaded: UploadedFile): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const row: TablesInsert<"member_avatars"> =
    uploaded.provider === "google_drive"
      ? { member_id: me.id, family_id: me.family_id, storage_path: null, drive_file_id: uploaded.driveFileId }
      : { member_id: me.id, family_id: me.family_id, storage_path: uploaded.storagePath, drive_file_id: null };

  const { error: insertErr } = await supabase.from("member_avatars").insert(row);
  if (insertErr) return { error: insertErr.message };

  const { error } = await supabase.from("members").update({ avatar_url: resolvePhotoUrl(supabase, row) }).eq("id", me.id);
  revalidatePath("/settings");
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Makes a previously uploaded photo from the album the active avatar
 * again, without needing to re-upload it. Self only. */
export async function setActiveAvatarAction(avatarId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: photo } = await supabase.from("member_avatars").select("storage_path, drive_file_id, member_id").eq("id", avatarId).maybeSingle();
  if (!photo || photo.member_id !== me.id) return { error: "Photo not found." };

  const { error } = await supabase.from("members").update({ avatar_url: resolvePhotoUrl(supabase, photo) }).eq("id", me.id);
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

  const { data: photo } = await supabase.from("member_avatars").select("storage_path, drive_file_id, member_id").eq("id", avatarId).maybeSingle();
  if (!photo || photo.member_id !== me.id) return { error: "Photo not found." };

  const deletedUrl = resolvePhotoUrl(supabase, photo);
  const { error } = await supabase.from("member_avatars").delete().eq("id", avatarId);
  if (error) return { error: error.message };

  if (photo.drive_file_id) {
    const token = await getValidDriveAccessToken(me.family_id);
    if (token) await deleteDriveFile(token, photo.drive_file_id).catch(() => {});
  } else if (photo.storage_path) {
    await supabase.storage.from("avatars").remove([photo.storage_path]).catch(() => {});
  }

  if (me.avatar_url === deletedUrl) {
    const { data: remaining } = await supabase
      .from("member_avatars")
      .select("storage_path, drive_file_id")
      .eq("member_id", me.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fallbackUrl = remaining ? resolvePhotoUrl(supabase, remaining) : null;
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
