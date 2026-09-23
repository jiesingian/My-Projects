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
  /** A memory from the journal, or a milestone -- a first day of school, a
   * graduation -- which is what distant relatives most want to hear about. */
  kind: "entry" | "milestone";
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

  // Shared milestones, by the same rule: RLS returns ours and linked
  // households' shared ones and nothing else.
  const { data: milestones } = await supabase
    .from("milestones")
    .select("id, title, milestone_date, family_id, shared_at")
    .not("shared_at", "is", null)
    .order("milestone_date", { ascending: false })
    .limit(200);

  const rows = data ?? [];
  const familyIds = [...new Set([...rows.map((r) => r.family_id), ...(milestones ?? []).map((m) => m.family_id)])];
  const { data: names } = await supabase.from("families").select("id, name").in("id", familyIds.length ? familyIds : [familyId]);
  const byId = new Map((names ?? []).map((f) => [f.id, f.name]));

  const entries: FeedEntry[] = rows.map((r) => ({
    kind: "entry" as const,
    id: r.id,
    title: r.title,
    note: r.note,
    entryDate: r.entry_date,
    familyId: r.family_id,
    householdName: byId.get(r.family_id) ?? "A linked household",
    isOurs: r.family_id === familyId,
  }));
  const moments: FeedEntry[] = (milestones ?? []).map((m) => ({
    kind: "milestone" as const,
    id: m.id,
    title: m.title,
    note: null,
    entryDate: m.milestone_date,
    familyId: m.family_id,
    householdName: byId.get(m.family_id) ?? "A linked household",
    isOurs: m.family_id === familyId,
  }));
  return [...entries, ...moments].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
}

export type LinkMessage = { id: string; authorName: string; body: string; createdAt: string; mine: boolean; ourHousehold: boolean };

/** One linked household's conversation with this one, oldest first, and the
 * name of the household on the other end. Null when the link is not an
 * accepted one this household is on -- the page shows nothing rather than an
 * empty thread that looks like it could be written to. */
export async function getLinkThread(linkId: string, familyId: string, memberId: string): Promise<{ otherFamilyName: string; messages: LinkMessage[] } | null> {
  const supabase = await createClient();
  const { data: link } = await supabase
    .from("family_links")
    .select("id, status, requester_family_id, addressee_family_id")
    .eq("id", linkId)
    .maybeSingle();
  if (!link || link.status !== "accepted") return null;
  const otherId = link.requester_family_id === familyId ? link.addressee_family_id : link.requester_family_id;
  const [{ data: other }, { data: messages }] = await Promise.all([
    supabase.from("families").select("name").eq("id", otherId).maybeSingle(),
    supabase.from("family_link_messages").select("id, family_id, member_id, author_name, body, created_at").eq("link_id", linkId).order("created_at").limit(300),
  ]);
  return {
    otherFamilyName: other?.name ?? "A linked household",
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      authorName: m.author_name || "Someone",
      body: m.body,
      createdAt: m.created_at,
      mine: m.member_id === memberId,
      ourHousehold: m.family_id === familyId,
    })),
  };
}
