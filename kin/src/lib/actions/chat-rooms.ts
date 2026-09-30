"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { sendChatPush } from "@/lib/push";
import { getDirectPeers, getForwardTargets, pairOf } from "@/lib/queries/chat-rooms";
import { sendMessageAction } from "@/lib/actions/chat";
import { mediaSummary } from "@/lib/chat-media";
import {
  MAX_FORWARD_TARGETS,
  fileFitsTarget,
  forwardLabel,
  forwardedPath,
  isForwardSource,
  parseTargetKey,
  type ForwardSource,
  type ParsedTarget,
  type ForwardTarget,
} from "@/lib/chat-forward";
import { isReaction } from "@/lib/chat";
import type { ActionState } from "@/lib/actions/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Thread = "family" | `dm:${string}` | `link:${string}` | `group:${string}`;

/** Opening a conversation is reading it. Kept per person, so it follows them
 * to whichever household they are in. */
export async function markThreadReadAction(thread: Thread): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (thread !== "family" && !/^(dm|link|group):/.test(thread)) return { error: null };
  if (thread !== "family" && !UUID.test(thread.split(":")[1] ?? "")) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_reads")
    .upsert({ person_id: me.person_id, thread, last_read_at: new Date().toISOString() }, { onConflict: "person_id,thread" });
  return error ? { error: humanDatabaseError(error.message) } : { error: null };
}

/** A photo already uploaded to the sender's own chat folder, straight from
 * the phone (uploadFileDirect(file, "chat")). */
export type RoomPhoto = { storagePath: string; fileName: string; mimeType: string; sizeBytes: number; transcript?: string };

/** At most this many photos on one message, as in the household chat. */
const MAX_PHOTOS = 10;

type Sender = { id: string; family_id: string; person_id: string };

/** The checks both rooms share, before any row is written: something to
 * send, only photos, only from the sender's own chat folder. The table
 * refuses the rest too; this says it in words. */
function checkOutgoing(me: Sender, body: string, photos: RoomPhoto[]): string | null {
  if (!body && photos.length === 0) return "Write something or add a photo first.";
  if (photos.length > MAX_PHOTOS) return `At most ${MAX_PHOTOS} photos at a time.`;
  if (photos.some((p) => !/^(image|video|audio)\//.test(p.mimeType))) return "Only photos, videos and voice notes can be sent here.";
  if (photos.some((p) => !p.storagePath.startsWith(`${me.family_id}/chat/`))) return "One of those photos didn't upload properly. Try again.";
  return null;
}

/** Index the photos against the message just written. If that fails, the
 * message is taken back and the files removed, so the thread never shows
 * "look at this" with nothing to look at. */
async function attachPhotos(
  me: Sender,
  photos: RoomPhoto[],
  to: { family_message_id: string } | { direct_message_id: string } | { group_message_id: string } | { saved_message_id: string },
): Promise<string | null> {
  if (photos.length === 0) return null;
  const supabase = await createClient();
  const { error } = await supabase.from("chat_room_attachments").insert(
    photos.map((p, position) => ({
      ...to,
      family_id: me.family_id,
      storage_path: p.storagePath,
      file_name: p.fileName.slice(0, 255) || "photo",
      mime_type: p.mimeType,
      size_bytes: Math.max(1, Math.round(p.sizeBytes)),
      // Only a voice note carries words (written on the sender's phone).
      transcript: p.mimeType.startsWith("audio/") && p.transcript ? clamp(p.transcript.trim(), 5000) || null : null,
      position,
    })),
  );
  if (!error) return null;
  if ("family_message_id" in to) await supabase.from("family_tree_messages").delete().eq("id", to.family_message_id);
  else if ("direct_message_id" in to) await supabase.from("direct_messages").delete().eq("id", to.direct_message_id);
  else if ("group_message_id" in to) await supabase.from("chat_group_messages").delete().eq("id", to.group_message_id);
  else await supabase.from("saved_messages").delete().eq("id", to.saved_message_id);
  await supabase.storage.from("documents").remove(photos.map((p) => p.storagePath));
  return `The photos didn't attach, so nothing was sent. ${humanDatabaseError(error.message)}`;
}

/** Deleting a message takes its photos with it -- the files, not only the
 * rows, which the database removes on its own. The files are in the
 * sender's own folder, so the sender may remove them. */
async function removePhotosOf(column: "family_message_id" | "direct_message_id" | "group_message_id" | "saved_message_id", id: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("chat_room_attachments").select("storage_path").eq(column, id);
  if (data?.length) await supabase.storage.from("documents").remove(data.map((a) => a.storage_path));
}

/** What the notification says when there are no words: the kind of thing
 * that was sent, the way a phone's messages app does. */
function photoLine(photos: RoomPhoto[]): string {
  if (photos.length === 1) {
    const t = photos[0].mimeType;
    return t.startsWith("audio/") ? "Sent a voice note" : t.startsWith("video/") ? "Sent a video" : "Sent a photo";
  }
  return `Sent ${photos.length} ${photos.every((p) => p.mimeType.startsWith("image/")) ? "photos" : "files"}`;
}

/** The people a message names (20261006100100): real ids, never the sender,
 * at most 20. Naming someone outside the room gives them nothing -- the
 * notification only ever reaches the room's own people. */
function named(me: Sender, people: string[]): string[] {
  return [...new Set((Array.isArray(people) ? people : []).filter((p) => typeof p === "string" && UUID.test(p) && p !== me.person_id))].slice(0, 20);
}

/** A message to everyone in the family tree: this household and each one
 * linked with it. Who wrote it and from where is set by the database. */
export async function sendFamilyMessageAction(
  body: string,
  photos: RoomPhoto[] = [],
  replyTo: string | null = null,
  forwardedFrom: string | null = null,
  mentions: string[] = [],
): Promise<ActionState> {
  const me = await requireCurrentMember();
  const text = clamp(body.trim(), 2000);
  const refused = checkOutgoing(me, text, photos);
  if (refused) return { error: refused };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("family_tree_messages")
    .insert({ body: text, reply_to: replyTo && UUID.test(replyTo) ? replyTo : null, forwarded_from: forwardedFrom?.slice(0, 60) || null, mentions: named(me, mentions) })
    .select("id")
    .single();
  if (error || !data) return { error: error ? humanDatabaseError(error.message) : "That didn't send." };
  const attachError = await attachPhotos(me, photos, { family_message_id: data.id });
  if (attachError) return { error: attachError };
  await markThreadReadAction("family");
  revalidatePath("/chat", "layout");
  // One tag per household tree, so a busy evening is one notification that
  // updates rather than a stack.
  after(() =>
    sendChatPush("family", {
      title: `${me.full_name.split(" ")[0]} · Family`,
      body: text || photoLine(photos),
      url: "/chat/family",
      tag: `family-tree-${me.family_id}`,
    }, { people: named(me, mentions), title: `${me.full_name.split(" ")[0]} mentioned you · Family`, tag: `mention-${data.id}` }),
  );
  return { error: null };
}

export async function deleteFamilyMessageAction(id: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: mine } = await supabase.from("family_tree_messages").select("id").eq("id", id).eq("member_id", me.id).maybeSingle();
  if (!mine) return { error: "That message isn't yours to delete." };
  await removePhotosOf("family_message_id", id);
  const { error } = await supabase.from("family_tree_messages").delete().eq("id", id).eq("member_id", me.id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/chat", "layout");
  return { error: null };
}

/** One to one, to someone you are connected with. The database refuses it
 * otherwise (direct_messages_insert). */
export async function sendDirectMessageAction(
  otherPersonId: string,
  body: string,
  photos: RoomPhoto[] = [],
  replyTo: string | null = null,
  forwardedFrom: string | null = null,
  mentions: string[] = [],
): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(otherPersonId)) return { error: "That conversation doesn't exist." };
  const text = clamp(body.trim(), 2000);
  const refused = checkOutgoing(me, text, photos);
  if (refused) return { error: refused };
  const [person_low, person_high] = pairOf(me.person_id, otherPersonId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("direct_messages")
    .insert({ person_low, person_high, body: text, reply_to: replyTo && UUID.test(replyTo) ? replyTo : null, forwarded_from: forwardedFrom?.slice(0, 60) || null, mentions: named(me, mentions) })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "42501") return { error: "You're no longer connected, so this can't be sent." };
    return { error: error ? humanDatabaseError(error.message) : "That didn't send." };
  }
  const attachError = await attachPhotos(me, photos, { direct_message_id: data.id });
  if (attachError) return { error: attachError };
  await markThreadReadAction(`dm:${otherPersonId}`);
  revalidatePath("/chat", "layout");
  after(() =>
    sendChatPush(`dm:${otherPersonId}`, {
      title: me.full_name.split(" ")[0],
      body: text || photoLine(photos),
      url: `/chat/dm/${me.person_id}`,
      tag: `dm-${person_low}-${person_high}`,
    }, { people: named(me, mentions), title: `${me.full_name.split(" ")[0]} mentioned you`, tag: `mention-${data.id}` }),
  );
  return { error: null };
}

export async function deleteDirectMessageAction(id: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: mine } = await supabase.from("direct_messages").select("id").eq("id", id).eq("sender_person_id", me.person_id).maybeSingle();
  if (!mine) return { error: "That message isn't yours to delete." };
  await removePhotosOf("direct_message_id", id);
  const { error } = await supabase.from("direct_messages").delete().eq("id", id).eq("sender_person_id", me.person_id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/chat", "layout");
  return { error: null };
}

/** Add a reaction, or take it back if it is already yours -- the household
 * chat's six, one of each per person per message. */
export async function toggleRoomReactionAction(kind: "family" | "dm" | "group" | "link", messageId: string, emoji: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(messageId) || !isReaction(emoji)) return { error: "That reaction isn't available." };
  const column = kind === "family" ? "family_message_id" : kind === "dm" ? "direct_message_id" : kind === "link" ? "link_message_id" : "group_message_id";
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("chat_room_reactions")
    .select("id")
    .eq(column, messageId)
    .eq("person_id", me.person_id)
    .eq("emoji", emoji)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("chat_room_reactions").delete().eq("id", existing.id)
    : await supabase
        .from("chat_room_reactions")
        .insert(
          kind === "family"
            ? { family_message_id: messageId, emoji }
            : kind === "dm"
              ? { direct_message_id: messageId, emoji }
              : kind === "link"
                ? { link_message_id: messageId, emoji }
                : { group_message_id: messageId, emoji },
        );
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/chat", "layout");
  // The linked-household thread lives under Journal (20260930100001).
  if (kind === "link") revalidatePath("/journal/links", "layout");
  return { error: null };
}

const THREAD = /^(household|family|dm:[0-9a-f-]{36}|link:[0-9a-f-]{36}|group:[0-9a-f-]{36})$/i;

/** Mute a conversation (for a while, or until unmuted), unmute it, pin it
 * to the top of the chat list or unpin it. Only ever this person's own
 * choice: the row is theirs and nobody else can read it. */
export async function setThreadPrefAction(
  thread: string,
  change: { mute?: "1h" | "8h" | "1w" | "always" | "off"; pinned?: boolean },
): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!THREAD.test(thread)) return { error: "That conversation doesn't exist." };
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("chat_thread_prefs")
    .select("muted, muted_until, pinned")
    .eq("person_id", me.person_id)
    .eq("thread", thread)
    .maybeSingle();
  const hours = { "1h": 1, "8h": 8, "1w": 24 * 7 } as const;
  const next = {
    person_id: me.person_id,
    thread,
    muted: change.mute === undefined ? (current?.muted ?? false) : change.mute !== "off",
    muted_until:
      change.mute === undefined
        ? (current?.muted_until ?? null)
        : change.mute === "off" || change.mute === "always"
          ? null
          : new Date(Date.now() + hours[change.mute] * 3600_000).toISOString(),
    pinned: change.pinned ?? current?.pinned ?? false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("chat_thread_prefs").upsert(next, { onConflict: "person_id,thread" });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/chat", "layout");
  return { error: null };
}

// ------------------------------------------------------------ group chats

/** Group management goes through security-definer functions
 * (20260929162000) that re-check the caller; these say their refusals in
 * words. */
function groupError(message: string): string {
  if (message.includes("only add")) return "You can only add your connections and people in your family.";
  if (message.includes("Only an admin")) return "Only an admin of this group can do that.";
  if (message.includes("Give the group a name")) return "Give the group a name.";
  if (message.includes("at least one admin")) return "A group needs at least one admin.";
  if (message.includes("not in that group")) return "You're not in that group.";
  return "That didn't work. Try again in a moment.";
}

const uuids = (list: string[]) => [...new Set(list)].filter((id) => UUID.test(id)).slice(0, 200);

export async function createGroupAction(name: string, announceOnly: boolean, people: string[]): Promise<ActionState & { id?: string }> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_chat_group", { p_name: clamp(name.trim(), 60), p_announce_only: announceOnly, p_people: uuids(people) });
  if (error || !data) return { error: groupError(error?.message ?? "") };
  revalidatePath("/chat", "layout");
  return { error: null, id: data };
}

export async function addGroupMembersAction(groupId: string, people: string[]): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(groupId)) return { error: "That group doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_chat_group_members", { p_group: groupId, p_people: uuids(people) });
  if (error) return { error: groupError(error.message) };
  revalidatePath("/chat", "layout");
  return { error: null };
}

/** Remove someone (an admin), or leave (yourself). */
export async function removeGroupMemberAction(groupId: string, personId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(groupId) || !UUID.test(personId)) return { error: "That group doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_chat_group_member", { p_group: groupId, p_person: personId });
  if (error) return { error: groupError(error.message) };
  revalidatePath("/chat", "layout");
  return { error: null };
}

export async function updateGroupAction(groupId: string, name: string, announceOnly: boolean): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(groupId)) return { error: "That group doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_chat_group", { p_group: groupId, p_name: clamp(name.trim(), 60), p_announce_only: announceOnly });
  if (error) return { error: groupError(error.message) };
  revalidatePath("/chat", "layout");
  return { error: null };
}

export async function setGroupAdminAction(groupId: string, personId: string, admin: boolean): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(groupId) || !UUID.test(personId)) return { error: "That group doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_chat_group_admin", { p_group: groupId, p_person: personId, p_admin: admin });
  if (error) return { error: groupError(error.message) };
  revalidatePath("/chat", "layout");
  return { error: null };
}

export async function sendGroupMessageAction(
  groupId: string,
  body: string,
  photos: RoomPhoto[] = [],
  replyTo: string | null = null,
  forwardedFrom: string | null = null,
  mentions: string[] = [],
): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(groupId)) return { error: "That group doesn't exist." };
  const text = clamp(body.trim(), 2000);
  const refused = checkOutgoing(me, text, photos);
  if (refused) return { error: refused };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_group_messages")
    .insert({ group_id: groupId, body: text, reply_to: replyTo && UUID.test(replyTo) ? replyTo : null, forwarded_from: forwardedFrom?.slice(0, 60) || null, mentions: named(me, mentions) })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "42501") return { error: "Only this group's admins can post here." };
    return { error: error ? humanDatabaseError(error.message) : "That didn't send." };
  }
  const attachError = await attachPhotos(me, photos, { group_message_id: data.id });
  if (attachError) return { error: attachError };
  await markThreadReadAction(`group:${groupId}`);
  revalidatePath("/chat", "layout");
  const { data: group } = await supabase.from("chat_groups").select("name").eq("id", groupId).maybeSingle();
  after(() =>
    sendChatPush(`group:${groupId}`, {
      title: `${me.full_name.split(" ")[0]} · ${group?.name ?? "Group"}`,
      body: text || photoLine(photos),
      url: `/chat/groups/${groupId}`,
      tag: `group-${groupId}`,
    }, { people: named(me, mentions), title: `${me.full_name.split(" ")[0]} mentioned you · ${group?.name ?? "Group"}`, tag: `mention-${data.id}` }),
  );
  return { error: null };
}

/** Your own message, or -- as an admin -- anything in your group. */
export async function deleteGroupMessageAction(id: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That message doesn't exist." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("chat_group_messages").select("id").eq("id", id).maybeSingle();
  if (!row) return { error: "That message isn't there any more." };
  await removePhotosOf("group_message_id", id);
  const { data, error } = await supabase.from("chat_group_messages").delete().eq("id", id).select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "That message isn't yours to delete." };
  revalidatePath("/chat", "layout");
  return { error: null };
}

// ---------------------------------------------------------------- forward

/** Where a message can be forwarded to, for the picker. */
export async function listForwardTargetsAction(): Promise<ForwardTarget[]> {
  const me = await requireCurrentMember();
  return getForwardTargets({ person_id: me.person_id, familyName: me.families.name });
}

type ForwardFile = { storagePath: string; fileName: string; mimeType: string; sizeBytes: number; transcript: string | null };
type Original = { body: string; from: string | null; files: ForwardFile[] };

/** The message being forwarded, read under the forwarder's own session -- so
 * only something they can already scroll to can be passed on. */
async function readOriginal(me: Sender & { full_name: string }, source: ForwardSource): Promise<Original | { error: string }> {
  const supabase = await createClient();
  const gone = { error: "That message isn't there any more." };
  const roomFiles = async (column: "family_message_id" | "direct_message_id" | "group_message_id") => {
    const { data } = await supabase
      .from("chat_room_attachments")
      .select("storage_path, file_name, mime_type, size_bytes, transcript")
      .eq(column, source.id)
      .order("position");
    return (data ?? []).map((a) => ({ storagePath: a.storage_path, fileName: a.file_name, mimeType: a.mime_type, sizeBytes: a.size_bytes, transcript: a.transcript }));
  };

  if (source.kind === "household") {
    const { data: m } = await supabase
      .from("family_messages")
      .select("id, member_id, body, deleted_at, forwarded_from")
      .eq("id", source.id)
      .eq("family_id", me.family_id)
      .maybeSingle();
    if (!m || m.deleted_at) return gone;
    const [{ data: poll }, { data: author }, { data: files }] = await Promise.all([
      supabase.from("family_polls").select("id").eq("message_id", m.id).maybeSingle(),
      m.member_id ? supabase.from("members").select("full_name").eq("id", m.member_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase
        .from("family_message_attachments")
        .select("storage_path, file_name, mime_type, size_bytes, transcript")
        .eq("message_id", m.id)
        .order("position"),
    ]);
    // A poll's votes belong to the room it was asked in.
    if (poll) return { error: "A poll can't be forwarded. Start a new one where you'd like to ask." };
    return {
      body: m.body,
      from: forwardLabel(author?.full_name, m.forwarded_from),
      files: (files ?? []).map((a) => ({ storagePath: a.storage_path, fileName: a.file_name, mimeType: a.mime_type, sizeBytes: a.size_bytes, transcript: a.transcript })),
    };
  }
  if (source.kind === "family") {
    const { data: m } = await supabase.from("family_tree_messages").select("author_name, body, forwarded_from").eq("id", source.id).maybeSingle();
    if (!m) return gone;
    return { body: m.body, from: forwardLabel(m.author_name, m.forwarded_from), files: await roomFiles("family_message_id") };
  }
  if (source.kind === "dm") {
    const { data: m } = await supabase.from("direct_messages").select("sender_person_id, body, forwarded_from").eq("id", source.id).maybeSingle();
    if (!m) return gone;
    const name =
      m.sender_person_id === me.person_id ? me.full_name : ((await getDirectPeers()).find((p) => p.personId === m.sender_person_id)?.fullName ?? null);
    return { body: m.body, from: forwardLabel(name, m.forwarded_from), files: await roomFiles("direct_message_id") };
  }
  if (source.kind === "saved") {
    const { data: s } = await supabase.from("saved_messages").select("body, forwarded_from").eq("id", source.id).maybeSingle();
    if (!s) return gone;
    const { data: files } = await supabase
      .from("chat_room_attachments")
      .select("storage_path, file_name, mime_type, size_bytes, transcript")
      .eq("saved_message_id", source.id)
      .order("position");
    return {
      body: s.body,
      from: forwardLabel(me.full_name, s.forwarded_from),
      files: (files ?? []).map((a) => ({ storagePath: a.storage_path, fileName: a.file_name, mimeType: a.mime_type, sizeBytes: a.size_bytes, transcript: a.transcript })),
    };
  }
  const { data: m } = await supabase.from("chat_group_messages").select("author_name, body, forwarded_from").eq("id", source.id).maybeSingle();
  if (!m) return gone;
  return { body: m.body, from: forwardLabel(m.author_name, m.forwarded_from), files: await roomFiles("group_message_id") };
}

/** Forward a message into up to five conversations. Each copy is an ordinary
 * new message from the forwarder, sent through the same action as anything
 * they type -- the same checks, the same notification, the same mute -- and
 * labelled with whose words it first was. Files are copied into the
 * forwarder's own chat folder first, so a forward never depends on the
 * original staying put. */
export async function forwardMessageAction(source: ForwardSource, targetKeys: string[]): Promise<ActionState & { sent?: number; skippedFiles?: number }> {
  const me = await requireCurrentMember();
  if (!isForwardSource(source)) return { error: "That message can't be forwarded." };
  const targets = [...new Set(Array.isArray(targetKeys) ? targetKeys : [])]
    .map(parseTargetKey)
    .filter((t): t is ParsedTarget => t !== null)
    .slice(0, MAX_FORWARD_TARGETS);
  if (targets.length === 0) return { error: "Pick where to send it." };

  const original = await readOriginal(me, source);
  if ("error" in original) return { error: original.error };

  const supabase = await createClient();
  const failures: string[] = [];
  let sent = 0;
  let skippedFiles = 0;
  for (const target of targets) {
    const files = original.files.filter((f) => fileFitsTarget(target.kind, f.mimeType));
    skippedFiles += original.files.length - files.length;
    // A sticker or GIF is drawn only in the household chat; elsewhere it
    // travels as the words that describe it.
    const body = target.kind === "household" ? original.body : (mediaSummary(original.body) ?? original.body);
    if (!body.trim() && files.length === 0) {
      failures.push("Files other than photos, videos and voice notes can only go to the household chat.");
      continue;
    }

    const copies: ForwardFile[] = [];
    for (const f of files) {
      const to = forwardedPath(me.family_id, f.storagePath, Date.now(), crypto.randomUUID());
      const { error } = await supabase.storage.from("documents").copy(f.storagePath, to);
      if (error) break;
      copies.push({ ...f, storagePath: to });
    }
    if (copies.length < files.length) {
      if (copies.length) await supabase.storage.from("documents").remove(copies.map((c) => c.storagePath));
      failures.push("A photo couldn’t be copied.");
      continue;
    }

    const photos = copies.map((c) => ({ ...c, transcript: c.transcript ?? undefined }));
    const r =
      target.kind === "household"
        ? await sendMessageAction({ body, attachments: photos, forwardedFrom: original.from })
        : target.kind === "family"
          ? await sendFamilyMessageAction(body, photos, null, original.from)
          : target.kind === "dm"
            ? await sendDirectMessageAction(target.id, body, photos, null, original.from)
            : target.kind === "saved"
              ? await sendSavedMessageAction(body, photos, original.from)
              : await sendGroupMessageAction(target.id, body, photos, null, original.from);
    if (r.error) {
      // The send actions tidy up after a failed attachment; a refused
      // message leaves the copies behind, so remove them here.
      if (copies.length) await supabase.storage.from("documents").remove(copies.map((c) => c.storagePath));
      failures.push(r.error);
    } else sent++;
  }

  revalidatePath("/chat", "layout");
  if (sent === 0) return { error: failures[0] ?? "That didn't send." };
  if (failures.length) return { error: `Sent to ${sent} of ${targets.length}. ${failures[0]}`, sent, skippedFiles };
  return { error: null, sent, skippedFiles };
}

// ---------------------------------------------------------------- edit and unsend

type RoomKind = "family" | "dm" | "group";
const ROOM_TABLE = { family: "family_tree_messages", dm: "direct_messages", group: "chat_group_messages" } as const;
const ROOM_COLUMN = { family: "family_message_id", dm: "direct_message_id", group: "group_message_id" } as const;

/** Change the words of your own message (20260930150100). The database
 * decides whose it is and stamps "edited"; this only says it in words. */
export async function editRoomMessageAction(kind: RoomKind, id: string, body: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!(kind in ROOM_TABLE) || !UUID.test(id)) return { error: "That message doesn't exist." };
  const text = clamp(body.trim(), 2000);
  if (!text) return { error: "An edit needs some words. Unsend it instead." };
  const supabase = await createClient();
  const { data, error } = await supabase.from(ROOM_TABLE[kind]).update({ body: text }).eq("id", id).select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "Only the person who sent a message can edit it." };
  revalidatePath("/chat", "layout");
  return { error: null };
}

/** Take back your own message: everyone sees "Message removed" where it was,
 * and its photos go with it -- the files as well as the rows. */
export async function unsendRoomMessageAction(kind: RoomKind, id: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!(kind in ROOM_TABLE) || !UUID.test(id)) return { error: "That message doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(ROOM_TABLE[kind])
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "Only the person who sent a message can unsend it." };
  await removePhotosOf(ROOM_COLUMN[kind], id);
  await supabase.from("chat_room_attachments").delete().eq(ROOM_COLUMN[kind], id);
  revalidatePath("/chat", "layout");
  return { error: null };
}

/** Pin or unpin a message in the family room, one to one or a group
 * (20260930160000). Who may is the database's answer, not this one's. */
export async function pinRoomMessageAction(kind: RoomKind, id: string, pinned: boolean): Promise<ActionState> {
  await requireCurrentMember();
  if (!(kind in ROOM_TABLE) || !UUID.test(id)) return { error: "That message doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pin_chat_message", { p_kind: kind, p_id: id, p_pinned: pinned });
  if (error) return { error: error.code === "42501" ? "Only this channel's admins can pin here." : humanDatabaseError(error.message) };
  revalidatePath("/chat", "layout");
  return { error: null };
}

// ---------------------------------------------------------------- saved messages

/** A note to self (20261006100200): words and photos only you can see. */
export async function sendSavedMessageAction(body: string, photos: RoomPhoto[] = [], forwardedFrom: string | null = null): Promise<ActionState> {
  const me = await requireCurrentMember();
  const text = clamp(body.trim(), 4000);
  const refused = checkOutgoing(me, text, photos);
  if (refused) return { error: refused };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_messages")
    .insert({ body: text, forwarded_from: forwardedFrom?.slice(0, 60) || null })
    .select("id")
    .single();
  if (error || !data) return { error: error ? humanDatabaseError(error.message) : "That didn't save." };
  const attachError = await attachPhotos(me, photos, { saved_message_id: data.id });
  if (attachError) return { error: attachError };
  revalidatePath("/chat", "layout");
  return { error: null };
}

export async function deleteSavedMessageAction(id: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That note doesn't exist." };
  await removePhotosOf("saved_message_id", id);
  const supabase = await createClient();
  const { error } = await supabase.from("saved_messages").delete().eq("id", id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/chat", "layout");
  return { error: null };
}
