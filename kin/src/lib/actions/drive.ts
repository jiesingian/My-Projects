"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember } from "@/lib/session";

export async function disconnectDriveAction() {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  await supabase.from("drive_links").update({ connected: false }).eq("member_id", me.id);

  const admin = createAdminClient();
  if (admin) await admin.from("drive_tokens").delete().eq("member_id", me.id);

  revalidatePath("/settings");
}
