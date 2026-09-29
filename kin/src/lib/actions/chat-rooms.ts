"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { sendChatPush } from "@/lib/push";
import { pairOf } from "@/lib/queries/chat-rooms";
import { isReaction } from "@/lib/chat";
import type { ActionState } from "@/lib/actions/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Thread = "family" | `dm:${string}` | `link:${string}`;

/** Opening a conversation is reading it. Kept per person, so it follows them
 * to whichever household they are in. */
export async function markThreadReadAction(thread: Thread): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (thread !== "family" && !/^(dm|link):/.test(thread)) return { error: null };
  if (thread !== "family" && !UUID.test(thread.split(":")[1] ?? "")) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_reads")
    .upsert({ person_id: me.person_id, thread, last_read_at: new Date().toISOString() }, { onConflict: "person_id,thread" });
  return error ? { error: humanDatabaseError(error.message) } : { error: null };
}

/** A photo already uploaded to the sender's own chat folder, straight from
 * the phone (uploadFileDirect(file, "chat")). */
export type RoomPhoto = { storagePath: string; fileName: string; mimeType: string; sizeBytes: number };

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
  to: { family_message_id: string } | { direct_message_id: string },
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
      position,
    })),
  );
  if (!error) return null;
  if ("family_message_id" in to) await supabase.from("family_tree_messages").delete().eq("id", to.family_message_id);
  else await supabase.from("direct_messages").delete().eq("id", to.direct_message_id);
  await supabase.storage.from("documents").remove(photos.map((p) => p.storagePath));
  return `The photos didn't attach, so nothing was sent. ${humanDatabaseError(error.message)}`;
}

/** Deleting a message takes its photos with it -- the files, not only the
 * rows, which the database removes on its own. The files are in the
 * sender's own folder, so the sender may remove them. */
async function removePhotosOf(column: "family_message_id" | "direct_message_id", id: string): Promise<void> {
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

/** A message to everyone in the family tree: this household and each one
 * linked with it. Who wrote it and from where is set by the database. */
export async function sendFamilyMessageAction(body: string, photos: RoomPhoto[] = [], replyTo: string | null = null): Promise<ActionState> {
  const me = await requireCurrentMember();
  const text = clamp(body.trim(), 2000);
  const refused = checkOutgoing(me, text, photos);
  if (refused) return { error: refused };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("family_tree_messages")
    .insert({ body: text, reply_to: replyTo && UUID.test(replyTo) ? replyTo : null })
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
    }),
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
    .insert({ person_low, person_high, body: text, reply_to: replyTo && UUID.test(replyTo) ? replyTo : null })
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
    }),
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
export async function toggleRoomReactionAction(kind: "family" | "dm", messageId: string, emoji: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(messageId) || !isReaction(emoji)) return { error: "That reaction isn't available." };
  const column = kind === "family" ? "family_message_id" : "direct_message_id";
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
        .insert(kind === "family" ? { family_message_id: messageId, emoji } : { direct_message_id: messageId, emoji });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/chat", "layout");
  return { error: null };
}

const THREAD = /^(household|family|dm:[0-9a-f-]{36}|link:[0-9a-f-]{36})$/i;

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
