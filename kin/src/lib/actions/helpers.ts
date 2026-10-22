"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, getSessionUser, requireCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { guessSection } from "@/lib/grocery";
import { HELPER_INVITE_COOKIE, normaliseHelperCode, type HelperSwitches } from "@/lib/helper-access";
import { refusalMessage } from "@/lib/report-error";

/** Helper access (20261015121000_household_helpers.sql). Two sides:
 *
 * - the household's grown-ups add a helper, change what they see, renew an
 *   unused link and remove them (Settings, Household);
 * - the helper accepts the link, ticks and adds to the To-Buy list.
 *
 * Every one of these is a database function that checks the caller again --
 * a grown-up of that household, or a live helper of it with that switch on.
 * The checks here only give a kinder message first. */

type Result = { error: string | null };

/** The database's own words for a refusal are written for people, so they are
 * passed on; anything else is a plain "try again". */
function said(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (/grown-up|helper|link|list|name|household|up to 10|already/i.test(message)) return message;
  return fallback;
}

/** Null for a grown-up of a household; the reason otherwise. */
async function notGrownUp(): Promise<string | null> {
  const me = await requireCurrentMember();
  return isGrownUp(me.role) ? null : "Only a grown-up can change the household's helpers.";
}

export async function addHelperAction(name: string, s: HelperSwitches): Promise<Result & { code: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can add a helper.", code: null };
  const clean = name.trim().slice(0, 40);
  if (!clean) return { error: "Give the helper a name.", code: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_helper_invite", { p_name: clean, p_list: s.list, p_meals: s.meals, p_kids: s.kids });
  if (error || !data?.[0]) return { error: said(refusalMessage(error), "It didn't save. Try again."), code: null };
  revalidatePath("/settings/household");
  return { error: null, code: data[0].code };
}

export async function setHelperAccessAction(helperId: string, s: HelperSwitches): Promise<Result> {
  const refused = await notGrownUp();
  if (refused) return { error: refused };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_helper_access", { p_helper: helperId, p_list: s.list, p_meals: s.meals, p_kids: s.kids });
  if (error) return { error: said(refusalMessage(error), "It didn't save. Try again.") };
  revalidatePath("/settings/household");
  return { error: null };
}

export async function renewHelperLinkAction(helperId: string): Promise<Result & { code: string | null }> {
  const refused = await notGrownUp();
  if (refused) return { error: refused, code: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("renew_helper_invite", { p_helper: helperId });
  if (error || !data) return { error: said(refusalMessage(error), "It didn't make a new link. Try again."), code: null };
  revalidatePath("/settings/household");
  return { error: null, code: data };
}

export async function removeHelperAction(helperId: string): Promise<Result> {
  const refused = await notGrownUp();
  if (refused) return { error: refused };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_helper", { p_helper: helperId });
  if (error) return { error: said(refusalMessage(error), "It didn't remove. Try again.") };
  revalidatePath("/settings/household");
  return { error: null };
}

// -- The helper's side ---------------------------------------------------------
// Signed in, but never a member: these ask only for a session, and the
// database decides the rest.

export async function acceptHelperLinkAction(): Promise<Result> {
  if (!(await getSessionUser())) redirect("/login");
  const jar = await cookies();
  const code = normaliseHelperCode(jar.get(HELPER_INVITE_COOKIE)?.value);
  if (!code) return { error: "That helper link has been used or has expired. Ask the family for a new one." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_helper_invite", { p_code: code });
  if (error) return { error: said(refusalMessage(error), "It didn't work. Try again.") };
  jar.delete(HELPER_INVITE_COOKIE);
  redirect("/helper");
}

/** "Not now" on a helper link: forget it. A member goes back to their own
 * Kin; anyone else to /onboarding/profile, which -- the link gone -- sends
 * someone who already helps a household to /helper and everyone else on to
 * set up Kin for themselves. */
export async function forgetHelperLinkAction(): Promise<void> {
  (await cookies()).delete(HELPER_INVITE_COOKIE);
  redirect((await getCurrentMember()) ? "/today" : "/onboarding/profile");
}

export async function helperTickAction(itemId: string, checked: boolean): Promise<Result> {
  if (!(await getSessionUser())) return { error: "Sign in again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("helper_tick_buy_item", { p_item: itemId, p_checked: checked });
  if (error) return { error: said(refusalMessage(error), "It didn't save. Try again.") };
  revalidatePath("/helper");
  return { error: null };
}

export async function helperAddAction(familyId: string, name: string): Promise<Result> {
  if (!(await getSessionUser())) return { error: "Sign in again." };
  const clean = name.trim().slice(0, 150);
  if (!clean) return { error: "Name the item." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("helper_add_buy_item", { p_family: familyId, p_name: clean, p_section: guessSection(clean) });
  if (error) return { error: said(refusalMessage(error), "It didn't save. Try again.") };
  revalidatePath("/helper");
  return { error: null };
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Tell me when the family adds to the list" (20261019212500), for this
 * phone and this household. save_helper_push() checks the helper again. */
export async function saveHelperPushAction(familyId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<Result> {
  if (!(await getSessionUser())) return { error: "Sign in again." };
  if (!UUID_SHAPE.test(familyId)) return { error: "This list is not shared with you." };
  const fits = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || sub.endpoint.length > 1000) return { error: "This phone didn't give a usable address." };
  if (!fits(sub.keys?.p256dh, 200) || !fits(sub.keys?.auth, 100)) return { error: "This phone didn't give usable keys." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_helper_push", { p_family: familyId, p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth });
  if (error) return { error: said(refusalMessage(error), "It didn't save. Try again.") };
  return { error: null };
}

export async function removeHelperPushAction(familyId: string, endpoint: string): Promise<Result> {
  if (!(await getSessionUser())) return { error: "Sign in again." };
  if (!UUID_SHAPE.test(familyId)) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_helper_push", { p_family: familyId, p_endpoint: endpoint });
  if (error) return { error: "It didn't save. Try again." };
  return { error: null };
}

export async function helperPushSavedAction(familyId: string, endpoint: string): Promise<boolean> {
  if (!(await getSessionUser()) || !UUID_SHAPE.test(familyId)) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("helper_push_saved", { p_family: familyId, p_endpoint: endpoint });
  return data === true;
}
