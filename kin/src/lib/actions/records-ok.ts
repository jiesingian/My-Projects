"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/report-error";

/** This person's OK to keep health or money records in Kin (20261030130000). */
export async function setRecordsOkAction(area: "health" | "money"): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_records_ok", { p_area: area });
  if (error) {
    reportError("set_records_ok failed", error, area);
    return { error: "That didn't save. Try again." };
  }
  revalidatePath(area === "health" ? "/family" : "/wealth");
  return { error: null };
}
