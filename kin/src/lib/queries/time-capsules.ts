import { createClient } from "@/lib/supabase/server";
import { familyDay } from "@/lib/time";

export type TimeCapsule = {
  id: string;
  writerMemberId: string | null;
  writerName: string;
  recipientMemberId: string;
  recipientName: string;
  title: string;
  body: string;
  opensOn: string;
  createdAt: string;
  sealed: boolean;
};

/** Every letter this person may read: their own sealed ones and the
 * household's opened ones. The table's own rules decide which
 * (20261007090000_time_capsule_letters.sql); nothing is filtered here. */
export async function getTimeCapsules(familyId: string, opts: { openingOn?: string } = {}): Promise<TimeCapsule[]> {
  const supabase = await createClient();
  let q = supabase
    .from("time_capsules")
    .select("id, writer_member_id, writer_name, recipient_member_id, title, body, opens_on, created_at, recipient:members!time_capsules_recipient_member_id_fkey(full_name)")
    .eq("family_id", familyId)
    .order("opens_on", { ascending: false });
  if (opts.openingOn) q = q.eq("opens_on", opts.openingOn);
  const { data } = await q;
  const today = familyDay();
  return (data ?? []).map((r) => ({
    id: r.id,
    writerMemberId: r.writer_member_id,
    writerName: r.writer_name,
    recipientMemberId: r.recipient_member_id,
    recipientName: (r.recipient as { full_name: string } | null)?.full_name ?? "",
    title: r.title,
    body: r.body,
    opensOn: r.opens_on,
    createdAt: r.created_at,
    sealed: r.opens_on > today,
  }));
}
