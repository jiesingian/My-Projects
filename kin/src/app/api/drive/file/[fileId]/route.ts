import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getValidDriveAccessToken, fetchDriveFile, deleteDriveFile } from "@/lib/google-drive";

/** Streams a Drive-stored photo/file inline under our own domain, so the
 * gallery can show it directly instead of linking out to Drive — works
 * regardless of the file's own Drive sharing settings, since we fetch it
 * with the household's own access token. */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { fileId } = await params;

  const supabase = await createClient();
  const [{ data: media }, { data: doc }, { data: avatar }, { data: background }] = await Promise.all([
    supabase.from("journal_media").select("id").eq("family_id", me.family_id).eq("drive_file_id", fileId).maybeSingle(),
    supabase.from("doc_files").select("id").eq("family_id", me.family_id).eq("drive_file_id", fileId).maybeSingle(),
    supabase.from("member_avatars").select("id").eq("family_id", me.family_id).eq("drive_file_id", fileId).maybeSingle(),
    supabase.from("family_backgrounds").select("id").eq("family_id", me.family_id).eq("drive_file_id", fileId).maybeSingle(),
  ]);
  if (!media && !doc && !avatar && !background) return new Response("Not found", { status: 404 });

  const token = await getValidDriveAccessToken(me.family_id);
  if (!token) return new Response("Drive not connected", { status: 404 });

  const res = await fetchDriveFile(token, fileId);
  if (!res.ok || !res.body) return new Response("Not found", { status: 404 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** Rolls back an upload that reached Drive but never got indexed (the
 * attach step that follows it failed) — deliberately not restricted to
 * files this household has already indexed, since an orphan by definition
 * has no index row yet. Safe regardless: the drive.file scope means a
 * household's access token can only ever see/delete files created under
 * its own OAuth grant, never another household's. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { fileId } = await params;

  const token = await getValidDriveAccessToken(me.family_id);
  if (!token) return new Response("Drive not connected", { status: 404 });

  await deleteDriveFile(token, fileId);
  return new Response(null, { status: 204 });
}
