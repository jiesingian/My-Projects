import { createClient } from "@/lib/supabase/server";
import { getChatUnread } from "@/lib/queries/chat";
import { mediaSummary } from "@/lib/chat-media";
import { getDirectPeers, getRoomUnread, getThreadPrefs } from "@/lib/queries/chat-rooms";

/** One row of the chat list (Janine, 29 September): every conversation this
 * person can open, each with its last message and what is waiting unread. */
export type ChatThreadSummary = {
  key: string;
  kind: "household" | "family" | "link" | "dm";
  /** A person's photo, for a one-to-one conversation. */
  avatarUrl?: string | null;
  title: string;
  subtitle: string;
  href: string;
  last: { author: string; body: string; at: string } | null;
  unread: number;
  mentioned: boolean;
  /** This person's own choices (20260929161000): pinned first in the list,
   * muted sends no notifications and stays out of the tab's badge. */
  pinned?: boolean;
  muted?: boolean;
};

const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "Someone";
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 120);

export async function getChatThreads(me: { id: string; family_id: string; person_id: string; familyName: string }): Promise<ChatThreadSummary[]> {
  const supabase = await createClient();

  const [unread, { data: lastHousehold }, { data: links }, { data: people }, roomUnread, peers, { data: lastFamily }, { data: directRows }] = await Promise.all([
    getChatUnread(me.family_id, me.id),
    supabase
      .from("family_messages")
      .select("id, member_id, body, created_at")
      .eq("family_id", me.family_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("family_links")
      .select("id, requester_family_id, addressee_family_id")
      .eq("status", "accepted"),
    supabase.from("members").select("id, full_name").eq("family_id", me.family_id),
    getRoomUnread(),
    getDirectPeers(),
    supabase.from("family_tree_messages").select("member_id, author_name, body, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    // Newest first across every one-to-one conversation; the first row per
    // person is that conversation's last message.
    supabase.from("direct_messages").select("person_low, person_high, sender_person_id, body, created_at").order("created_at", { ascending: false }).limit(300),
  ]);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  const household: ChatThreadSummary = {
    key: "household",
    kind: "household",
    title: me.familyName,
    subtitle: "Household · everyone at home",
    href: "/chat/household",
    last: lastHousehold
      ? {
          author: lastHousehold.member_id === me.id ? "You" : first(nameOf.get(lastHousehold.member_id ?? "")),
          // A photo or a file on its own has no words to show.
          body: mediaSummary(lastHousehold.body) ?? (oneLine(lastHousehold.body) || "Sent an attachment"),
          at: lastHousehold.created_at,
        }
      : null,
    unread: unread.count,
    mentioned: unread.mentioned,
  };

  // A conversation with each linked household (20260923170000), newest
  // message per link from one query for all of them.
  const rows = links ?? [];
  const otherIds = rows.map((l) => (l.requester_family_id === me.family_id ? l.addressee_family_id : l.requester_family_id));
  const [{ data: names }, { data: linkMessages }] = rows.length
    ? await Promise.all([
        supabase.from("families").select("id, name").in("id", otherIds),
        supabase
          .from("family_link_messages")
          .select("link_id, member_id, author_name, body, created_at")
          .in("link_id", rows.map((l) => l.id))
          .order("created_at", { ascending: false })
          .limit(200),
      ])
    : [{ data: [] }, { data: [] }];
  const familyName = new Map((names ?? []).map((f) => [f.id, f.name]));
  const latest = new Map<string, NonNullable<typeof linkMessages>[number]>();
  for (const m of linkMessages ?? []) if (!latest.has(m.link_id)) latest.set(m.link_id, m);

  const linked: ChatThreadSummary[] = rows.map((l, i) => {
    const m = latest.get(l.id);
    return {
      key: `link:${l.id}`,
      kind: "link",
      title: familyName.get(otherIds[i]) ?? "A linked household",
      subtitle: "Your household and theirs",
      href: `/journal/links/${l.id}`,
      last: m ? { author: m.member_id === me.id ? "You" : first(m.author_name), body: oneLine(m.body), at: m.created_at } : null,
      unread: 0,
      mentioned: false,
    };
  });

  // The whole family tree in one room (20260929090000): shown once there is
  // a linked household to talk to, or once anything has been said there.
  const family: ChatThreadSummary[] =
    rows.length > 0 || lastFamily
      ? [
          {
            key: "family",
            kind: "family",
            title: "Family",
            subtitle: "Your household and every linked one",
            href: "/chat/family",
            last: lastFamily
              ? { author: lastFamily.member_id === me.id ? "You" : first(lastFamily.author_name), body: oneLine(lastFamily.body) || "Sent an attachment", at: lastFamily.created_at }
              : null,
            unread: roomUnread.get("family") ?? 0,
            mentioned: false,
          },
        ]
      : [];

  const lastDirect = new Map<string, NonNullable<typeof directRows>[number]>();
  for (const d of directRows ?? []) {
    const other = d.person_low === me.person_id ? d.person_high : d.person_low;
    if (!lastDirect.has(other)) lastDirect.set(other, d);
  }
  const direct: ChatThreadSummary[] = peers
    // A connection with nothing said yet is offered from Connections, not
    // listed here as an empty conversation.
    .filter((p) => lastDirect.has(p.personId))
    .map((p) => {
      const d = lastDirect.get(p.personId)!;
      return {
        key: `dm:${p.personId}`,
        kind: "dm" as const,
        title: p.fullName,
        subtitle: p.householdName ?? "",
        href: `/chat/dm/${p.personId}`,
        avatarUrl: p.avatarUrl,
        last: { author: d.sender_person_id === me.person_id ? "You" : first(p.fullName), body: oneLine(d.body) || "Sent an attachment", at: d.created_at },
        unread: roomUnread.get(`dm:${p.personId}`) ?? 0,
        mentioned: false,
      };
    });

  // Household and Family stay first -- the two every person has -- and the
  // rest follow the conversation, newest first. Anything pinned goes above
  // all of it, in that same order.
  const rest = [...linked, ...direct].sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""));
  const prefs = await getThreadPrefs();
  const all = [household, ...family, ...rest].map((t) => ({ ...t, pinned: prefs.get(t.key)?.pinned ?? false, muted: prefs.get(t.key)?.muted ?? false }));
  return [...all.filter((t) => t.pinned), ...all.filter((t) => !t.pinned)];
}
