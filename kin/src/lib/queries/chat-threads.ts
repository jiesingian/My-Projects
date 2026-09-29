import { createClient } from "@/lib/supabase/server";
import { getChatUnread } from "@/lib/queries/chat";
import { mediaSummary } from "@/lib/chat-media";

/** One row of the chat list (Janine, 29 September): every conversation this
 * person can open, each with its last message and what is waiting unread. */
export type ChatThreadSummary = {
  key: string;
  kind: "household" | "link";
  title: string;
  subtitle: string;
  href: string;
  last: { author: string; body: string; at: string } | null;
  unread: number;
  mentioned: boolean;
};

const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "Someone";
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 120);

export async function getChatThreads(me: { id: string; family_id: string; familyName: string }): Promise<ChatThreadSummary[]> {
  const supabase = await createClient();

  const [unread, { data: lastHousehold }, { data: links }, { data: people }] = await Promise.all([
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

  // The household stays first -- it is the one most people open most -- and
  // the rest follow the conversation, newest first.
  linked.sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""));
  return [household, ...linked];
}
