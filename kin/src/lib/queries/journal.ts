import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";

export async function getGallery(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_media")
    .select("*")
    .eq("family_id", familyId)
    .order("taken_at", { ascending: false })
    .limit(30);
  const media = data ?? [];
  const supabasePaths = media.map((m) => m.storage_path).filter((p): p is string => !!p);
  const urls = await getSignedUrls("journal", supabasePaths);

  return media.map((m) => ({
    ...m,
    url:
      m.storage_provider === "google_drive" && m.drive_file_id
        ? `/api/drive/file/${m.drive_file_id}`
        : m.storage_path
          ? urls[m.storage_path] ?? null
          : null,
    viewLink: m.storage_provider === "google_drive" ? m.drive_view_link : null,
  }));
}

export async function getEntries(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entries")
    .select("*, journal_entry_people(members(id, full_name)), journal_entry_media(journal_media(storage_path, storage_provider, drive_file_id))")
    .eq("family_id", familyId)
    .order("entry_date", { ascending: false });

  const entries = data ?? [];
  type MediaRef = { storage_path: string | null; storage_provider: string; drive_file_id: string | null };
  const allPaths = entries.flatMap((e) =>
    (e.journal_entry_media ?? [])
      .map((m) => m.journal_media as unknown as MediaRef | null)
      .filter((v): v is MediaRef => !!v && v.storage_provider === "supabase" && !!v.storage_path)
      .map((v) => v.storage_path as string),
  );
  const urls = await getSignedUrls("journal", allPaths);

  return entries.map((e) => ({
    ...e,
    people: (e.journal_entry_people ?? [])
      .map((p) => (p.members as unknown as { id: string; full_name: string } | null))
      .filter((v): v is { id: string; full_name: string } => !!v),
    photoUrls: (e.journal_entry_media ?? [])
      .map((m) => {
        const media = m.journal_media as unknown as MediaRef | null;
        if (!media) return null;
        if (media.storage_provider === "google_drive") return media.drive_file_id ? `/api/drive/file/${media.drive_file_id}` : null;
        return media.storage_path ? urls[media.storage_path] ?? null : null;
      })
      .filter((v): v is string => !!v),
  }));
}

export async function getMilestones(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("milestones")
    .select("*, members(full_name)")
    .eq("family_id", familyId)
    .order("milestone_date", { ascending: false });
  return data ?? [];
}
