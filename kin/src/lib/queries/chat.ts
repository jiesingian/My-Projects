import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";


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
  /** The message this one answers, flattened to what a quote needs. Null when
   * it answers nothing, or when the message it answered has fallen outside
   * the window this query loads -- a quote of something nobody can scroll to
   * is worse than no quote. */
  replyTo: { id: string; memberId: string | null; excerpt: string; deleted: boolean } | null;
  /** Who has read this, excluding its author. Derived from each member's
   * last_read_at rather than stored per message: one row per member per
   * message would record the same fact thousands of times over. */
  seenBy: string[];
  attachments: ChatAttachment[];
};

export type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Signed, and good for half an hour -- the same window every other private
   * file in the app gets. Null only if signing failed, which the thread shows
   * as a file that is there but cannot be opened, rather than as nothing. */
  url: string | null;
};

export type ChatPin = { messageId: string; pinnedBy: string; pinnedAt: string } | null;

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
    .select("id, member_id, body, mentions, created_at, edited_at, deleted_at, reply_to")
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

  // Read markers, one per member. "Seen by" is this compared against a
  // message's own created_at, so the whole household's receipts cost one
  // query for the entire thread rather than one per message.
  const { data: reads } = await supabase
    .from("family_message_reads")
    .select("member_id, last_read_at")
    .eq("family_id", familyId);

  const quoted = new Map(rows.map((r) => [r.id, r]));

  // Files, for the messages that still stand. A withdrawn message's files are
  // removed when it is withdrawn; this is the belt to that brace, so a failed
  // storage delete never leaves a photo showing under "Message withdrawn".
  const live = rows.filter((r) => !r.deleted_at).map((r) => r.id);
  const { data: files } = live.length
    ? await supabase
        .from("family_message_attachments")
        .select("id, message_id, storage_path, file_name, mime_type, size_bytes, position")
        .in("message_id", live)
        .order("position")
    : { data: [] };
  const signed = await getSignedUrls("documents", (files ?? []).map((f) => f.storage_path));
  const filesByMessage = new Map<string, ChatAttachment[]>();
  for (const f of files ?? []) {
    filesByMessage.set(f.message_id, [
      ...(filesByMessage.get(f.message_id) ?? []),
      { id: f.id, fileName: f.file_name, mimeType: f.mime_type, sizeBytes: f.size_bytes, url: signed[f.storage_path] ?? null },
    ]);
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
    replyTo: (() => {
      const parent = r.reply_to ? quoted.get(r.reply_to) : undefined;
      if (!parent) return null;
      return {
        id: parent.id,
        memberId: parent.member_id,
        // One line is what a quote is for -- enough to recognise which thing
        // is being answered, not enough to read twice.
        excerpt: parent.deleted_at ? "" : parent.body.replace(/\s+/g, " ").slice(0, 120),
        deleted: !!parent.deleted_at,
      };
    })(),
    attachments: filesByMessage.get(r.id) ?? [],
    seenBy: (reads ?? [])
      .filter((v) => v.member_id !== r.member_id && v.last_read_at >= r.created_at)
      .map((v) => v.member_id),
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

/** The one message a household has pinned, if any. */
export async function getChatPin(familyId: string): Promise<ChatPin> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("family_chat_pins")
    .select("message_id, pinned_by, pinned_at")
    .eq("family_id", familyId)
    .maybeSingle();
  return data ? { messageId: data.message_id, pinnedBy: data.pinned_by, pinnedAt: data.pinned_at } : null;
}
