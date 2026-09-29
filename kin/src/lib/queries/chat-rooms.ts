import { createClient } from "@/lib/supabase/server";

/** The family-tree room and one-to-one conversations
 * (20260929090000_family_chat_and_direct_messages.sql). Row-level security
 * decides what comes back; nothing here filters by household, which would be
 * writing the policy a second time where it could drift. */
export type RoomMessage = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
  /** The writer's household, in the family room; null one to one. */
  householdName: string | null;
  ourHousehold: boolean;
};

export type DirectPeer = { personId: string; fullName: string; avatarUrl: string | null; householdName: string | null; connected: boolean };

/** The pair, in the order the table and the realtime topic store it. */
export function pairOf(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getFamilyRoom(me: { id: string; family_id: string }): Promise<{ messages: RoomMessage[]; households: string[] }> {
  const supabase = await createClient();
  const [{ data }, { data: links }] = await Promise.all([
    supabase.from("family_tree_messages").select("id, family_id, member_id, author_name, body, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("family_links").select("requester_family_id, addressee_family_id").eq("status", "accepted"),
  ]);
  const rows = (data ?? []).slice().reverse();
  const linkedIds = (links ?? []).map((l) => (l.requester_family_id === me.family_id ? l.addressee_family_id : l.requester_family_id));
  const ids = [...new Set([...rows.map((r) => r.family_id), ...linkedIds, me.family_id])];
  const { data: names } = await supabase.from("families").select("id, name").in("id", ids);
  const nameOf = new Map((names ?? []).map((f) => [f.id, f.name]));
  return {
    households: linkedIds.map((id) => nameOf.get(id) ?? "A linked household"),
    messages: rows.map((r) => ({
      id: r.id,
      authorName: r.author_name || "Someone",
      body: r.body,
      createdAt: r.created_at,
      mine: r.member_id === me.id,
      householdName: nameOf.get(r.family_id) ?? "A linked household",
      ourHousehold: r.family_id === me.family_id,
    })),
  };
}

export async function getDirectPeers(): Promise<DirectPeer[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_direct_threads");
  return (data ?? []).map((r) => ({ personId: r.person_id, fullName: r.full_name, avatarUrl: r.avatar_url, householdName: r.household_name, connected: r.connected }));
}

/** A conversation with one person, and who they are -- null when this person
 * has never been connected with them and has no history with them, so the
 * page shows "not found" rather than an empty thread nobody can write in. */
export async function getDirectThread(myPersonId: string, otherPersonId: string): Promise<{ peer: DirectPeer; messages: RoomMessage[] } | null> {
  const peer = (await getDirectPeers()).find((p) => p.personId === otherPersonId);
  if (!peer) return null;
  const supabase = await createClient();
  const [low, high] = pairOf(myPersonId, otherPersonId);
  const { data } = await supabase
    .from("direct_messages")
    .select("id, sender_person_id, body, created_at")
    .eq("person_low", low)
    .eq("person_high", high)
    .order("created_at", { ascending: false })
    .limit(300);
  return {
    peer,
    messages: (data ?? [])
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        authorName: m.sender_person_id === myPersonId ? "You" : peer.fullName,
        body: m.body,
        createdAt: m.created_at,
        mine: m.sender_person_id === myPersonId,
        householdName: null,
        ourHousehold: m.sender_person_id === myPersonId,
      })),
  };
}

/** Unread per conversation key ('family', 'dm:<person>'). */
export async function getRoomUnread(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_chat_unread");
  return new Map((data ?? []).map((r) => [r.thread, Number(r.unread) || 0]));
}
