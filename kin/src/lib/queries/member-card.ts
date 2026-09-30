import { createClient } from "@/lib/supabase/server";
import type { PendingCheckIn } from "@/components/check-in-prompt";

/** "Are you okay?" asks waiting on this person, from the last day. Older ones
 * have been overtaken by events -- a call, a message -- and would only nag. */
export async function getMyPendingCheckIns(memberId: string): Promise<PendingCheckIn[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("member_checkins")
    .select("id, asked_by, asked_at")
    .eq("member_id", memberId)
    .is("answered_at", null)
    .gte("asked_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .order("asked_at", { ascending: false })
    .limit(5);
  if (!data?.length) return [];
  const { data: askers } = await supabase.from("members").select("id, full_name").in("id", [...new Set(data.map((c) => c.asked_by))]);
  const nameOf = new Map((askers ?? []).map((m) => [m.id, m.full_name]));
  // One per person asking: three taps of "Are you okay?" are one question.
  const seen = new Set<string>();
  return data
    .filter((c) => !seen.has(c.asked_by) && seen.add(c.asked_by))
    .map((c) => ({ id: c.id, askedBy: nameOf.get(c.asked_by) ?? "Someone" }));
}
