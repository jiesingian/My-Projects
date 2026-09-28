"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import type { ActionState } from "@/lib/actions/auth";

/** Albums for photos sent in the family chat (28 September) -- see
 * 20260928180000_chat_albums.sql for who may do what. An album only points at
 * photos already in the chat; nothing here uploads or deletes a file. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (list: string[]) => Array.from(new Set(list.filter((id) => UUID.test(id)))).slice(0, 20);

export type AlbumChoice = { id: string; name: string; count: number };

/** The household's albums, newest first, for the "keep these in an album?" sheet. */
export async function listAlbumsAction(): Promise<AlbumChoice[]> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_albums")
    .select("id, name, chat_album_photos(count)")
    .eq("family_id", me.family_id)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((a) => ({ id: a.id, name: a.name, count: (a.chat_album_photos as unknown as { count: number }[])?.[0]?.count ?? 0 }));
}

async function addPhotos(albumId: string, photoIds: string[]): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const rows = ids(photoIds).map((attachment_id) => ({ album_id: albumId, attachment_id, family_id: me.family_id, added_by: me.id }));
  if (rows.length === 0) return { error: null };
  // Already in the album is fine: nothing to add twice.
  const { error } = await supabase.from("chat_album_photos").upsert(rows, { onConflict: "album_id,attachment_id", ignoreDuplicates: true });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/chat/albums");
  return { error: null };
}

export async function createAlbumAction(name: string, photoIds: string[]): Promise<ActionState & { id?: string }> {
  const me = await requireCurrentMember();
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!clean) return { error: "Give the album a name." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("chat_albums").insert({ family_id: me.family_id, name: clean, created_by: me.id }).select("id").single();
  if (error || !data) return { error: error ? humanDatabaseError(error.message) : "The album wasn't made." };
  const added = await addPhotos(data.id, photoIds);
  if (added.error) return added;
  return { error: null, id: data.id };
}

export async function addToAlbumAction(albumId: string, photoIds: string[]): Promise<ActionState> {
  if (!UUID.test(albumId)) return { error: "That album couldn't be found." };
  return addPhotos(albumId, photoIds);
}

export async function removeFromAlbumAction(albumId: string, photoId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(albumId) || !UUID.test(photoId)) return { error: "That photo couldn't be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("chat_album_photos").delete().eq("album_id", albumId).eq("attachment_id", photoId).select("album_id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "Only whoever added it, whoever started the album, or a parent can take it out." };
  revalidatePath(`/chat/albums/${albumId}`);
  return { error: null };
}

export async function deleteAlbumAction(albumId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(albumId)) return { error: "That album couldn't be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("chat_albums").delete().eq("id", albumId).select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "Only whoever started the album, or a parent, can delete it." };
  revalidatePath("/chat/albums");
  return { error: null };
}
