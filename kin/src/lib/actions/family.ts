"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember } from "@/lib/session";
import { getValidDriveAccessToken, deleteDriveFile } from "@/lib/google-drive";
import { resolvePhotoUrl } from "@/lib/photo-url";
import type { ActionState } from "@/lib/actions/auth";
import type { UploadedFile } from "@/lib/upload-client";
import type { TablesInsert } from "@/lib/database.types";

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
  const accessCode = String(formData.get("access_code") ?? "").trim();
  if (!householdName || !fullName) return { error: "Household name and your name are required." };
  if (!accessCode) return { error: "Starting a new household needs an access code." };

  const supabase = await createClient();

  // A new household is the thing worth protecting, so only a code we issued
  // opens one. A family's own invite code gets you through signup and into
  // that family — never into a household of your own.
  const { data: redeemed, error: redeemError } = await supabase.rpc("redeem_household_code", {
    p_code: accessCode,
  });
  if (redeemError) return { error: "We couldn't check that code just now. Try again in a moment." };
  if (!redeemed) return { error: "That access code isn't valid, or it has already been used up." };

  const { error } = await supabase.rpc("create_family", {
    p_household_name: householdName,
    p_full_name: fullName,
    p_dob: dob ?? undefined,
    p_mobile: mobile ?? undefined,
  });
  if (error) return { error: error.message };

  // Records what the code was worth — free for good, or a trial that will
  // ask for payment later. It reads the grant off the code rather than
  // trusting anything sent from here, and refuses once a household already
  // has a standing, so a second call with a better code changes nothing.
  const { error: grantError } = await supabase.rpc("apply_code_grant_to_family", { p_code: accessCode });
  if (grantError) {
    // The one place here that logs rather than tells the member, and on
    // purpose: the household already exists by now, so returning an error
    // would strand them on a signup form for an account they already have.
    // But a lost grant is not nothing -- it is the difference between free
    // for good and a trial that will ask for payment -- and it surfaces weeks
    // later as a paywall nobody can trace back to this moment.
    //
    // The code itself is deliberately not logged; it is a credential.
    console.error("apply_code_grant_to_family failed during signup; household has no standing", {
      household: householdName,
      reason: grantError.message,
    });
  }

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
  // The default has to be applied after trimming, not before. A text input
  // that the user cleared submits "", not null, so `?? "child"` keeps the
  // empty string and the default never fires -- the child is stored with no
  // relationship at all, where the form plainly promised "child".
  const relationship = String(formData.get("relationship") ?? "").trim() || "child";
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
  // The Family tab is where a child actually gets added once the household is
  // past setup, so it has to be refreshed too or the new profile does not
  // appear until something else happens to reload the page.
  revalidatePath("/family");
  return { error: null };
}

/** Gives a child their own way in. A parent sets the address and the first
 * password, because a child this age has no inbox to confirm from — so the
 * account is created already confirmed and no mail is sent at all, which is
 * also why this path is untouched by the auth mailer's rate limit.
 *
 * Creating a login for somebody else needs the service role, so this is the
 * one place outside the Drive handlers that reaches for it. */
export async function addChildWithLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (me.role !== "parent" && me.role !== "adult") {
    return { error: "Only a parent or adult can add a child." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const dob = String(formData.get("dob") ?? "") || null;
  // The default has to be applied after trimming, not before. A text input
  // that the user cleared submits "", not null, so `?? "child"` keeps the
  // empty string and the default never fires -- the child is stored with no
  // relationship at all, where the form plainly promised "child".
  const relationship = String(formData.get("relationship") ?? "").trim() || "child";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!fullName || !dob) return { error: "Name and date of birth are required." };
  if (!email) return { error: "Enter the email this child will sign in with." };
  if (password.length < 8) return { error: "Give them a password of at least 8 characters." };

  const admin = createAdminClient();
  if (!admin) return { error: "Logins can't be created right now — the server is missing its key." };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // Confirmed on the spot. There is no inbox to check, and asking one to
    // exist is what sent this down the signup path in the first place.
    email_confirm: true,
  });
  if (createError || !created.user) {
    return {
      error: /already/i.test(createError?.message ?? "")
        ? "That email already has an account."
        : "That email couldn't be used — check it and try again.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_child_with_login", {
    p_full_name: fullName,
    p_dob: dob,
    p_relationship: relationship,
    p_auth_user_id: created.user.id,
  });

  if (error) {
    // The login exists but belongs to nobody. Left alone it would block the
    // address from ever being used again, so it goes back.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { error: "We couldn't finish adding them. Nothing was saved — try again." };
  }

  revalidatePath("/family");
  revalidatePath("/onboarding/members");
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
 * Drive or Storage — see FamilyBackgroundAlbum) as a new album entry and
 * makes it the active background. Mirrors the member-avatar album.
 * Organizer only — RLS enforces this too. */
export async function addFamilyBackgroundAction(uploaded: UploadedFile): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can change the household photo." };

  const supabase = await createClient();
  const row: TablesInsert<"family_backgrounds"> =
    uploaded.provider === "google_drive"
      ? { family_id: me.family_id, storage_path: null, drive_file_id: uploaded.driveFileId }
      : { family_id: me.family_id, storage_path: uploaded.storagePath, drive_file_id: null };

  const { error: insertErr } = await supabase.from("family_backgrounds").insert(row);
  if (insertErr) {
    console.error("family_backgrounds insert failed", { uploaded, row, insertErr });
    return { error: insertErr.message };
  }

  const { error } = await supabase.from("families").update({ background_url: resolvePhotoUrl(supabase, row) }).eq("id", me.family_id);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Makes a previously uploaded household photo the active background again
 * without re-uploading it. Organizer only. */
export async function setActiveFamilyBackgroundAction(backgroundId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can change the household photo." };

  const supabase = await createClient();
  const { data: photo } = await supabase.from("family_backgrounds").select("storage_path, drive_file_id, family_id").eq("id", backgroundId).maybeSingle();
  if (!photo || photo.family_id !== me.family_id) return { error: "Photo not found." };

  const { error } = await supabase.from("families").update({ background_url: resolvePhotoUrl(supabase, photo) }).eq("id", me.family_id);
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
  const { data: photo } = await supabase.from("family_backgrounds").select("storage_path, drive_file_id, family_id").eq("id", backgroundId).maybeSingle();
  if (!photo || photo.family_id !== me.family_id) return { error: "Photo not found." };

  const deletedUrl = resolvePhotoUrl(supabase, photo);
  const { error } = await supabase.from("family_backgrounds").delete().eq("id", backgroundId);
  if (error) return { error: error.message };

  if (photo.drive_file_id) {
    const token = await getValidDriveAccessToken(me.family_id);
    if (token) await deleteDriveFile(token, photo.drive_file_id).catch(() => {});
  } else if (photo.storage_path) {
    await supabase.storage.from("avatars").remove([photo.storage_path]).catch(() => {});
  }

  const { data: family } = await supabase.from("families").select("background_url").eq("id", me.family_id).maybeSingle();
  if (family?.background_url === deletedUrl) {
    const { data: remaining } = await supabase
      .from("family_backgrounds")
      .select("storage_path, drive_file_id")
      .eq("family_id", me.family_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fallbackUrl = remaining ? resolvePhotoUrl(supabase, remaining) : null;
    await supabase.from("families").update({ background_url: fallbackUrl }).eq("id", me.family_id);
  }

  revalidatePath("/family");
  return { error: null };
}

/** Sets the household's "about" blurb shown under the cover photo.
 * Organizer only — RLS enforces this too via families_update. */
export async function updateFamilyAboutAction(about: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can edit the household's about section." };

  const supabase = await createClient();
  const { error } = await supabase.from("families").update({ about: about.trim() || null }).eq("id", me.family_id);
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

export type FamilyAddressFields = {
  label: string;
  houseNo: string;
  building: string;
  street: string;
  barangay: string;
  city: string;
  province: string;
  country: string;
  zipCode: string;
};

function normalizeAddressFields(fields: FamilyAddressFields) {
  const label = fields.label.trim();
  const houseNo = fields.houseNo.trim() || null;
  const building = fields.building.trim() || null;
  const street = fields.street.trim();
  const barangay = fields.barangay.trim() || null;
  const city = fields.city.trim();
  const province = fields.province.trim() || null;
  const country = fields.country.trim() || "Philippines";
  const zipCode = fields.zipCode.trim() || null;

  const addressLine = [[houseNo, building].filter(Boolean).join(" "), street, barangay, city, province, country]
    .filter(Boolean)
    .join(", ");

  return { label, houseNo, building, street, barangay, city, province, country, zipCode, addressLine };
}

/** Adds a tagged address to the household profile (e.g. "Home", "Office"),
 * broken into the fields a Philippine address form typically asks for.
 * `address_line` is kept as a derived, joined string alongside the
 * structured fields so existing display/Maps-link code can still use one
 * value. Organizer only — RLS enforces this too. Purely informational for
 * now; not yet wired into Planner/Household task forms. */
export async function addFamilyAddressAction(fields: FamilyAddressFields): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can add household addresses." };

  const f = normalizeAddressFields(fields);
  if (!f.label || !f.street || !f.city) return { error: "Tag, street, and city are required." };

  const supabase = await createClient();
  const { error } = await supabase.from("family_addresses").insert({
    family_id: me.family_id,
    label: f.label,
    house_no: f.houseNo,
    building: f.building,
    street: f.street,
    barangay: f.barangay,
    city: f.city,
    province: f.province,
    country: f.country,
    zip_code: f.zipCode,
    address_line: f.addressLine,
  });
  revalidatePath("/family");
  return { error: error?.message ?? null };
}

/** Edits an existing household address in place. Organizer only — RLS
 * enforces this too. */
export async function updateFamilyAddressAction(addressId: string, fields: FamilyAddressFields): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can edit household addresses." };

  const f = normalizeAddressFields(fields);
  if (!f.label || !f.street || !f.city) return { error: "Tag, street, and city are required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("family_addresses")
    .update({
      label: f.label,
      house_no: f.houseNo,
      building: f.building,
      street: f.street,
      barangay: f.barangay,
      city: f.city,
      province: f.province,
      country: f.country,
      zip_code: f.zipCode,
      address_line: f.addressLine,
    })
    .eq("id", addressId);
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
    // journal/trip-photos/avatars: flat "<family_id>/<file>" paths.
    for (const bucket of ["journal", "trip-photos", "avatars"] as const) {
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
