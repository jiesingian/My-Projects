import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { orderStories, storyFileKind, type StoryFileKind } from "@/lib/tree-stories";
import { reportError } from "@/lib/report-error";

/** Stories on the tree (20261014204000_tree_person_stories). The household's
 * own, and (20261019211500_tree_stories_shared) the ones a linked household
 * shared about the same person, read through linked_tree_stories(). */

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
  /** Shared with linked households that have this person on their tree. */
  shared: boolean;
  files: StoryFile[];
};

/** A story another household shared about the same person: read only, with
 * the names as that household has them. */
export type LinkedStory = {
  id: string;
  familyName: string;
  title: string;
  body: string | null;
  teller: string | null;
  happenedOn: string | null;
  happenedPrecision: string;
  createdByName: string | null;
  createdAt: string;
  files: StoryFile[];
};

/** How many stories each person on the household's tree has, for the mark
 * on their tile. One small read of ids; an empty map when it fails, which
 * only means the tiles show no mark. */
export async function getStoryCounts(familyId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tree_person_stories").select("person_id").eq("family_id", familyId);
  if (error) reportError("tree story counts could not be read", error);
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
    .select("id, title, body, told_by_member_id, told_by_name, happened_on, happened_precision, created_by, created_at, updated_at, shared_at")
    .eq("family_id", familyId)
    .eq("person_id", personId);
  if (error) {
    reportError("tree stories could not be read", error);
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
  if (fileError) reportError("tree story files could not be read", fileError);
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
    shared: s.shared_at !== null,
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

/** The stories linked households have shared about one person on this
 * household's tree, in the order of a life, with their files signed. Empty
 * when there are none or the read failed: they are an addition to the page,
 * and the household's own stories still show. */
export async function getLinkedStories(personId: string): Promise<LinkedStory[]> {
  const supabase = await createClient();
  const [{ data: rows, error }, { data: fileRows, error: fileError }] = await Promise.all([
    supabase.rpc("linked_tree_stories", { p_person: personId }),
    supabase.rpc("linked_tree_story_files", { p_person: personId }),
  ]);
  if (error) reportError("linked tree stories could not be read", error);
  if (fileError) reportError("linked tree story files could not be read", fileError);
  const stories = orderStories(rows ?? []);
  if (stories.length === 0) return [];
  const files = fileRows ?? [];
  const urls = await getSignedUrls(
    "documents",
    files.map((f) => f.storage_path),
  );
  return stories.map((s) => ({
    id: s.id,
    familyName: s.family_name,
    title: s.title,
    body: s.body,
    teller: s.teller,
    happenedOn: s.happened_on,
    happenedPrecision: s.happened_precision,
    createdByName: s.created_by_name,
    createdAt: s.created_at,
    files: files
      .filter((f) => f.story_id === s.id)
      .flatMap((f) => {
        const kind = storyFileKind(f.mime_type);
        return kind
          ? [{ id: f.id, kind, mimeType: f.mime_type, fileName: f.file_name, storagePath: f.storage_path, url: urls[f.storage_path] ?? null, transcript: f.transcript }]
          : [];
      }),
  }));
}
