import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";

export type Highlight = {
  id: string;
  memberId: string;
  mediaType: "image" | "video";
  durationSeconds: number | null;
  createdAt: string;
  expiresAt: string;
  /** Signed for half an hour, like every other private file. */
  url: string | null;
};

/** The household's live highlights. Expired ones never come back: the
 * table's read policy requires expires_at > now(). Empty, not an error, when
 * the table isn't there yet (a deploy running ahead of its migration). */
export async function getHighlights(familyId: string): Promise<Highlight[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("highlights")
    .select("id, member_id, storage_path, media_type, duration_seconds, created_at, expires_at")
    .eq("family_id", familyId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(100);
  const rows = data ?? [];
  const urls = await getSignedUrls("documents", rows.map((r) => r.storage_path));
  return rows.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    mediaType: r.media_type === "video" ? "video" : "image",
    durationSeconds: r.duration_seconds,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    url: urls[r.storage_path] ?? null,
  }));
}
