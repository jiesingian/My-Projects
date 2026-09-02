"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember } from "@/lib/session";

export async function disconnectDriveAction() {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return;

  const supabase = await createClient();
  await supabase.from("drive_links").update({ connected: false }).eq("family_id", me.family_id);

  const admin = createAdminClient();
  if (admin) await admin.from("drive_tokens").delete().eq("family_id", me.family_id);

  revalidatePath("/settings");
}
