"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { getValidDriveAccessToken, ensureDriveFolderStructure, ensureProfilePhotoFolder, uploadFileToDrive } from "@/lib/google-drive";
import type { ActionState } from "@/lib/actions/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type MigrateResult = ActionState & { migrated?: number };

/** Downloads one photo from Supabase Storage and re-uploads it to Drive,
 * returning the new file's id. Caller is responsible for updating whatever
 * row/column pointed at the old storage path. */
async function migrateOneFile(
  supabase: SupabaseClient<Database>,
  accessToken: string,
  folderId: string,
  storagePath: string,
): Promise<string> {
  const { data: blob, error } = await supabase.storage.from("avatars").download(storagePath);
  if (error || !blob) throw new Error(`Couldn't read "${storagePath}" from storage: ${error?.message ?? "not found"}`);

  const fileName = storagePath.split("/").pop() ?? storagePath;
  const uploaded = await uploadFileToDrive(accessToken, folderId, fileName, blob.type || "image/jpeg", blob);
  return uploaded.id;
}

/** One-time backfill for households that uploaded profile photos before
 * connecting Drive (or before this app routed them there) — moves every
 * Supabase-only member_avatars/family_backgrounds row to Drive, updates the
 * active avatar_url/background_url pointer if it was pointing at one of the
 * migrated photos, and removes the old Storage object. Organizer only,
 * since it touches every member's avatars, not just the caller's own. */
export async function migrateProfilePhotosToDriveAction(): Promise<MigrateResult> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can move photos to Drive." };

  const accessToken = await getValidDriveAccessToken(me.family_id);
  if (!accessToken) return { error: "Connect Google Drive first, from the Connected Storage section above." };

  const supabase = await createClient();
  const { rootFolderId } = await ensureDriveFolderStructure(me.family_id, accessToken, me.families.name);

  let migrated = 0;
  try {
    const { data: avatarRows } = await supabase
      .from("member_avatars")
      .select("id, storage_path, member_id, members(full_name, avatar_url)")
      .eq("family_id", me.family_id)
      .is("drive_file_id", null)
      .not("storage_path", "is", null);

    for (const row of avatarRows ?? []) {
      const storagePath = row.storage_path!;
      const member = row.members as unknown as { full_name: string; avatar_url: string | null } | null;
      const fullName = member?.full_name ?? "Member";
      const oldUrl = supabase.storage.from("avatars").getPublicUrl(storagePath).data.publicUrl;

      const folderId = await ensureProfilePhotoFolder(accessToken, rootFolderId, { kind: "member", memberId: row.member_id, fullName });
      const driveFileId = await migrateOneFile(supabase, accessToken, folderId, storagePath);

      await supabase.from("member_avatars").update({ storage_path: null, drive_file_id: driveFileId }).eq("id", row.id);
      if (member?.avatar_url === oldUrl) {
        await supabase.from("members").update({ avatar_url: `/api/drive/file/${driveFileId}` }).eq("id", row.member_id);
      }
      await supabase.storage.from("avatars").remove([storagePath]).catch(() => {});
      migrated++;
    }

    const { data: backgroundRows } = await supabase
      .from("family_backgrounds")
      .select("id, storage_path, family_id, families(background_url)")
      .eq("family_id", me.family_id)
      .is("drive_file_id", null)
      .not("storage_path", "is", null);

    const householdFolderId = await ensureProfilePhotoFolder(accessToken, rootFolderId, { kind: "household" });
    for (const row of backgroundRows ?? []) {
      const storagePath = row.storage_path!;
      const family = row.families as unknown as { background_url: string | null } | null;
      const oldUrl = supabase.storage.from("avatars").getPublicUrl(storagePath).data.publicUrl;

      const driveFileId = await migrateOneFile(supabase, accessToken, householdFolderId, storagePath);

      await supabase.from("family_backgrounds").update({ storage_path: null, drive_file_id: driveFileId }).eq("id", row.id);
      if (family?.background_url === oldUrl) {
        await supabase.from("families").update({ background_url: `/api/drive/file/${driveFileId}` }).eq("id", row.family_id);
      }
      await supabase.storage.from("avatars").remove([storagePath]).catch(() => {});
      migrated++;
    }
  } catch (err) {
    revalidatePath("/family");
    revalidatePath("/settings");
    return { error: `Moved ${migrated} photo(s) before hitting an error: ${(err as Error).message}` };
  }

  revalidatePath("/family");
  revalidatePath("/settings");
  return { error: null, migrated };
}
