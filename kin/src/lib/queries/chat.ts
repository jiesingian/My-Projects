import { createClient } from "@/lib/supabase/server";


export type ChatMember = { id: string; name: string; first: string; initials: string; photoUrl: string | null };

export type ChatMessage = {
  id: string;
  memberId: string | null;
  body: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  reactions: { emoji: string; memberIds: string[] }[];
};

/** How many messages this member has yet to read, and whether any of them
 * named them. The badge on the tab is this. */
export async function getChatUnread(familyId: string, memberId: string): Promise<{ count: number; mentioned: boolean }> {
  const supabase = await createClient();

  const { data: read } = await supabase.from("family_message_reads").select("last_read_at").eq("member_id", memberId).maybeSingle();
  const since = read?.last_read_at ?? "1970-01-01T00:00:00Z";

  const { data } = await supabase
    .from("family_messages")
    .select("member_id, mentions")
    .eq("family_id", familyId)
    .is("deleted_at", null)
    .gt("created_at", since)
    .limit(200);

  // Your own messages are not news to you.
  const unread = (data ?? []).filter((m) => m.member_id !== memberId);
  return { count: unread.length, mentioned: unread.some((m) => (m.mentions ?? []).includes(memberId)) };
}

/** The thread, oldest last — the newest at the bottom, where a conversation
 * is read from. `limit` is a window, not the whole history. */
export async function getChatThread(familyId: string, limit = 200): Promise<ChatMessage[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("family_messages")
    .select("id, member_id, body, mentions, created_at, edited_at, deleted_at")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []).slice().reverse();
  if (rows.length === 0) return [];

  const { data: reactions } = await supabase
    .from("family_message_reactions")
    .select("message_id, member_id, emoji")
    .in(
      "message_id",
      rows.map((r) => r.id),
    );

  const byMessage = new Map<string, Map<string, string[]>>();
  for (const r of reactions ?? []) {
    const forMessage = byMessage.get(r.message_id) ?? new Map<string, string[]>();
    forMessage.set(r.emoji, [...(forMessage.get(r.emoji) ?? []), r.member_id]);
    byMessage.set(r.message_id, forMessage);
  }

  return rows.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    // A withdrawn message leaves its place in the conversation, so replies
    // above and below still make sense.
    body: r.deleted_at ? "" : r.body,
    mentions: r.deleted_at ? [] : (r.mentions ?? []),
    createdAt: r.created_at,
    editedAt: r.edited_at,
    deleted: !!r.deleted_at,
    reactions: Array.from(byMessage.get(r.id)?.entries() ?? []).map(([emoji, memberIds]) => ({ emoji, memberIds })),
  }));
}

/** Everyone who can be talked to or tagged. */
export async function getChatMembers(familyId: string): Promise<ChatMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("id, full_name, avatar_url, status")
    .eq("family_id", familyId)
    .neq("status", "removed")
    .order("created_at");

  return (data ?? []).map((m) => {
    const parts = m.full_name.trim().split(/\s+/);
    return {
      id: m.id,
      name: m.full_name,
      first: parts[0],
      initials: (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : ""),
      photoUrl: m.avatar_url,
    };
  });
}
