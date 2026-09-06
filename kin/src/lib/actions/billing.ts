"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";

/** Applies an access code to the household that already exists — the "or a
 * code" half of getting in. The grant is read off the code in the database,
 * never taken from the browser, and a use is counted under a row lock. */
export async function redeemCodeForHouseholdAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can enter a code for the household." };

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the code you were given." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_code_for_household", { p_code: code });
  if (error) return { error: "We couldn't check that code just now. Try again in a moment." };
  if (data === "invalid") return { error: "That code isn't valid, or it has already been used up." };

  revalidatePath("/", "layout");
  return { error: null };
}
