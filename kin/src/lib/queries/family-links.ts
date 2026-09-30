import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import type { FeedOccasion } from "@/lib/occasions";
import { reactionsFor, type RoomMessage } from "@/lib/queries/chat-rooms";

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
  /** Reactions and comments from this household and the households linked
   * with the one it came from (20260929034700). */
  reactions: { emoji: string; count: number; names: string[] }[];
  myReaction: string | null;
  comments: { id: string; author: string; body: string; createdAt: string; mine: boolean; canRemove: boolean }[];
};

/** Everyone's shared memories in one list, newest first -- "organise family
 * memories together as one", which was the point of asking for it.
 *
 * One query, not two: row-level security already decides what is visible,
 * so selecting shared entries without a family filter returns ours plus the
 * linked households' and nothing else. Filtering by family here would be
 * writing the policy a second time, in a place where it could drift. */
export async function getFamilyFeed(familyId: string, meId?: string): Promise<FeedEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entries")
    .select("id, title, note, entry_date, family_id, milestone, event_id, journal_entry_media(journal_media(id, storage_path, storage_provider))")
    .not("shared_at", "is", null)
    .order("entry_date", { ascending: false })
    .limit(200);

  // Only our household and the households linked with it. Row-level security
  // also lets a reader see entries made Public by people they are connected
  // with (20260929100200) -- those belong in the Public feed, not here, even
  // when they happen to be shared with relatives too.
  const { data: links } = await supabase.from("family_links").select("requester_family_id, addressee_family_id").eq("status", "accepted");
  const feedFamilies = new Set([familyId, ...(links ?? []).flatMap((l) => [l.requester_family_id, l.addressee_family_id])]);
  const rows = (data ?? []).filter((r) => feedFamilies.has(r.family_id));
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
  const familyIds = [...new Set(rows.map((r) => r.family_id))];
  const { data: names } = await supabase.from("families").select("id, name").in("id", familyIds.length ? familyIds : [familyId]);
  const byId = new Map((names ?? []).map((f) => [f.id, f.name]));

  // The talk under each memory, in two queries for the whole feed.
  const entryIds = rows.map((r) => r.id);
  const [{ data: reactionRows }, { data: commentRows }] = entryIds.length
    ? await Promise.all([
        supabase.from("journal_reactions").select("entry_id, emoji, member_id, author_name").in("entry_id", entryIds),
        supabase.from("journal_comments").select("id, entry_id, body, created_at, member_id, author_name").in("entry_id", entryIds).order("created_at", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];
  const first = (n: string) => n.split(" ")[0] || "Someone";

  // A milestone is an entry marked ★ (20260929023000). A birthday marked as a
  // milestone is already on today's birthday card, as its ★; on its own day
  // it is not listed a second time. Afterwards it is in the feed like any other.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return rows
    .filter((r) => !(r.milestone && r.event_id && r.entry_date === today))
    .map((r) => ({
      kind: r.milestone ? ("milestone" as const) : ("entry" as const),
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
      ...talkFor(r.id, r.family_id === familyId),
    }));

  function talkFor(entryId: string, ours: boolean) {
    const counts = new Map<string, { emoji: string; count: number; names: string[] }>();
    let myReaction: string | null = null;
    for (const x of reactionRows ?? []) {
      if (x.entry_id !== entryId) continue;
      if (x.member_id === meId) myReaction = x.emoji;
      const c = counts.get(x.emoji) ?? { emoji: x.emoji, count: 0, names: [] };
      c.count += 1;
      c.names.push(x.member_id === meId ? "You" : first(x.author_name));
      counts.set(x.emoji, c);
    }
    const comments = (commentRows ?? [])
      .filter((c) => c.entry_id === entryId)
      .map((c) => {
        const mine = !!meId && c.member_id === meId;
        return { id: c.id, author: mine ? "You" : first(c.author_name), body: c.body, createdAt: c.created_at, mine, canRemove: mine || ours };
      });
    return { reactions: [...counts.values()].sort((a, b) => b.count - a.count), myReaction, comments };
  }
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
    // Milestones (entries marked ★) are readable by their own household and,
    // once shared, by linked ones -- so a linked household sees the ★ when
    // the birthday household has shared it, the same as any other milestone.
    supabase.from("journal_entries").select("event_id").in("event_id", eventIds).eq("entry_date", today).eq("milestone", true),
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

export type LinkMessage = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
  ourHousehold: boolean;
  /** The chat's six, grouped by emoji (20260930100001). */
  reactions: RoomMessage["reactions"];
};

/** One linked household's conversation with this one, oldest first, and the
 * name of the household on the other end. Null when the link is not an
 * accepted one this household is on -- the page shows nothing rather than an
 * empty thread that looks like it could be written to. */
export async function getLinkThread(
  linkId: string,
  familyId: string,
  memberId: string,
  personId: string,
): Promise<{ otherFamilyName: string; messages: LinkMessage[] } | null> {
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
  const reactions = await reactionsFor(
    "link_message_id",
    (messages ?? []).map((m) => m.id),
    personId,
  );
  return {
    otherFamilyName: other?.name ?? "A linked household",
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      authorName: m.author_name || "Someone",
      body: m.body,
      createdAt: m.created_at,
      mine: m.member_id === memberId,
      ourHousehold: m.family_id === familyId,
      reactions: reactions.get(m.id) ?? [],
    })),
  };
}
