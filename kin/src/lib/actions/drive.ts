"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";

export async function disconnectDriveAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can disconnect Drive." };

  const supabase = await createClient();
  const { error } = await supabase.from("drive_links").update({ connected: false }).eq("family_id", me.family_id);
  if (error) return { error: `Drive could not be disconnected. ${error.message}` };

  // "Disconnected" should mean the credential is gone, not just the flag.
  const admin = createAdminClient();
  if (admin) {
    const { error: tokenError } = await admin.from("drive_tokens").delete().eq("family_id", me.family_id);
    if (tokenError) return { error: `Disconnected, but the stored Google token could not be removed. ${tokenError.message}` };
  }

  revalidatePath("/settings");
  return { error: null };
}
