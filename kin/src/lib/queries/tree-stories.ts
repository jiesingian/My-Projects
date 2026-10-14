import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { orderStories, storyFileKind, type StoryFileKind } from "@/lib/tree-stories";

/** Stories on the tree (20261014204000_tree_person_stories). The household's
 * own; nothing here crosses to a linked household. */

export type StoryFile = {
  id: string;
  kind: StoryFileKind;
  mimeType: string;
  fileName: string;
  storagePath: string;
  url: string | null;
  transcript: string | null;
};

export type TreeStory = {
  id: string;
  title: string;
  body: string | null;
  tellerMemberId: string | null;
  tellerMemberName: string | null;
  tellerName: string | null;
  happenedOn: string | null;
  happenedPrecision: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  files: StoryFile[];
};

/** How many stories each person on the household's tree has, for the mark
 * on their tile. One small read of ids; an empty map when it fails, which
 * only means the tiles show no mark. */
export async function getStoryCounts(familyId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tree_person_stories").select("person_id").eq("family_id", familyId);
  if (error) console.error("tree story counts could not be read", error.message);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.person_id, (counts.get(r.person_id) ?? 0) + 1);
  return counts;
}

/** One person's stories with their files, signed for half an hour, in the
 * order of a life. `null` when the read failed, so the page can say so
 * rather than show "no stories yet". */
export async function getPersonStories(personId: string, familyId: string): Promise<TreeStory[] | null> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("tree_person_stories")
    .select("id, title, body, told_by_member_id, told_by_name, happened_on, happened_precision, created_by, created_at, updated_at")
    .eq("family_id", familyId)
    .eq("person_id", personId);
  if (error) {
    console.error("tree stories could not be read", error.message);
    return null;
  }
  const stories = orderStories(rows ?? []);
  if (stories.length === 0) return [];

  const memberIds = [...new Set(stories.flatMap((s) => [s.told_by_member_id, s.created_by]).filter((x): x is string => !!x))];
  const [{ data: fileRows, error: fileError }, { data: memberRows }] = await Promise.all([
    supabase
      .from("tree_person_story_files")
      .select("id, story_id, storage_path, mime_type, file_name, transcript, position, created_at")
      .in(
        "story_id",
        stories.map((s) => s.id),
      )
      .order("position")
      .order("created_at"),
    memberIds.length > 0 ? supabase.from("members").select("id, full_name").in("id", memberIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  if (fileError) console.error("tree story files could not be read", fileError.message);
  const nameOf = new Map((memberRows ?? []).map((m) => [m.id, m.full_name]));
  const urls = await getSignedUrls(
    "documents",
    (fileRows ?? []).map((f) => f.storage_path),
  );

  return stories.map((s) => ({
    id: s.id,
    title: s.title,
    body: s.body,
    tellerMemberId: s.told_by_member_id,
    tellerMemberName: s.told_by_member_id ? (nameOf.get(s.told_by_member_id) ?? null) : null,
    tellerName: s.told_by_name,
    happenedOn: s.happened_on,
    happenedPrecision: s.happened_precision,
    createdBy: s.created_by,
    createdByName: s.created_by ? (nameOf.get(s.created_by) ?? null) : null,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    files: (fileRows ?? [])
      .filter((f) => f.story_id === s.id)
      .flatMap((f) => {
        const kind = storyFileKind(f.mime_type);
        return kind
          ? [{ id: f.id, kind, mimeType: f.mime_type, fileName: f.file_name, storagePath: f.storage_path, url: urls[f.storage_path] ?? null, transcript: f.transcript }]
          : [];
      }),
  }));
}
