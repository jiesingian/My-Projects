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
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";

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
  if (error) return { error: humanDatabaseError(error.message) };

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
  const fullName = clamp(String(formData.get("full_name") ?? ""), 100);
  const dob = String(formData.get("dob") ?? "") || null;
  // The default has to be applied after trimming, not before. A text input
  // that the user cleared submits "", not null, so `?? "child"` keeps the
  // empty string and the default never fires -- the child is stored with no
  // relationship at all, where the form plainly promised "child".
  const relationship = clamp(String(formData.get("relationship") ?? ""), 50) || "child";
  if (!fullName || !dob) return { error: "Name and date of birth are required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_managed_child", {
    p_full_name: fullName,
    p_dob: dob,
    p_relationship: relationship,
  });
  if (error) return { error: humanDatabaseError(error.message) };

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
    // If this undo fails the address is claimed by a login that belongs to
    // nobody, and the parent cannot use it for the child on a second try.
    await admin.auth.admin.deleteUser(created.user.id).catch((err) => {
      console.error(`Orphaned auth user ${created.user.id} could not be removed after a failed child creation; ${email} is now unusable`, err);
    });
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
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** Approves a pending join request, and says what they are joining as — RLS
 * restricts this to the household's organizer and only while the row is still
 * 'pending'.
 *
 * The role belongs here rather than only in an edit screen afterwards.
 * `joinFamilyAction` hard-codes `p_role: "adult"` and it has to: the person
 * joining cannot be the one who decides whether they count as a parent, or
 * the setting would mean nothing. So somebody else has to say, and the moment
 * they are already being looked at and let in is the natural one — otherwise
 * every member starts as an adult and stays that way until somebody notices,
 * which is exactly what happened in this household.
 *
 * The default stays `adult`, because approving without reading is the common
 * case and the quieter of the two answers should be what that gives you. */
export async function approveMemberAction(memberId: string, role: MemberRole = "adult"): Promise<ActionState> {
  if (role !== "parent" && role !== "adult") return { error: "A member joins as either a parent or an adult." };
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status: "active", role }).eq("id", memberId);
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** Rejects a pending join request by removing it — RLS restricts this to
 * the household's organizer and only while the row is still 'pending'. */
export async function rejectMemberAction(memberId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("id", memberId);
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
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
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** Restores a previously removed member to active access. RLS restricts
 * this to the household's organizer. */
export async function reinstateMemberAction(memberId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status: "active" }).eq("id", memberId);
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** The two roles a member with a login can hold, and what turns on the
 * difference.
 *
 * `parent` is not a label. Six row-level policies grant "Parents only" health
 * records and documents to `current_member_role() = 'parent'` and to nobody
 * else, and Google Drive settings need it too. `adult` is everything else an
 * grown-up member can do, which is nearly all of the app.
 *
 * The reason this action exists at all: `joinFamilyAction` hard-codes
 * `p_role: "adult"`, so everybody who has ever joined by invite code is an
 * adult and the only parent in a household is whoever created it. There was
 * no way to change that from inside the app — which meant, in a real
 * household, that a parent of the children could not read a health record
 * marked for parents. Now the organizer can say who is one.
 *
 * Three refusals below, and all three are also enforced underneath, so this
 * is the message rather than the lock:
 *  - not yourself: `members_guard_self_update` raises on any self-change to
 *    role, and an organizer quietly demoting themselves would be a trap.
 *  - not a managed child: the same trigger refuses privilege changes to a row
 *    with no login, which is every managed profile.
 *  - organizer only: `members_update_by_organiser` is the policy that permits
 *    the write at all.
 */
export type MemberRole = "parent" | "adult";

export async function setMemberRoleAction(memberId: string, role: MemberRole): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the household's organizer can change who counts as a parent." };
  if (memberId === me.id) return { error: "You can't change your own role. Ask another organizer." };
  if (role !== "parent" && role !== "adult") return { error: "A member is either a parent or an adult." };

  const supabase = await createClient();
  const { data: target, error: readError } = await supabase
    .from("members")
    .select("full_name, auth_user_id, status")
    .eq("id", memberId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  // A read that failed is not "no such member" -- saying so would send the
  // organizer looking for a member who is sitting right there.
  if (readError) return { error: `That member could not be read, so nothing was changed. ${readError.message}` };
  if (!target) return { error: "That member is no longer in the household." };
  if (target.auth_user_id === null) {
    return { error: `${target.full_name} is a managed profile without a login, so there is no role to give.` };
  }

  const { error } = await supabase.from("members").update({ role }).eq("id", memberId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/family");
  revalidatePath("/family/documents");
  return { error: null };
}

/** Turns a member who has a login back into a managed child profile.
 *
 * There was no way to do this from inside the app, and the gap had a real
 * cost. `joinFamilyAction` hard-codes `p_role: "adult"`, so a four-year-old
 * who was signed up with an email address held an adult role and an active
 * session -- every adult permission there is, the money pages included --
 * and nothing in the app could see it or undo it. It took a hand-written
 * UPDATE to correct, on 9 September.
 *
 * THE ORDER OF THE TWO STEPS MATTERS, and it is not obvious.
 * `members_guard_self_update` refuses any change to `role`, `is_organiser` or
 * `family_id` on a row whose `auth_user_id` is ALREADY null. And
 * `members.auth_user_id` is `on delete set null`, so deleting the login
 * first nulls the column -- and locks the row out of the very change this is
 * for. Both fields therefore move in ONE statement, while the login is still
 * attached, and only then is the account removed.
 *
 * Removing the account needs the service key, because deleting an auth user
 * is not something row-level security can express. If it is not configured
 * the profile is still converted -- that is the half that matters, and it
 * takes effect immediately -- and the caller is told the sign-in is still
 * live so somebody can remove it by hand. Reporting that plainly beats
 * either pretending it worked or refusing to do the part that did.
 */
export async function convertToManagedChildAction(memberId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the household's organizer can do that." };
  if (memberId === me.id) return { error: "You can't turn your own account into a child profile." };

  const supabase = await createClient();
  const { data: target, error: readError } = await supabase
    .from("members")
    .select("full_name, auth_user_id, status")
    .eq("id", memberId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (readError) return { error: `That member could not be read, so nothing was changed. ${humanDatabaseError(readError.message)}` };
  if (!target) return { error: "That member is no longer in the household." };
  if (target.auth_user_id === null) return { error: `${target.full_name} is already a managed profile.` };

  const authUserId = target.auth_user_id;

  // One statement, while the login is still attached -- see above.
  const { error } = await supabase
    .from("members")
    .update({ auth_user_id: null, role: "child_managed", status: "managed" })
    .eq("id", memberId)
    .eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/family");
  revalidatePath(`/family/members/${memberId}`);

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: `${target.full_name} is now a managed profile, but their sign-in could not be removed from here. It no longer opens this household; remove the account itself to be sure.`,
    };
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);
  if (deleteError) {
    console.error(`Converted member ${memberId} but could not delete auth user`, deleteError.message);
    return {
      error: `${target.full_name} is now a managed profile, but their sign-in could not be deleted: ${deleteError.message}. It no longer opens this household.`,
    };
  }

  return { error: null };
}

/** Sets a member's family-relationship label ("Mother", "Son", etc.) —
 * distinct from `role`, which drives permission logic and stays untouched
 * here. RLS lets the organizer edit anyone's; a member can also edit their
 * own via the pre-existing self-update policy. */
export async function updateMemberRelationshipAction(memberId: string, relationship: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ relationship: clamp(relationship, 50) || null }).eq("id", memberId);
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
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
  return { error: error ? humanDatabaseError(error.message) : null };
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
  return { error: error ? humanDatabaseError(error.message) : null };
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
  if (error) return { error: humanDatabaseError(error.message) };

  if (photo.drive_file_id) {
    const token = await getValidDriveAccessToken(me.family_id);
    if (token) await deleteDriveFile(token, photo.drive_file_id).catch(() => {});
  } else if (photo.storage_path) {
    const { error: removeError } = await supabase.storage.from("avatars").remove([photo.storage_path]);
    if (removeError) console.error(`Background file ${photo.storage_path} was left in storage after its record was deleted`, removeError.message);
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
    const { error } = await supabase.from("families").update({ background_url: fallbackUrl }).eq("id", me.family_id);
    // The photo is gone; if this does not follow, the household keeps showing
    // a background that no longer exists.
    if (error) return { error: `The photo was removed, but the household background still points at it. ${error.message}` };
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
  const { error } = await supabase.from("families").update({ about: clamp(about, 2000) || null }).eq("id", me.family_id);
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
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
  const label = clamp(fields.label, 100);
  const houseNo = clamp(fields.houseNo, 50) || null;
  const building = clamp(fields.building, 100) || null;
  const street = clamp(fields.street, 150);
  const barangay = clamp(fields.barangay, 100) || null;
  const city = clamp(fields.city, 100);
  const province = clamp(fields.province, 100) || null;
  const country = clamp(fields.country, 100) || "Philippines";
  const zipCode = clamp(fields.zipCode, 20) || null;

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
  return { error: error ? humanDatabaseError(error.message) : null };
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
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** Removes a household address. Organizer only — RLS enforces this too. */
export async function removeFamilyAddressAction(addressId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can remove household addresses." };

  const supabase = await createClient();
  const { error } = await supabase.from("family_addresses").delete().eq("id", addressId);
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
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
        const { error } = await supabase.storage.from(bucket).remove(objects.map((o) => `${me.family_id}/${o.name}`));
        if (error) console.error(`Files in ${bucket} were left behind while deleting household ${me.family_id}`, error.message);
      }
    }
    // documents: "<family_id>/<entry_id>/<file>" — one extra level to walk.
    const { data: entryDirs } = await supabase.storage.from("documents").list(me.family_id);
    for (const dir of entryDirs ?? []) {
      const { data: files } = await supabase.storage.from("documents").list(`${me.family_id}/${dir.name}`);
      if (files && files.length > 0) {
        const { error } = await supabase.storage.from("documents").remove(files.map((f) => `${me.family_id}/${dir.name}/${f.name}`));
        if (error) console.error(`Documents in ${dir.name} were left behind while deleting household ${me.family_id}`, error.message);
      }
    }
  } catch {
    // Best effort — the household record itself is what matters most.
  }

  const { error } = await supabase.rpc("delete_household");
  if (error) return { error: humanDatabaseError(error.message) };

  redirect("/onboarding/profile");
}
