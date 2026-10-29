"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/report-error";

/** This person says yes to Kin AI, or takes it back (20261030120000). Only
 * their own rows change; the database function decides that, not this. */
export async function setKinAiOkAction(ok: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_kin_ai_ok", { p_ok: ok });
  if (error) {
    reportError("set_kin_ai_ok failed", error);
    return { error: "That didn't save. Try again." };
  }
  revalidatePath("/settings/privacy");
  return { error: null };
}
