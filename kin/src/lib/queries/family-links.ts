import { createClient } from "@/lib/supabase/server";

export type FamilyLink = {
  id: string;
  otherFamilyName: string;
  status: string;
  /** Did we ask them, or did they ask us? Only the household that was asked
   * can answer, so the two cases show different buttons. */
  weAsked: boolean;
  requestedAt: string;
};

export async function getFamilyLinks(familyId: string): Promise<FamilyLink[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("family_links")
    .select("id, status, requester_family_id, addressee_family_id, requested_at")
    .in("status", ["pending", "accepted"])
    .order("requested_at", { ascending: false });

  const rows = data ?? [];
  const otherIds = rows.map((r) => (r.requester_family_id === familyId ? r.addressee_family_id : r.requester_family_id));
  // Names come from families, which is not readable across the wall -- so a
  // household we have only been asked by shows as "Another household" until
  // the link is accepted. That is the policy working, not a bug.
  const { data: names } = await supabase.from("families").select("id, name").in("id", otherIds.length ? otherIds : [familyId]);
  const byId = new Map((names ?? []).map((f) => [f.id, f.name]));

  return rows.map((r) => {
    const weAsked = r.requester_family_id === familyId;
    const otherId = weAsked ? r.addressee_family_id : r.requester_family_id;
    return {
      id: r.id,
      otherFamilyName: byId.get(otherId) ?? "Another household",
      status: r.status,
      weAsked,
      requestedAt: r.requested_at,
    };
  });
}

export type FeedEntry = {
  id: string;
  title: string;
  note: string | null;
  entryDate: string;
  familyId: string;
  householdName: string;
  isOurs: boolean;
};

/** Everyone's shared memories in one list, newest first -- "organise family
 * memories together as one", which was the point of asking for it.
 *
 * One query, not two: row-level security already decides what is visible,
 * so selecting shared entries without a family filter returns ours plus the
 * linked households' and nothing else. Filtering by family here would be
 * writing the policy a second time, in a place where it could drift. */
export async function getFamilyFeed(familyId: string): Promise<FeedEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entries")
    .select("id, title, note, entry_date, family_id")
    .not("shared_at", "is", null)
    .order("entry_date", { ascending: false })
    .limit(200);

  const rows = data ?? [];
  const familyIds = [...new Set(rows.map((r) => r.family_id))];
  const { data: names } = await supabase.from("families").select("id, name").in("id", familyIds.length ? familyIds : [familyId]);
  const byId = new Map((names ?? []).map((f) => [f.id, f.name]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    note: r.note,
    entryDate: r.entry_date,
    familyId: r.family_id,
    householdName: byId.get(r.family_id) ?? "A linked household",
    isOurs: r.family_id === familyId,
  }));
}
