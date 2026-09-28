"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { isGrownUp } from "@/lib/roles";

/** Take or skip one of Kin's offers. respond_kin_offer() holds the rules. */
export async function respondKinOfferAction(offerId: string, accept: boolean): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can answer Kin's offers." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_kin_offer", { p_offer: offerId, p_accept: accept });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/today");
  return { error: null };
}

/** A new household names the family that invited it. set_referrer() checks
 * the window, the code, and that it happens once. */
export async function setReferrerAction(code: string): Promise<{ error: string | null; name?: string }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can say who invited the household." };
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length < 6) return { error: "That code looks too short." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_referrer", { p_code: clean });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/today");
  return { error: null, name: data ?? undefined };
}
