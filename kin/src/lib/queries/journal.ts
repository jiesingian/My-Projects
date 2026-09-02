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
  const urls = await getSignedUrls("journal", media.map((m) => m.storage_path));
  return media.map((m) => ({ ...m, url: urls[m.storage_path] ?? null }));
}

export async function getEntries(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entries")
    .select("*, journal_entry_people(members(id, full_name)), journal_entry_media(journal_media(storage_path))")
    .eq("family_id", familyId)
    .order("entry_date", { ascending: false });

  const entries = data ?? [];
  const allPaths = entries.flatMap((e) =>
    (e.journal_entry_media ?? []).map((m) => (m.journal_media as unknown as { storage_path: string } | null)?.storage_path).filter((v): v is string => !!v),
  );
  const urls = await getSignedUrls("journal", allPaths);

  return entries.map((e) => ({
    ...e,
    people: (e.journal_entry_people ?? [])
      .map((p) => (p.members as unknown as { id: string; full_name: string } | null))
      .filter((v): v is { id: string; full_name: string } => !!v),
    photoUrls: (e.journal_entry_media ?? [])
      .map((m) => {
        const path = (m.journal_media as unknown as { storage_path: string } | null)?.storage_path;
        return path ? urls[path] : null;
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
