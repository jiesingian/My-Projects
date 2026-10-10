import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import type { ForwardTarget } from "@/lib/chat-forward";

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
  /** Photos sent with it (20260929120000), signed in the reader's own
   * session -- the storage policy lets them open exactly these. url is null
   * only if signing failed. */
  photos: { id: string; url: string | null; fileName: string; mimeType: string; transcript: string | null }[];
  /** The message this one answers, as one line -- null when it answers
   * nothing, or when that message is gone or outside the window. */
  replyTo: { id: string; authorName: string; excerpt: string } | null;
  /** Reactions, grouped by emoji (20260929161000). */
  reactions: { emoji: string; names: string[]; mine: boolean }[];
  /** Forwarded from another conversation (20260930031500): the original
   * writer's first name. */
  forwardedFrom: string | null;
  /** Edited after sending (20260930150100): when, or null. */
  editedAt: string | null;
  /** Unsent by its writer: shown as "Message removed", words and photos
   * gone, its place in the thread kept. */
  removed: boolean;
  /** Pinned to the top of the conversation (20260930160000): when, and the
   * first name of who pinned it. */
  pinnedAt: string | null;
  pinnedBy: string | null;
  /** Who wrote it, as a person (for @-mentioning them back), and whether it
   * names the reader (20261006100100). */
  authorPersonId: string | null;
  mentionsMe: boolean;
  /** A group poll asked in this message (20261006100300). */
  poll?: RoomPoll | null;
};

export type RoomPoll = {
  id: string;
  question: string;
  allowMultiple: boolean;
  options: { id: string; label: string; voters: string[]; mine: boolean }[];
};

/** The polls asked in a window of group messages, with who voted for what. */
async function pollsFor(messageIds: string[], myPersonId: string): Promise<Map<string, RoomPoll>> {
  const out = new Map<string, RoomPoll>();
  if (messageIds.length === 0) return out;
  const supabase = await createClient();
  const { data: polls } = await supabase.from("group_polls").select("id, message_id, question, allow_multiple").in("message_id", messageIds);
  if (!polls?.length) return out;
  const ids = polls.map((p) => p.id);
  const [{ data: options }, { data: votes }] = await Promise.all([
    supabase.from("group_poll_options").select("id, poll_id, label, position").in("poll_id", ids).order("position"),
    supabase.from("group_poll_votes").select("poll_id, option_id, person_id, voter_name").in("poll_id", ids).order("created_at"),
  ]);
  for (const p of polls) {
    out.set(p.message_id, {
      id: p.id,
      question: p.question,
      allowMultiple: p.allow_multiple,
      options: (options ?? [])
        .filter((o) => o.poll_id === p.id)
        .map((o) => {
          const v = (votes ?? []).filter((x) => x.option_id === o.id);
          return { id: o.id, label: o.label, voters: v.map((x) => (x.person_id === myPersonId ? "You" : x.voter_name || "Someone")), mine: v.some((x) => x.person_id === myPersonId) };
        }),
    });
  }
  return out;
}

type MessageColumn = "family_message_id" | "direct_message_id" | "group_message_id" | "link_message_id" | "saved_message_id";

type ReactionRow = { family_message_id: string | null; direct_message_id: string | null; group_message_id: string | null; link_message_id: string | null; emoji: string; author_name: string; person_id: string };

/** Reactions on a window of room messages, one query for all of them. Row-
 * level security leaves out reactions from households the reader is not
 * linked with. */
export async function reactionsFor(column: Exclude<MessageColumn, "saved_message_id">, ids: string[], myPersonId: string): Promise<Map<string, RoomMessage["reactions"]>> {
  const out = new Map<string, RoomMessage["reactions"]>();
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_room_reactions")
    .select("family_message_id, direct_message_id, group_message_id, link_message_id, emoji, author_name, person_id")
    .in(column, ids)
    .order("created_at");
  const grouped = new Map<string, Map<string, ReactionRow[]>>();
  for (const r of (data ?? []) as ReactionRow[]) {
    const key = r[column] as string;
    const byEmoji = grouped.get(key) ?? new Map<string, ReactionRow[]>();
    byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r]);
    grouped.set(key, byEmoji);
  }
  for (const [key, byEmoji] of grouped) {
    out.set(
      key,
      [...byEmoji.entries()].map(([emoji, rows]) => ({
        emoji,
        names: rows.map((r) => (r.person_id === myPersonId ? "You" : r.author_name.split(" ")[0] || "Someone")),
        mine: rows.some((r) => r.person_id === myPersonId),
      })),
    );
  }
  return out;
}

/** One line of the message being answered -- enough to recognise it. */
function quoteOf(
  parent: { id: string; body: string; deleted_at?: string | null } | undefined,
  authorName: (id: string) => string,
  hasMedia: boolean,
): RoomMessage["replyTo"] {
  if (!parent) return null;
  if (parent.deleted_at) return { id: parent.id, authorName: authorName(parent.id), excerpt: "Message removed" };
  const excerpt = parent.body.replace(/\s+/g, " ").trim().slice(0, 120) || (hasMedia ? "Photo or voice note" : "");
  return { id: parent.id, authorName: authorName(parent.id), excerpt };
}

/** The photos on a set of room messages, keyed by message id, in the order
 * they were picked. One query and one signing call for the whole window. */
async function photosFor(column: Exclude<MessageColumn, "link_message_id">,ids: string[]): Promise<Map<string, RoomMessage["photos"]>> {
  const out = new Map<string, RoomMessage["photos"]>();
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_room_attachments")
    .select("id, family_message_id, direct_message_id, group_message_id, saved_message_id, storage_path, file_name, mime_type, transcript, position")
    .in(column, ids)
    .order("position");
  const signed = await getSignedUrls("documents", (data ?? []).map((a) => a.storage_path));
  for (const a of data ?? []) {
    const key = a[column] as string;
    out.set(key, [...(out.get(key) ?? []), { id: a.id, url: signed[a.storage_path] ?? null, fileName: a.file_name, mimeType: a.mime_type, transcript: a.transcript }]);
  }
  return out;
}

export type DirectPeer = { personId: string; fullName: string; avatarUrl: string | null; householdName: string | null; connected: boolean };

/** The pair, in the order the table and the realtime topic store it. */
export function pairOf(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getFamilyRoom(me: { id: string; family_id: string; person_id: string }): Promise<{ messages: RoomMessage[]; households: string[] }> {
  const supabase = await createClient();
  const [{ data }, { data: links }] = await Promise.all([
    supabase.from("family_tree_messages").select("id, family_id, member_id, person_id, mentions, author_name, body, created_at, reply_to, forwarded_from, edited_at, deleted_at, pinned_at, pinned_by").order("created_at", { ascending: false }).limit(200),
    supabase.from("family_links").select("requester_family_id, addressee_family_id").eq("status", "accepted"),
  ]);
  const rows = (data ?? []).slice().reverse();
  const linkedIds = (links ?? []).map((l) => (l.requester_family_id === me.family_id ? l.addressee_family_id : l.requester_family_id));
  const ids = [...new Set([...rows.map((r) => r.family_id), ...linkedIds, me.family_id])];
  const { data: names } = await supabase.from("families").select("id, name").in("id", ids);
  const nameOf = new Map((names ?? []).map((f) => [f.id, f.name]));
  const [photos, reactions] = await Promise.all([
    photosFor("family_message_id", rows.map((r) => r.id)),
    reactionsFor("family_message_id", rows.map((r) => r.id), me.person_id),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const authorOf = (id: string) => {
    const r = byId.get(id);
    return !r ? "Someone" : r.member_id === me.id ? "You" : (r.author_name || "Someone").split(" ")[0];
  };
  return {
    households: linkedIds.map((id) => nameOf.get(id) ?? "A linked household"),
    messages: rows.map((r) => ({
      id: r.id,
      authorName: r.author_name || "Someone",
      body: r.deleted_at ? "" : r.body,
      createdAt: r.created_at,
      mine: r.member_id === me.id,
      householdName: nameOf.get(r.family_id) ?? "A linked household",
      ourHousehold: r.family_id === me.family_id,
      photos: r.deleted_at ? [] : (photos.get(r.id) ?? []),
      replyTo: r.reply_to ? quoteOf(byId.get(r.reply_to), authorOf, (photos.get(r.reply_to) ?? []).length > 0) : null,
      reactions: reactions.get(r.id) ?? [],
      forwardedFrom: r.deleted_at ? null : r.forwarded_from,
      editedAt: r.edited_at,
      removed: !!r.deleted_at,
      pinnedAt: r.deleted_at ? null : r.pinned_at,
      pinnedBy: r.pinned_by,
      authorPersonId: r.person_id,
      mentionsMe: !r.deleted_at && (r.mentions ?? []).includes(me.person_id),
    })),
  };
}

/** Once per request: my_direct_threads is among the costliest reads in the
 * app (about 110 ms on dev), and one page -- or the offline snapshot, which
 * opens several conversations -- used to ask for it up to four times. */
export const getDirectPeers = cache(async (): Promise<DirectPeer[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_direct_threads");
  return (data ?? []).map((r) => ({ personId: r.person_id, fullName: r.full_name, avatarUrl: r.avatar_url, householdName: r.household_name, connected: r.connected }));
});

/** A conversation with one person, and who they are -- null when this person
 * has never been connected with them and has no history with them, so the
 * page shows "not found" rather than an empty thread nobody can write in. */
export async function getDirectThread(
  myPersonId: string,
  otherPersonId: string,
): Promise<{ peer: DirectPeer; messages: RoomMessage[]; seenAt: string | null } | null> {
  const peer = (await getDirectPeers()).find((p) => p.personId === otherPersonId);
  if (!peer) return null;
  const supabase = await createClient();
  const [low, high] = pairOf(myPersonId, otherPersonId);
  const { data } = await supabase
    .from("direct_messages")
    .select("id, sender_person_id, mentions, body, created_at, reply_to, forwarded_from, edited_at, deleted_at, pinned_at, pinned_by")
    .eq("person_low", low)
    .eq("person_high", high)
    .order("created_at", { ascending: false })
    .limit(300);
  const ids = (data ?? []).map((m) => m.id);
  const [photos, reactions, { data: seenAt }] = await Promise.all([
    photosFor("direct_message_id", ids),
    reactionsFor("direct_message_id", ids, myPersonId),
    // When they last read this conversation, for "Seen" under your last one.
    supabase.rpc("dm_seen_at", { p_other: otherPersonId }),
  ]);
  const byId = new Map((data ?? []).map((m) => [m.id, m]));
  const authorOf = (id: string) => (byId.get(id)?.sender_person_id === myPersonId ? "You" : peer.fullName.split(" ")[0]);
  return {
    peer,
    seenAt: seenAt ?? null,
    messages: (data ?? [])
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        authorName: m.sender_person_id === myPersonId ? "You" : peer.fullName,
        body: m.deleted_at ? "" : m.body,
        createdAt: m.created_at,
        mine: m.sender_person_id === myPersonId,
        householdName: null,
        ourHousehold: m.sender_person_id === myPersonId,
        photos: m.deleted_at ? [] : (photos.get(m.id) ?? []),
        replyTo: m.reply_to ? quoteOf(byId.get(m.reply_to), authorOf, (photos.get(m.reply_to) ?? []).length > 0) : null,
        reactions: reactions.get(m.id) ?? [],
        forwardedFrom: m.deleted_at ? null : m.forwarded_from,
        editedAt: m.edited_at,
        removed: !!m.deleted_at,
        pinnedAt: m.deleted_at ? null : m.pinned_at,
        pinnedBy: m.pinned_by,
        authorPersonId: m.sender_person_id,
        mentionsMe: !m.deleted_at && (m.mentions ?? []).includes(myPersonId),
      })),
  };
}

/** Unread per conversation key ('family', 'dm:<person>'). */
export async function getRoomUnread(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_chat_unread");
  return new Map((data ?? []).map((r) => [r.thread, Number(r.unread) || 0]));
}

/** Conversation key -> this person's mute and pin choices. */
export type ThreadPref = { muted: boolean; pinned: boolean; mutedUntil: string | null };

export async function getThreadPrefs(): Promise<Map<string, ThreadPref>> {
  const supabase = await createClient();
  const { data } = await supabase.from("chat_thread_prefs").select("thread, muted, muted_until, pinned");
  const now = Date.now();
  return new Map(
    (data ?? []).map((p) => [
      p.thread,
      {
        // An expired "mute for an hour" reads as not muted, whatever the row says.
        muted: p.muted && (!p.muted_until || new Date(p.muted_until).getTime() > now),
        pinned: p.pinned,
        mutedUntil: p.muted_until,
      },
    ]),
  );
}

export type GroupMember = { personId: string; fullName: string; avatarUrl: string | null; householdName: string | null; admin: boolean };
export type GroupSummary = { id: string; name: string; announceOnly: boolean };

/** A group chat or announcement channel the caller is in (20260929162000):
 * its members, its messages, and whether the caller may post and manage it.
 * Null when they are not in it -- the page shows "not found". */
export async function getGroupRoom(
  myPersonId: string,
  groupId: string,
): Promise<{
  group: GroupSummary;
  members: GroupMember[];
  messages: RoomMessage[];
  isAdmin: boolean;
  canPost: boolean;
  /** Who else has opened it, and when (20261006100000), for "Seen by". */
  seenBy: { firstName: string; lastReadAt: string }[];
} | null> {
  const supabase = await createClient();
  const [{ data: group }, { data: memberRows }, { data }, { data: seen }] = await Promise.all([
    supabase.from("chat_groups").select("id, name, announce_only").eq("id", groupId).maybeSingle(),
    supabase.rpc("group_members_of", { p_group: groupId }),
    supabase
      .from("chat_group_messages")
      .select("id, sender_person_id, mentions, author_name, body, created_at, reply_to, forwarded_from, edited_at, deleted_at, pinned_at, pinned_by")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.rpc("group_seen_by", { p_group: groupId }),
  ]);
  if (!group) return null;
  const members: GroupMember[] = (memberRows ?? []).map((m) => ({
    personId: m.person_id,
    fullName: m.full_name,
    avatarUrl: m.avatar_url,
    householdName: m.household_name,
    admin: m.role === "admin",
  }));
  const isAdmin = members.some((m) => m.personId === myPersonId && m.admin);
  const rows = (data ?? []).slice().reverse();
  const ids = rows.map((r) => r.id);
  const [photos, reactions, polls] = await Promise.all([
    photosFor("group_message_id", ids),
    reactionsFor("group_message_id", ids, myPersonId),
    pollsFor(ids, myPersonId),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const authorOf = (id: string) => {
    const r = byId.get(id);
    return !r ? "Someone" : r.sender_person_id === myPersonId ? "You" : (r.author_name || "Someone").split(" ")[0];
  };
  return {
    group: { id: group.id, name: group.name, announceOnly: group.announce_only },
    members,
    isAdmin,
    canPost: !group.announce_only || isAdmin,
    seenBy: (seen ?? []).map((s) => ({ firstName: s.first_name || "Someone", lastReadAt: s.last_read_at })),
    messages: rows.map((r) => ({
      id: r.id,
      authorName: r.author_name || "Someone",
      body: r.deleted_at ? "" : r.body,
      createdAt: r.created_at,
      mine: r.sender_person_id === myPersonId,
      householdName: null,
      ourHousehold: r.sender_person_id === myPersonId,
      photos: r.deleted_at ? [] : (photos.get(r.id) ?? []),
      replyTo: r.reply_to ? quoteOf(byId.get(r.reply_to), authorOf, (photos.get(r.reply_to) ?? []).length > 0) : null,
      reactions: reactions.get(r.id) ?? [],
      forwardedFrom: r.deleted_at ? null : r.forwarded_from,
      editedAt: r.edited_at,
      removed: !!r.deleted_at,
      pinnedAt: r.deleted_at ? null : r.pinned_at,
      pinnedBy: r.pinned_by,
      authorPersonId: r.sender_person_id,
      mentionsMe: !r.deleted_at && (r.mentions ?? []).includes(myPersonId),
      poll: r.deleted_at ? null : (polls.get(r.id) ?? null),
    })),
  };
}

/** Every group the caller is in, with its newest message, for the chat list. */
export async function getMyGroups(): Promise<(GroupSummary & { last: { authorName: string; body: string; at: string; mine: boolean } | null; senderPersonId: string | null })[]> {
  const supabase = await createClient();
  const { data: groups } = await supabase.from("chat_groups").select("id, name, announce_only, created_at");
  if (!groups?.length) return [];
  const { data: recent } = await supabase
    .from("chat_group_messages")
    .select("group_id, sender_person_id, author_name, body, created_at")
    .in("group_id", groups.map((g) => g.id))
    .order("created_at", { ascending: false })
    .limit(300);
  const last = new Map<string, NonNullable<typeof recent>[number]>();
  for (const m of recent ?? []) if (!last.has(m.group_id)) last.set(m.group_id, m);
  return groups.map((g) => {
    const m = last.get(g.id);
    return {
      id: g.id,
      name: g.name,
      announceOnly: g.announce_only,
      senderPersonId: m?.sender_person_id ?? null,
      last: m ? { authorName: m.author_name, body: m.body, at: m.created_at, mine: false } : { authorName: "", body: "", at: g.created_at, mine: false },
    };
  });
}

/** People the caller could put in a group: connections and family. */
export async function getGroupCandidates(): Promise<{ personId: string; fullName: string; avatarUrl: string | null; householdName: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("group_candidates");
  return (data ?? [])
    .map((r) => ({ personId: r.person_id, fullName: r.full_name, avatarUrl: r.avatar_url, householdName: r.household_name }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Every conversation this person could forward a message into, in the chat
 * list's order of weight: home, the family room, then people and groups.
 * Only ones they can write in -- a connection that has ended and an
 * announcement channel they don't run are left out. */
export async function getForwardTargets(me: { person_id: string; familyName: string }): Promise<ForwardTarget[]> {
  const supabase = await createClient();
  const [peers, groups, { data: roles }] = await Promise.all([
    getDirectPeers(),
    getMyGroups(),
    supabase.from("chat_group_members").select("group_id, role").eq("person_id", me.person_id),
  ]);
  const admin = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.group_id));
  return [
    { key: "saved", kind: "saved", title: "Saved messages", subtitle: "Only you" },
    { key: "household", kind: "household", title: me.familyName, subtitle: "Household" },
    { key: "family", kind: "family", title: "Family", subtitle: "Everyone in the family tree" },
    ...peers
      .filter((p) => p.connected)
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((p): ForwardTarget => ({ key: `dm:${p.personId}`, kind: "dm", title: p.fullName, subtitle: p.householdName ?? "One to one", avatarUrl: p.avatarUrl })),
    ...groups
      .filter((g) => !g.announceOnly || admin.has(g.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g): ForwardTarget => ({ key: `group:${g.id}`, kind: "group", title: g.name, subtitle: g.announceOnly ? "Channel" : "Group" })),
  ];
}

/** Saved messages (20261006100200): this person's notes to self, oldest
 * first, in the rooms' shape so the thread can draw them the same way. Only
 * they can read them; row-level security says so, not this. */
export async function getSavedMessages(myPersonId: string): Promise<RoomMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("saved_messages").select("id, body, forwarded_from, created_at").order("created_at", { ascending: false }).limit(300);
  const rows = (data ?? []).slice().reverse();
  const photos = await photosFor("saved_message_id", rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    authorName: "You",
    body: r.body,
    createdAt: r.created_at,
    mine: true,
    householdName: null,
    ourHousehold: true,
    photos: photos.get(r.id) ?? [],
    replyTo: null,
    reactions: [],
    forwardedFrom: r.forwarded_from,
    editedAt: null,
    removed: false,
    pinnedAt: null,
    pinnedBy: null,
    authorPersonId: myPersonId,
    mentionsMe: false,
  }));
}
