import { createClient } from "@/lib/supabase/server";
import { getDirectPeers, getMyGroups } from "@/lib/queries/chat-rooms";

export type ChatSearchHit = { id: string; where: string; href: string; author: string; body: string; at: string };

/** Words in any conversation this person can read -- the household chat,
 * Family, one to one and groups, voice notes' transcripts included. Row-level security decides what each
 * table returns, so this can only ever find what the person could scroll
 * to. Newest first, a few dozen at most. */
export async function searchChats(me: { id: string; family_id: string; person_id: string; familyName: string }, raw: string): Promise<ChatSearchHit[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  // % and _ are wildcards in ilike; a search for "50%" means the characters.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const supabase = await createClient();
  const [household, family, direct, group, people, peers, groups] = await Promise.all([
    supabase.from("family_messages").select("id, member_id, body, created_at").eq("family_id", me.family_id).is("deleted_at", null).ilike("body", pattern).order("created_at", { ascending: false }).limit(25),
    supabase.from("family_tree_messages").select("id, member_id, author_name, body, created_at").ilike("body", pattern).order("created_at", { ascending: false }).limit(25),
    supabase.from("direct_messages").select("id, person_low, person_high, sender_person_id, body, created_at").ilike("body", pattern).order("created_at", { ascending: false }).limit(25),
    supabase.from("chat_group_messages").select("id, group_id, sender_person_id, author_name, body, created_at").ilike("body", pattern).order("created_at", { ascending: false }).limit(25),
    supabase.from("members").select("id, full_name").eq("family_id", me.family_id),
    getDirectPeers(),
    getMyGroups(),
  ]);
  // Voice notes' transcripts (20260929170000), searched like words -- each
  // table's own row-level security decides which ones this person can read.
  const [homeVoice, roomVoice] = await Promise.all([
    supabase.from("family_message_attachments").select("id, message_id, transcript, created_at").eq("family_id", me.family_id).ilike("transcript", pattern).limit(15),
    supabase
      .from("chat_room_attachments")
      .select("id, family_message_id, direct_message_id, group_message_id, transcript, created_at")
      .ilike("transcript", pattern)
      .limit(15),
  ]);
  // Which conversation a one-to-one or group voice note belongs to.
  const dmIds = (roomVoice.data ?? []).map((a) => a.direct_message_id).filter((x): x is string => !!x);
  const groupMsgIds = (roomVoice.data ?? []).map((a) => a.group_message_id).filter((x): x is string => !!x);
  const [dmRows, groupRows] = await Promise.all([
    dmIds.length ? supabase.from("direct_messages").select("id, person_low, person_high").in("id", dmIds) : Promise.resolve({ data: [] as { id: string; person_low: string; person_high: string }[] }),
    groupMsgIds.length ? supabase.from("chat_group_messages").select("id, group_id").in("id", groupMsgIds) : Promise.resolve({ data: [] as { id: string; group_id: string }[] }),
  ]);
  const dmOther = new Map((dmRows.data ?? []).map((d) => [d.id, d.person_low === me.person_id ? d.person_high : d.person_low]));
  const groupOfMsg = new Map((groupRows.data ?? []).map((g) => [g.id, g.group_id]));
  const nameOf = new Map((people.data ?? []).map((p) => [p.id, p.full_name]));
  const peerOf = new Map(peers.map((p) => [p.personId, p.fullName]));
  const groupOf = new Map(groups.map((g) => [g.id, g.name]));
  const first = (n: string | undefined | null) => (n ?? "").split(" ")[0] || "Someone";

  const hits: ChatSearchHit[] = [
    ...(household.data ?? []).map((m) => ({
      id: `h-${m.id}`,
      where: me.familyName,
      href: "/chat/household",
      author: m.member_id === me.id ? "You" : first(nameOf.get(m.member_id ?? "")),
      body: m.body,
      at: m.created_at,
    })),
    ...(family.data ?? []).map((m) => ({ id: `f-${m.id}`, where: "Family", href: "/chat/family", author: m.member_id === me.id ? "You" : first(m.author_name), body: m.body, at: m.created_at })),
    ...(direct.data ?? []).map((m) => {
      const other = m.person_low === me.person_id ? m.person_high : m.person_low;
      return {
        id: `d-${m.id}`,
        where: peerOf.get(other) ?? "One to one",
        href: `/chat/dm/${other}`,
        author: m.sender_person_id === me.person_id ? "You" : first(peerOf.get(other)),
        body: m.body,
        at: m.created_at,
      };
    }),
    ...(group.data ?? []).map((m) => ({
      id: `g-${m.id}`,
      where: groupOf.get(m.group_id) ?? "Group",
      href: `/chat/groups/${m.group_id}`,
      author: m.sender_person_id === me.person_id ? "You" : first(m.author_name),
      body: m.body,
      at: m.created_at,
    })),
    ...(homeVoice.data ?? []).map((a) => ({ id: `hv-${a.id}`, where: me.familyName, href: "/chat/household", author: "🎤 Voice note", body: a.transcript ?? "", at: a.created_at })),
    ...(roomVoice.data ?? []).flatMap((a) => {
      const base = { id: `rv-${a.id}`, author: "🎤 Voice note", body: a.transcript ?? "", at: a.created_at };
      if (a.family_message_id) return [{ ...base, where: "Family", href: "/chat/family" }];
      const other = a.direct_message_id ? dmOther.get(a.direct_message_id) : undefined;
      if (other) return [{ ...base, where: peerOf.get(other) ?? "One to one", href: `/chat/dm/${other}` }];
      const g = a.group_message_id ? groupOfMsg.get(a.group_message_id) : undefined;
      if (g) return [{ ...base, where: groupOf.get(g) ?? "Group", href: `/chat/groups/${g}` }];
      return [];
    }),
  ];
  return hits.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
}
