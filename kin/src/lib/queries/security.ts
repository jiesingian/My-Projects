import { createClient } from "@/lib/supabase/server";
import type { EnrolledDevice } from "@/components/documents-lock-settings";

/** The authenticators this member has registered. Row-level security already
 * scopes this to them; the member_id filter is here so a mistake in one
 * place is not enough on its own. */
export async function getEnrolledDevices(memberId: string): Promise<EnrolledDevice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("member_webauthn_credentials")
    .select("id, label, created_at, last_used_at")
    .eq("member_id", memberId)
    .order("created_at");
  return (data ?? []).map((d) => ({
    id: d.id,
    label: d.label,
    createdAt: d.created_at,
    lastUsedAt: d.last_used_at,
  }));
}
