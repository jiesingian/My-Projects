"use server";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";

/** Comments and reactions on a photo: a journal photo, a profile picture, or
 * the household photo. Everything is household-scoped by the tables' own
 * policies (20260925100000_photo_comments_reactions.sql); these actions only
 * shape the rows and say what went wrong in words. */

export type PhotoKind = "journal" | "avatar" | "background";
export type PhotoRef = { kind: PhotoKind; id: string };
export type PhotoComment = { id: string; body: string; createdAt: string; author: string; mine: boolean };
export type PhotoReactionCount = { emoji: string; count: number; names: string[] };
export type PhotoSocial = { comments: PhotoComment[]; reactions: PhotoReactionCount[]; myReaction: string | null };

const COLUMN = { journal: "journal_media_id", avatar: "member_avatar_id", background: "family_background_id" } as const;
// Kept in step with REACTIONS in components/photo-social.tsx: a "use server"
// file may export only async functions, so the list lives in both places.
const ALLOWED = new Set(["❤️", "😂", "😮", "😢", "👍", "🙏"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMENT_MAX = 1000;

function column(ref: PhotoRef) {
  return ref && ref.kind in COLUMN && UUID.test(ref.id) ? COLUMN[ref.kind] : null;
}

/** The three photo columns for an insert, exactly one of them set. */
function target(ref: PhotoRef) {
  return {
    journal_media_id: ref.kind === "journal" ? ref.id : null,
    member_avatar_id: ref.kind === "avatar" ? ref.id : null,
    family_background_id: ref.kind === "background" ? ref.id : null,
  };
}

export async function getPhotoSocialAction(ref: PhotoRef): Promise<PhotoSocial | null> {
  const me = await requireCurrentMember();
  const col = column(ref);
  if (!col) return null;
  const supabase = await createClient();
  const [{ data: comments, error: cErr }, { data: reactions, error: rErr }] = await Promise.all([
    supabase.from("photo_comments").select("id, body, created_at, member_id, members(full_name)").eq(col, ref.id).order("created_at", { ascending: true }).limit(200),
    supabase.from("photo_reactions").select("emoji, member_id, members(full_name)").eq(col, ref.id),
  ]);
  if (cErr || rErr) return null;

  const name = (m: unknown) => ((m as { full_name?: string } | null)?.full_name ?? "Someone").split(" ")[0];
  const counts = new Map<string, PhotoReactionCount>();
  let myReaction: string | null = null;
  for (const r of reactions ?? []) {
    if (r.member_id === me.id) myReaction = r.emoji;
    const c = counts.get(r.emoji) ?? { emoji: r.emoji, count: 0, names: [] };
    c.count += 1;
    c.names.push(r.member_id === me.id ? "You" : name(r.members));
    counts.set(r.emoji, c);
  }
  return {
    comments: (comments ?? []).map((c) => ({ id: c.id, body: c.body, createdAt: c.created_at, author: c.member_id === me.id ? "You" : name(c.members), mine: c.member_id === me.id })),
    reactions: [...counts.values()].sort((a, b) => b.count - a.count),
    myReaction,
  };
}

export async function addPhotoCommentAction(ref: PhotoRef, body: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const col = column(ref);
  const text = clamp(body, COMMENT_MAX);
  if (!col) return { error: "That photo could not be found." };
  if (!text) return { error: "Write something first." };
  const supabase = await createClient();
  const { error } = await supabase.from("photo_comments").insert({ family_id: me.family_id, member_id: me.id, ...target(ref), body: text });
  return { error: error ? humanDatabaseError(error.message) : null };
}

export async function deletePhotoCommentAction(id: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That comment could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("photo_comments").delete().eq("id", id).eq("member_id", me.id);
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** One reaction per person per photo: set it, change it, or (null) take it
 * back. Update-then-insert rather than an upsert, because the uniqueness is a
 * partial index per photo kind, which ON CONFLICT cannot name. */
export async function setPhotoReactionAction(ref: PhotoRef, emoji: string | null): Promise<ActionState> {
  const me = await requireCurrentMember();
  const col = column(ref);
  if (!col) return { error: "That photo could not be found." };
  if (emoji !== null && !ALLOWED.has(emoji)) return { error: "That reaction isn't one Kin offers." };
  const supabase = await createClient();

  if (emoji === null) {
    const { error } = await supabase.from("photo_reactions").delete().eq(col, ref.id).eq("member_id", me.id);
    return { error: error ? humanDatabaseError(error.message) : null };
  }
  const { data: changed, error: updateError } = await supabase.from("photo_reactions").update({ emoji }).eq(col, ref.id).eq("member_id", me.id).select("id");
  if (updateError) return { error: humanDatabaseError(updateError.message) };
  if (changed && changed.length > 0) return { error: null };
  const { error } = await supabase.from("photo_reactions").insert({ family_id: me.family_id, member_id: me.id, ...target(ref), emoji });
  return { error: error ? humanDatabaseError(error.message) : null };
}
