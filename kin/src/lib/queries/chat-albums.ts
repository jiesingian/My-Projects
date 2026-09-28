import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";

/** Chat albums (28 September): the household's albums and the photos in them,
 * each photo read through a short-lived signed URL, as the chat itself does. */

export type AlbumCard = { id: string; name: string; count: number; coverUrl: string | null };
export type AlbumPhoto = { id: string; url: string; addedBy: string | null };
export type AlbumDetail = { id: string; name: string; createdBy: string | null; photos: AlbumPhoto[] };

export async function getAlbums(familyId: string): Promise<AlbumCard[]> {
  const supabase = await createClient();
  const [{ data: albums }, { data: links }] = await Promise.all([
    supabase.from("chat_albums").select("id, name, created_at").eq("family_id", familyId).order("created_at", { ascending: false }),
    supabase.from("chat_album_photos").select("album_id, attachment_id, added_at").eq("family_id", familyId).order("added_at", { ascending: false }),
  ]);
  // The newest photo is the cover.
  const cover = new Map<string, string>();
  const count = new Map<string, number>();
  for (const l of links ?? []) {
    if (!cover.has(l.album_id)) cover.set(l.album_id, l.attachment_id);
    count.set(l.album_id, (count.get(l.album_id) ?? 0) + 1);
  }
  const coverIds = Array.from(cover.values());
  const { data: files } = coverIds.length
    ? await supabase.from("family_message_attachments").select("id, storage_path").in("id", coverIds)
    : { data: [] };
  const pathOf = new Map((files ?? []).map((f) => [f.id, f.storage_path]));
  const signed = await getSignedUrls("documents", Array.from(pathOf.values()));
  return (albums ?? []).map((a) => {
    const path = pathOf.get(cover.get(a.id) ?? "");
    return { id: a.id, name: a.name, count: count.get(a.id) ?? 0, coverUrl: path ? (signed[path] ?? null) : null };
  });
}

export async function getAlbum(familyId: string, albumId: string): Promise<AlbumDetail | null> {
  const supabase = await createClient();
  const { data: album } = await supabase.from("chat_albums").select("id, name, created_by").eq("id", albumId).eq("family_id", familyId).maybeSingle();
  if (!album) return null;
  const { data: links } = await supabase
    .from("chat_album_photos")
    .select("attachment_id, added_by, added_at")
    .eq("album_id", albumId)
    .order("added_at", { ascending: false });
  const photoIds = (links ?? []).map((l) => l.attachment_id);
  const { data: files } = photoIds.length ? await supabase.from("family_message_attachments").select("id, storage_path").in("id", photoIds) : { data: [] };
  const pathOf = new Map((files ?? []).map((f) => [f.id, f.storage_path]));
  const signed = await getSignedUrls("documents", Array.from(pathOf.values()));
  const photos = (links ?? [])
    .map((l) => ({ id: l.attachment_id, url: signed[pathOf.get(l.attachment_id) ?? ""] ?? "", addedBy: l.added_by }))
    .filter((p) => p.url);
  return { id: album.id, name: album.name, createdBy: album.created_by, photos };
}
