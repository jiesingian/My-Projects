"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember, getCurrentMember } from "@/lib/session";
import { getValidDriveAccessToken, deleteDriveFile } from "@/lib/google-drive";
import { resolvePhotoUrl } from "@/lib/photo-url";
import type { ActionState } from "@/lib/actions/auth";
import { PASSWORD_MIN } from "@/lib/password";
import type { UploadedFile } from "@/lib/upload-client";
import type { TablesInsert } from "@/lib/database.types";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { isCountryCode } from "@/lib/countries";
import { birthdayProblem, familyDay, familyMidnight } from "@/lib/time";
import { stashOnboardingProfile, clearOnboardingProfile } from "@/lib/onboarding-profile";

// Onboarding was the one path with no ceiling on what it stored: every other
// form in the app clamps, but the first three screens a new household ever
// sees took a name of any length at all -- and the name is rendered in the
// members list, the header and the family tree, none of which survive it.
const NAME_MAX = 100;
const MOBILE_MAX = 30;
const HOUSEHOLD_MAX = 100;
const CODE_MAX = 100;


export async function saveProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fullName = clamp(String(formData.get("full_name") ?? ""), NAME_MAX);
  const dob = String(formData.get("dob") ?? "").trim();
  const mobile = clamp(String(formData.get("mobile") ?? ""), MOBILE_MAX);
  if (!fullName) return { error: "Tell us your name." };
  if (dob) {
    const problem = birthdayProblem(dob);
    if (problem) return { error: problem };
  }

  // The member row is created on the next screen, by create_family or
  // join_family, so this step has nothing to write yet -- it only has to hand
  // three fields forward. See ONBOARDING_PROFILE above for why they travel in
  // a cookie rather than in the URL they used to.
  await stashOnboardingProfile({ full_name: fullName, dob, mobile });
  redirect("/onboarding/family");
}

export async function createFamilyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const householdName = clamp(String(formData.get("household_name") ?? ""), HOUSEHOLD_MAX);
  const fullName = clamp(String(formData.get("full_name") ?? ""), NAME_MAX);
  const dobRaw = String(formData.get("dob") ?? "").trim();
  const dob = dobRaw || null;
  const mobile = clamp(String(formData.get("mobile") ?? ""), MOBILE_MAX) || null;
  const accessCode = clamp(String(formData.get("access_code") ?? ""), CODE_MAX);
  // Clamped like the rest, though isCountryCode below is the real guard: a
  // country arrives as a two-letter code and anything else is refused there.
  const country = clamp(String(formData.get("country") ?? ""), 100);
  if (!householdName) return { error: "Give the household a name." };
  // Separated from the household name because they are not entered on the
  // same screen. The name comes from the field in front of them; the name of
  // the person comes from step 3, through a hidden field -- so "your name is
  // required" next to a name box they have just filled in reads as a bug.
  if (!fullName) return { error: "We lost your name along the way. Go back a step and enter it again." };
  if (!accessCode) return { error: "Starting a new household needs an access code." };
  if (dob) {
    const problem = birthdayProblem(dob);
    if (problem) return { error: problem };
  }

  const supabase = await createClient();

  // Checked before the code is spent, not after. create_family refuses anyone
  // who already has a member row, and the redemption below is a separate
  // statement that has already incremented used_count by the time that
  // refusal comes back -- so somebody who walks back into this screen from
  // inside a household burned a use of a beta code and got an error for it.
  // Codes are finite and issued by hand; that is somebody's invite gone.
  if (await getCurrentMember()) {
    return { error: "You are already in a household. Leave it first to start a new one." };
  }

  // A new household is the thing worth protecting, so only a code we issued
  // opens one. A family's own invite code gets you through signup and into
  // that family — never into a household of your own.
  const { data: redeemed, error: redeemError } = await supabase.rpc("redeem_household_code", {
    p_code: accessCode,
  });
  if (redeemError) return { error: "We couldn't check that code just now. Try again in a moment." };
  if (!redeemed) return { error: "That access code isn't valid, or it has already been used up." };

  const { data: member, error } = await supabase.rpc("create_family", {
    p_household_name: householdName,
    p_full_name: fullName,
    p_dob: dob ?? undefined,
    p_mobile: mobile ?? undefined,
  });
  if (error) {
    // The check above closes the case that actually happens, but the two
    // statements still are not one transaction, so a failure here means a use
    // of the code is gone with no household to show for it. Say so, rather
    // than leaving somebody to discover it when the code is refused next
    // time, and record it where it can be traced -- never the code itself,
    // which is a credential.
    console.error("create_family failed after its access code was already redeemed", {
      household: householdName,
      reason: error.message,
    });
    return {
      error: `${humanDatabaseError(error.message)} Your access code was already counted as used — ask for a fresh one if this keeps happening.`,
    };
  }

  // country isn't part of create_family's own signature -- a plain update
  // right after, scoped to the household this call just created, the same
  // way updateHouseholdPrefsAction changes it later from Settings. Not
  // fatal if this fails or the field was somehow skipped: the household
  // exists either way, and every place country is read treats it as
  // optional, same as before this field existed.
  if (member?.family_id && isCountryCode(country)) {
    await supabase.from("families").update({ country }).eq("id", member.family_id);
  }

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

  await clearOnboardingProfile();
  redirect("/onboarding/members");
}

export async function joinFamilyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const inviteCode = clamp(String(formData.get("invite_code") ?? ""), CODE_MAX).toUpperCase();
  const fullName = clamp(String(formData.get("full_name") ?? ""), NAME_MAX);
  const dobRaw = String(formData.get("dob") ?? "").trim();
  const dob = dobRaw || null;
  const mobile = clamp(String(formData.get("mobile") ?? ""), MOBILE_MAX) || null;
  if (!inviteCode) return { error: "Enter the six-character invite code." };
  if (!fullName) return { error: "We lost your name along the way. Go back a step and enter it again." };
  if (dob) {
    const problem = birthdayProblem(dob);
    if (problem) return { error: problem };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_family", {
    p_invite_code: inviteCode,
    p_full_name: fullName,
    p_dob: dob ?? undefined,
    p_mobile: mobile ?? undefined,
    p_role: "adult",
  });
  // join_family raises three distinct things and this used to report all of
  // them as a bad code, including the one that is nothing to do with the
  // code: somebody already in a household, told over and over to check an
  // invite code that was right every time.
  if (error) {
    if (/already a member/i.test(error.message)) {
      return { error: "You are already in a household. Leave it first to join another." };
    }
    if (/not authenticated/i.test(error.message)) {
      return { error: "Your sign-in expired. Sign in again and pick up where you left off." };
    }
    return { error: "That invite code didn't match a household. Double-check it and try again." };
  }

  await clearOnboardingProfile();
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
  const dobProblem = birthdayProblem(dob);
  if (dobProblem) return { error: dobProblem };

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

  const fullName = clamp(String(formData.get("full_name") ?? ""), NAME_MAX);
  const dob = String(formData.get("dob") ?? "").trim() || null;
  // The default has to be applied after trimming, not before. A text input
  // that the user cleared submits "", not null, so `?? "child"` keeps the
  // empty string and the default never fires -- the child is stored with no
  // relationship at all, where the form plainly promised "child".
  const relationship = clamp(String(formData.get("relationship") ?? ""), 50) || "child";
  const email = clamp(String(formData.get("email") ?? ""), 254).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!fullName || !dob) return { error: "Name and date of birth are required." };
  const childDobProblem = birthdayProblem(dob);
  if (childDobProblem) return { error: childDobProblem };
  if (!email) return { error: "Enter the email this child will sign in with." };
  if (password.length < PASSWORD_MIN) return { error: `Give them a password of at least ${PASSWORD_MIN} characters.` };

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

  const { error, count } = await supabase.from("members").update({ role }, { count: "exact" }).eq("id", memberId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  if (count === 0) return { error: "That member is no longer in this household." };

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
  const { error, count } = await supabase
    .from("members")
    .update({ auth_user_id: null, role: "child_managed", status: "managed" }, { count: "exact" })
    .eq("id", memberId)
    .eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  // This one matters more than the rest of its kind. The read above can be
  // overtaken -- the member removed between the two statements -- and if the
  // update matched nothing, everything below still runs and deletes that
  // person's sign-in while their profile still has it attached. Stopping here
  // is the difference between "nothing happened" and "somebody lost their
  // login for no reason".
  if (count === 0) return { error: "That member is no longer in this household. Their sign-in has not been touched." };

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

// ── Family tree ────────────────────────────────────────────────────────────
//
// A date of birth here is not a member's own -- it can belong to someone
// born decades before this app existed, so it is checked far more loosely
// than birthdayProblem (which refuses anything before 1900, the right call
// for a living household but not for a great-grandparent).
function treeDateProblem(day: string): string | null {
  if (!familyMidnight(day)) return "That date isn't a real date.";
  if (day > familyDay()) return "A date of birth can't be in the future.";
  return null;
}

const TREE_NAME_MAX = 100;
const TREE_NOTES_MAX = 500;

/** Brings an existing household member into the tree as a node other people
 * can be linked to -- idempotent, since the editor calls this the moment
 * someone is chosen from the member list rather than requiring a separate
 * "add" step first. */
export async function addTreeMemberAction(memberId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: member } = await supabase.from("members").select("id, family_id").eq("id", memberId).maybeSingle();
  if (!member || member.family_id !== me.family_id) return { error: "That member could not be found." };

  const { data: existing } = await supabase.from("family_tree_people").select("id").eq("family_id", me.family_id).eq("member_id", memberId).maybeSingle();
  if (existing) return { error: null };

  const { error } = await supabase.from("family_tree_people").insert({ family_id: me.family_id, member_id: memberId, created_by: me.id });
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
}

export type TreePersonFields = { fullName: string; dob: string; notes: string };

/** Adds someone who has never had a Kin login -- a grandparent, an aunt, a
 * cousin -- as a tree-only entry. */
export async function addTreePersonAction(fields: TreePersonFields): Promise<ActionState> {
  const me = await requireCurrentMember();
  const fullName = clamp(fields.fullName, TREE_NAME_MAX);
  const dob = clamp(fields.dob, 10);
  const notes = clamp(fields.notes, TREE_NOTES_MAX);
  if (!fullName) return { error: "Give them a name." };
  if (dob) {
    const problem = treeDateProblem(dob);
    if (problem) return { error: problem };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("family_tree_people").insert({
    family_id: me.family_id,
    full_name: fullName,
    dob: dob || null,
    notes: notes || null,
    created_by: me.id,
  });
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** Edits a tree-only entry's own details. Refused for a member-linked row --
 * that name and birthdate come from the member's profile, edited there, so
 * the tree can't drift from it by being edited in a second place. */
export async function updateTreePersonAction(id: string, fields: TreePersonFields): Promise<ActionState> {
  const me = await requireCurrentMember();
  const fullName = clamp(fields.fullName, TREE_NAME_MAX);
  const dob = clamp(fields.dob, 10);
  const notes = clamp(fields.notes, TREE_NOTES_MAX);
  if (!fullName) return { error: "Give them a name." };
  if (dob) {
    const problem = treeDateProblem(dob);
    if (problem) return { error: problem };
  }

  const supabase = await createClient();
  const { data: row } = await supabase.from("family_tree_people").select("id, family_id, member_id").eq("id", id).maybeSingle();
  if (!row || row.family_id !== me.family_id) return { error: "That person could not be found." };
  if (row.member_id) return { error: "This person has a Kin profile — edit their name and birthdate there instead." };

  const { error } = await supabase
    .from("family_tree_people")
    .update({ full_name: fullName, dob: dob || null, notes: notes || null })
    .eq("id", id);
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
}

export type TreeLinkFields = { fatherId: string | null; motherId: string | null; spouseId: string | null };

/** Sets who someone's father, mother and spouse are -- each an id already on
 * record in this family's tree, or null to clear it. "Father's side" and
 * "mother's side" are never stored anywhere; they fall out of which of these
 * two fields a person was placed in, read back by getFamilyTree. */
export async function setTreeLinksAction(id: string, fields: TreeLinkFields): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (fields.fatherId === id || fields.motherId === id || fields.spouseId === id) {
    return { error: "Someone can't be their own father, mother, or spouse." };
  }
  if (fields.fatherId && fields.fatherId === fields.motherId) {
    return { error: "Father and mother can't be the same person." };
  }

  const supabase = await createClient();
  const ids = [id, fields.fatherId, fields.motherId, fields.spouseId].filter((v): v is string => !!v);
  const { data: rows } = await supabase.from("family_tree_people").select("id, family_id").in("id", ids);
  if (!rows || rows.length !== ids.length || rows.some((r) => r.family_id !== me.family_id)) {
    return { error: "One of those people could not be found." };
  }

  const { error } = await supabase
    .from("family_tree_people")
    .update({ father_id: fields.fatherId, mother_id: fields.motherId, spouse_id: fields.spouseId })
    .eq("id", id);
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** Removes a tree entry. Anyone linked to them as father, mother or spouse
 * simply loses that one link (ON DELETE SET NULL) rather than being removed
 * themselves -- and if the entry was a household member, only the tree
 * placement goes; the member and their Kin profile are untouched. */
export async function removeTreePersonAction(id: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: row } = await supabase.from("family_tree_people").select("family_id").eq("id", id).maybeSingle();
  if (!row || row.family_id !== me.family_id) return { error: "That person could not be found." };

  const { error } = await supabase.from("family_tree_people").delete().eq("id", id);
  revalidatePath("/family");
  return { error: error ? humanDatabaseError(error.message) : null };
}
