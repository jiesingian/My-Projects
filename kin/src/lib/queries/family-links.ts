import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import type { FeedOccasion } from "@/lib/occasions";

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
  /** The entry's photos, ours or a linked household's (shared entries carry
   * their photos since 25 September). Ids only on ours: reactions and
   * comments stay in the household whose photo it is. */
  photos: { url: string; id: string | null }[];
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
    .select("id, title, note, entry_date, family_id, journal_entry_media(journal_media(id, storage_path, storage_provider))")
    .not("shared_at", "is", null)
    .order("entry_date", { ascending: false })
    .limit(200);

  // Shared milestones, by the same rule: RLS returns ours and linked
  // households' shared ones and nothing else.
  const { data: milestones } = await supabase
    .from("milestones")
    .select("id, title, milestone_date, family_id, shared_at, event_id")
    .not("shared_at", "is", null)
    .order("milestone_date", { ascending: false })
    .limit(200);

  const rows = data ?? [];
  // Signed with the reader's own session: the storage policy lets a linked
  // household read a shared entry's photo files and nothing else. Photos kept
  // in a household's Google Drive are left out -- another household has no
  // Drive connection to fetch them with.
  type Media = { id: string; storage_path: string | null; storage_provider: string };
  const mediaOf = (r: (typeof rows)[number]) =>
    (r.journal_entry_media ?? [])
      .map((m) => m.journal_media as unknown as Media | null)
      .filter((m): m is Media => !!m && m.storage_provider === "supabase" && !!m.storage_path);
  const signed = await getSignedUrls("journal", rows.flatMap((r) => mediaOf(r).map((m) => m.storage_path as string)));
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
    photos: mediaOf(r)
      .map((m) => ({ url: signed[m.storage_path as string], id: r.family_id === familyId ? m.id : null }))
      .filter((p): p is { url: string; id: string | null } => !!p.url),
  }));
  // A birthday marked as a milestone is already on today's birthday card, as
  // its ★; on its own day it is not listed a second time. Afterwards it is an
  // ordinary milestone in the feed like any other.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const moments: FeedEntry[] = (milestones ?? []).filter((m) => !(m.event_id && m.milestone_date === today)).map((m) => ({
    kind: "milestone" as const,
    id: m.id,
    title: m.title,
    note: null,
    entryDate: m.milestone_date,
    familyId: m.family_id,
    householdName: byId.get(m.family_id) ?? "A linked household",
    isOurs: m.family_id === familyId,
    photos: [],
  }));
  return [...entries, ...moments].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
}

/** Today's birthdays and anniversaries -- ours and linked households' -- with
 * the greetings this household may read under each (the birthday household
 * reads them all; anyone else reads their own household's). */
export async function getFeedOccasions(meId: string, familyId: string): Promise<FeedOccasion[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("feed_occasions_today");
  const rows = (data ?? []).filter((o) => o.kind === "birthday" || o.kind === "anniversary");
  if (rows.length === 0) return [];
  // Only this year's day: the same event comes round again next year.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const eventIds = rows.map((o) => o.event_id);
  const [{ data: greetings }, { data: marked }] = await Promise.all([
    supabase
      .from("occasion_greetings")
      .select("id, event_id, occasion_date, body, author_name, member_id, family_id, created_at")
      .in("event_id", eventIds)
      .eq("occasion_date", today)
      .order("created_at", { ascending: true }),
    // Milestones are readable by their own household and, once shared, by
    // linked ones -- so a linked household sees the ★ when the birthday
    // household has shared it, the same as any other milestone.
    supabase.from("milestones").select("event_id").in("event_id", eventIds).eq("milestone_date", today),
  ]);
  const milestoneFor = new Set((marked ?? []).map((m) => m.event_id));
  return rows.map((o) => ({
    eventId: o.event_id,
    title: o.title,
    kind: o.kind as FeedOccasion["kind"],
    years: o.years,
    householdName: o.household_name,
    isOurs: o.is_ours,
    milestone: milestoneFor.has(o.event_id),
    greetings: (greetings ?? [])
      .filter((g) => g.event_id === o.event_id)
      .map((g) => ({
        id: g.id,
        body: g.body,
        authorName: g.author_name,
        profileHref: !g.member_id ? null : g.family_id === familyId ? `/family/members/${g.member_id}` : `/family/relatives/${g.member_id}`,
        mine: g.member_id === meId,
      })),
  }));
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
