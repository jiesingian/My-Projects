"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
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
 * organizer and only while the row is still 'pending'. */
export async function approveMemberAction(memberId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status: "active" }).eq("id", memberId);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Rejects a pending join request by removing it — RLS restricts this to
 * the household's organizer and only while the row is still 'pending'. */
export async function rejectMemberAction(memberId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("id", memberId);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Removes an active or managed member from the household. This doesn't
 * delete their historical journal entries, health records, documents, etc.
 * — deleting the member row outright would fail for anyone who's actually
 * used the app (several tables reference created_by/owner_member_id with
 * no cascade). Instead this revokes access the same way 'pending' already
 * does: current_family_id() only resolves for 'active' members, so a
 * removed member's session immediately loses every family-scoped
 * permission. RLS restricts this to the household's organizer. */
export async function removeMemberAction(memberId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (memberId === me.id) return { error: "You can't remove yourself — leave that to another organizer, or delete the household instead." };

  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status: "removed" }).eq("id", memberId);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Restores a previously removed member to active access. RLS restricts
 * this to the household's organizer. */
export async function reinstateMemberAction(memberId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status: "active" }).eq("id", memberId);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Sets a member's family-relationship label ("Mother", "Son", etc.) —
 * distinct from `role`, which drives permission logic and stays untouched
 * here. RLS lets the organizer edit anyone's; a member can also edit their
 * own via the pre-existing self-update policy. */
export async function updateMemberRelationshipAction(memberId: string, relationship: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ relationship: relationship.trim() || null }).eq("id", memberId);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Records a freshly uploaded household cover photo (already sitting in
 * Storage — see FamilyBackgroundAlbum) as a new album entry and makes it
 * the active background. Mirrors the member-avatar album. Organizer only —
 * RLS enforces this too. */
export async function addFamilyBackgroundAction(path: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can change the household photo." };

  const supabase = await createClient();
  const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;

  const { error: insertErr } = await supabase.from("family_backgrounds").insert({ family_id: me.family_id, storage_path: path });
  if (insertErr) return { error: insertErr.message };

  const { error } = await supabase.from("families").update({ background_url: publicUrl }).eq("id", me.family_id);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Makes a previously uploaded household photo the active background again
 * without re-uploading it. Organizer only. */
export async function setActiveFamilyBackgroundAction(backgroundId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can change the household photo." };

  const supabase = await createClient();
  const { data: photo } = await supabase.from("family_backgrounds").select("storage_path, family_id").eq("id", backgroundId).maybeSingle();
  if (!photo || photo.family_id !== me.family_id) return { error: "Photo not found." };

  const publicUrl = supabase.storage.from("avatars").getPublicUrl(photo.storage_path).data.publicUrl;
  const { error } = await supabase.from("families").update({ background_url: publicUrl }).eq("id", me.family_id);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Removes a household photo from the album entirely. If it was the active
 * background, falls back to the most recent remaining photo, or clears it
 * if none are left. Organizer only. */
export async function deleteFamilyBackgroundAction(backgroundId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can change the household photo." };

  const supabase = await createClient();
  const { data: photo } = await supabase.from("family_backgrounds").select("storage_path, family_id").eq("id", backgroundId).maybeSingle();
  if (!photo || photo.family_id !== me.family_id) return { error: "Photo not found." };

  const deletedUrl = supabase.storage.from("avatars").getPublicUrl(photo.storage_path).data.publicUrl;
  const { error } = await supabase.from("family_backgrounds").delete().eq("id", backgroundId);
  if (error) return { error: error.message };
  await supabase.storage.from("avatars").remove([photo.storage_path]).catch(() => {});

  const { data: family } = await supabase.from("families").select("background_url").eq("id", me.family_id).maybeSingle();
  if (family?.background_url === deletedUrl) {
    const { data: remaining } = await supabase
      .from("family_backgrounds")
      .select("storage_path")
      .eq("family_id", me.family_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fallbackUrl = remaining ? supabase.storage.from("avatars").getPublicUrl(remaining.storage_path).data.publicUrl : null;
    await supabase.from("families").update({ background_url: fallbackUrl }).eq("id", me.family_id);
  }

  revalidatePath("/family");
  return { error: null };
}

/** Adds a tagged address to the household profile (e.g. "Home", "Office").
 * Organizer only — RLS enforces this too. Purely informational for now;
 * not yet wired into Planner/Household task forms. */
export async function addFamilyAddressAction(label: string, addressLine: string, zipCode: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can add household addresses." };
  const cleanLabel = label.trim();
  const cleanAddress = addressLine.trim();
  const cleanZip = zipCode.trim() || null;
  if (!cleanLabel || !cleanAddress) return { error: "Both a tag and an address are required." };

  const supabase = await createClient();
  const { error } = await supabase.from("family_addresses").insert({ family_id: me.family_id, label: cleanLabel, address_line: cleanAddress, zip_code: cleanZip });
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Removes a household address. Organizer only — RLS enforces this too. */
export async function removeFamilyAddressAction(addressId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can remove household addresses." };

  const supabase = await createClient();
  const { error } = await supabase.from("family_addresses").delete().eq("id", addressId);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Permanently deletes the entire household — every member, journal entry,
 * document index, health record, bill, account, and every other row this
 * family owns. RLS/the RPC itself restrict this to the organizer. Files
 * actually sitting in Google Drive are left untouched (Kin only ever held
 * the index); best-effort cleanup of Supabase Storage objects happens here
 * since Storage isn't reachable from the RPC's plain SQL. */
export async function deleteHouseholdAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can delete the household." };

  const supabase = await createClient();
  try {
    // journal/trip-photos: flat "<family_id>/<file>" paths.
    for (const bucket of ["journal", "trip-photos"] as const) {
      const { data: objects } = await supabase.storage.from(bucket).list(me.family_id);
      if (objects && objects.length > 0) {
        await supabase.storage.from(bucket).remove(objects.map((o) => `${me.family_id}/${o.name}`));
      }
    }
    // documents: "<family_id>/<entry_id>/<file>" — one extra level to walk.
    const { data: entryDirs } = await supabase.storage.from("documents").list(me.family_id);
    for (const dir of entryDirs ?? []) {
      const { data: files } = await supabase.storage.from("documents").list(`${me.family_id}/${dir.name}`);
      if (files && files.length > 0) {
        await supabase.storage.from("documents").remove(files.map((f) => `${me.family_id}/${dir.name}/${f.name}`));
      }
    }
  } catch {
    // Best effort — the household record itself is what matters most.
  }

  const { error } = await supabase.rpc("delete_household");
  if (error) return { error: error.message };

  redirect("/onboarding/profile");
}
