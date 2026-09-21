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
import { clampProfileFields } from "@/lib/profile-fields";
import type { UploadedFile } from "@/lib/upload-client";
import type { TablesInsert } from "@/lib/database.types";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";

// Server Action files may only export async functions, so the ProfileFields
// type and the memberToProfileFields helper (a plain sync function) live in
// ./lib/profile-fields.ts — re-exported here so existing imports of the
// type from this file keep working.
export type { ProfileFields };

/** Lets a member edit their own profile fields — everything here is
 * already covered by the pre-existing self-update RLS policy. */
export async function updateOwnProfileAction(fields: ProfileFields): Promise<ActionState> {
  const me = await requireCurrentMember();
  const fullName = clamp(fields.full_name, 100);
  if (!fullName) return { error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ ...clampProfileFields(fields), full_name: fullName }).eq("id", me.id);
  revalidatePath("/settings");
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** Lets the organizer edit any member's profile fields, and lets a parent or
 * adult edit a managed child's — covered by the members_update_by_organiser
 * and members_update_managed_by_parent RLS policies respectively. A managed
 * child has no login of their own, so somebody has to be able to fix a
 * birthday or note an allergy on their behalf, and the organizer doesn't
 * have to be the one in the house who does it. */
export async function updateMemberProfileAction(memberId: string, fields: ProfileFields): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  if (!me.is_organiser) {
    if (me.role !== "parent" && me.role !== "adult") {
      return { error: "Only the organizer can edit another member's profile." };
    }
    const { data: target } = await supabase.from("members").select("status").eq("id", memberId).maybeSingle();
    if (target?.status !== "managed") {
      return { error: "Only the organizer can edit another member's profile." };
    }
  }

  const fullName = clamp(fields.full_name, 100);
  if (!fullName) return { error: "Name is required." };

  const { error } = await supabase.from("members").update({ ...clampProfileFields(fields), full_name: fullName }).eq("id", memberId);
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
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

  // A Storage path is trusted as belonging to this family only when it sits
  // under the family's own prefix -- otherwise this call would let a member
  // index (and later, via delete, permanently remove) another family's
  // photo by path alone.
  if (uploaded.provider === "supabase" && !uploaded.storagePath.startsWith(`${me.family_id}/`)) {
    return { error: "That photo doesn't belong to this household." };
  }

  const row: TablesInsert<"member_avatars"> =
    uploaded.provider === "google_drive"
      ? { member_id: me.id, family_id: me.family_id, storage_path: null, drive_file_id: uploaded.driveFileId }
      : { member_id: me.id, family_id: me.family_id, storage_path: uploaded.storagePath, drive_file_id: null };

  const { error: insertErr } = await supabase.from("member_avatars").insert(row);
  if (insertErr) {
    console.error("member_avatars insert failed", { uploaded, row, insertErr });
    return { error: insertErr.message };
  }

  const { error } = await supabase.from("members").update({ avatar_url: resolvePhotoUrl(supabase, row) }).eq("id", me.id);
  revalidatePath("/settings");
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
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
  return { error: error ? humanDatabaseError(error.message) : null };
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
  if (error) return { error: humanDatabaseError(error.message) };

  if (photo.drive_file_id) {
    const token = await getValidDriveAccessToken(me.family_id);
    if (token) await deleteDriveFile(token, photo.drive_file_id).catch(() => {});
  } else if (photo.storage_path) {
    const { error: removeError } = await supabase.storage.from("avatars").remove([photo.storage_path]);
    if (removeError) console.error(`Avatar file ${photo.storage_path} was left in storage after its record was deleted`, removeError.message);
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
    const { error } = await supabase.from("members").update({ avatar_url: fallbackUrl }).eq("id", me.id);
    if (error) return { error: `The photo was removed, but your profile still points at it. ${error.message}` };
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
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** Deletes the caller's own account — removes their household membership
 * (or the whole household, if they're its sole member) and then deletes
 * their Supabase Auth user entirely via the admin client, so they can't
 * sign back in. */
export async function deleteOwnAccountAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase.rpc("leave_household_self");
  if (error) return { error: humanDatabaseError(error.message) };

  if (me.auth_user_id) {
    const admin = createAdminClient();
    // They have left the household; a login left behind cannot reach anything,
    // but it does keep the address claimed.
    if (admin) {
      await admin.auth.admin
        .deleteUser(me.auth_user_id)
        .catch((err) => console.error(`Login ${me.auth_user_id} was left behind after the account was deleted`, err));
    }
  }

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) console.error("Sign out did not complete", signOutError.message);
  redirect("/login");
}
