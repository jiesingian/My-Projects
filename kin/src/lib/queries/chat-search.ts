import { createClient } from "@/lib/supabase/server";
import { getDirectPeers, getMyGroups } from "@/lib/queries/chat-rooms";

export type ChatSearchHit = { id: string; where: string; href: string; author: string; body: string; at: string };

/** Words in any conversation this person can read -- the household chat,
 * Family, one to one and groups. Row-level security decides what each
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
  ];
  return hits.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
}
