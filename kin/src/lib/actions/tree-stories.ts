"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { UUID } from "@/lib/ids";
import { sendTreeStoryPush } from "@/lib/push";
import type { ActionState } from "@/lib/actions/auth";
import {
  canAddStories,
  parseStoryWhen,
  STORY_BODY_MAX,
  STORY_FILE_TYPES,
  STORY_FILES_MAX,
  STORY_RECORDING_MAX_SECONDS,
  STORY_TELLER_MAX,
  STORY_TITLE_MAX,
  STORY_TRANSCRIPT_MAX,
} from "@/lib/tree-stories";

/** Stories on the tree (20261014204000_tree_person_stories). The database
 * decides who may do what; these say it in words first and keep the files
 * in step with the rows. */

export type NewStoryFile = {
  storagePath: string;
  mimeType: string;
  fileName: string;
  transcript?: string | null;
  durationSeconds?: number | null;
};

export type StoryInput = {
  /** Set when changing a story already kept. */
  storyId?: string | null;
  personId: string;
  title: string;
  body: string;
  /** A member of the household who told it, or the words for somebody who
   * isn't one. One or the other; neither is fine. */
  tellerMemberId: string | null;
  tellerName: string;
  when: string;
  /** Uploaded already, through /api/uploads/session (kind tree_story). */
  files: NewStoryFile[];
  /** Files on the story to take off, when changing it. */
  removeFileIds?: string[];
  /** Shared with linked households that have this person on their tree
   * (20261019211500). Off unless ticked. */
  shared?: boolean;
};

const revalidate = (personId: string) => {
  revalidatePath("/family");
  revalidatePath(`/family/stories/${personId}`);
};

/** Takes files out of storage, best effort: a story is never kept alive by a
 * file. What could not be removed is said in the log. */
async function removeStoredFiles(supabase: Awaited<ReturnType<typeof createClient>>, paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from("documents").remove(paths);
  if (error) console.error(`${paths.length} story files were left in storage`, error.message);
}

/** Lets go of files uploaded for a save that did not go through, so they
 * are not left in storage, still counted, with nothing pointing at them.
 * These paths came from the browser, so any a story already keeps are left
 * alone: a save that fails must never take another story's recording. */
async function discardUploads(supabase: Awaited<ReturnType<typeof createClient>>, paths: string[]) {
  if (paths.length === 0) return;
  const { data: kept, error } = await supabase.from("tree_person_story_files").select("storage_path").in("storage_path", paths);
  if (error) {
    console.error(`${paths.length} story uploads were left in storage`, error.message);
    return;
  }
  const keep = new Set((kept ?? []).map((k) => k.storage_path));
  await removeStoredFiles(
    supabase,
    paths.filter((p) => !keep.has(p)),
  );
}

export async function saveTreeStoryAction(input: StoryInput): Promise<ActionState & { id?: string }> {
  const me = await requireCurrentMember();
  if (!canAddStories(me)) return { error: "Stories are added by grown-ups and teens with a login of their own." };
  if (!UUID.test(input.personId)) return { error: "That person could not be found." };
  if (input.storyId && !UUID.test(input.storyId)) return { error: "That story could not be found." };

  const title = clamp(input.title, STORY_TITLE_MAX);
  if (!title) return { error: "Give the story a title." };
  const body = clamp(input.body, STORY_BODY_MAX);
  const tellerName = clamp(input.tellerName, STORY_TELLER_MAX);
  const tellerMemberId = input.tellerMemberId && UUID.test(input.tellerMemberId) ? input.tellerMemberId : null;
  const when = parseStoryWhen(clamp(input.when, 40), familyDay(new Date(), await householdZone()));
  if ("error" in when) return { error: when.error };

  const prefix = `${me.family_id}/stories/`;
  const files = input.files ?? [];
  for (const f of files) {
    if (!f.storagePath.startsWith(prefix) || f.storagePath.includes("..") || !STORY_FILE_TYPES.test(f.mimeType)) {
      return { error: "A file didn't upload to the right place. Try adding it again." };
    }
  }
  const removeIds = (input.removeFileIds ?? []).filter((id) => UUID.test(id));

  const supabase = await createClient();
  const { data: person, error: personError } = await supabase
    .from("family_tree_people")
    .select("id, family_id, full_name, member_id")
    .eq("id", input.personId)
    .maybeSingle();
  if (personError) return { error: humanDatabaseError(personError.message) };
  if (!person || person.family_id !== me.family_id) return { error: "That person could not be found." };

  const fields = {
    title,
    body: body || null,
    told_by_member_id: tellerMemberId,
    told_by_name: tellerMemberId ? null : tellerName || null,
    happened_on: when.on,
    happened_precision: when.precision,
    person_id: person.id,
    // The database dates the share itself and keeps that date while it
    // stays on; this only says on or off.
    shared_at: input.shared ? new Date().toISOString() : null,
  };

  const uploads = files.map((f) => f.storagePath);
  let storyId: string;
  // New files go after the ones already there.
  let firstPosition = 0;
  // Whether the linked households hear of it: when it is new and shared, or
  // shared now and wasn't before.
  let newlyShared = !!input.shared;
  if (input.storyId) {
    const { count, error: countError } = await supabase
      .from("tree_person_story_files")
      .select("id", { count: "exact", head: true })
      .eq("story_id", input.storyId);
    if (countError) {
      await discardUploads(supabase, uploads);
      return { error: humanDatabaseError(countError.message) };
    }
    if ((count ?? 0) - removeIds.length + files.length > STORY_FILES_MAX) {
      await discardUploads(supabase, uploads);
      return { error: `A story can hold ${STORY_FILES_MAX} files.` };
    }
    firstPosition = count ?? 0;
    if (input.shared) {
      const { data: before } = await supabase.from("tree_person_stories").select("shared_at").eq("id", input.storyId).maybeSingle();
      newlyShared = !before?.shared_at;
    }

    // Only its writer can change it; the policy says so too, and an update
    // that matched nothing is said rather than reported as saved.
    const { data: updated, error } = await supabase
      .from("tree_person_stories")
      .update(fields)
      .eq("id", input.storyId)
      .eq("created_by", me.id)
      .select("id")
      .maybeSingle();
    if (error || !updated) {
      await discardUploads(supabase, uploads);
      return { error: error ? humanDatabaseError(error.message) : "Only whoever added a story can change it." };
    }
    storyId = updated.id;

    if (removeIds.length > 0) {
      const { data: gone, error: removeError } = await supabase
        .from("tree_person_story_files")
        .delete()
        .eq("story_id", storyId)
        .in("id", removeIds)
        .select("storage_path");
      if (removeError) {
        await discardUploads(supabase, uploads);
        return { error: humanDatabaseError(removeError.message) };
      }
      await removeStoredFiles(
        supabase,
        (gone ?? []).map((g) => g.storage_path),
      );
    }
  } else {
    if (files.length > STORY_FILES_MAX) {
      await discardUploads(supabase, uploads);
      return { error: `A story can hold ${STORY_FILES_MAX} files.` };
    }
    const { data: created, error } = await supabase
      .from("tree_person_stories")
      .insert({ ...fields, family_id: me.family_id, created_by: me.id })
      .select("id")
      .single();
    if (error) {
      await discardUploads(supabase, uploads);
      return { error: humanDatabaseError(error.message) };
    }
    storyId = created.id;
  }

  if (files.length > 0) {
    const { error: fileError } = await supabase.from("tree_person_story_files").insert(
      files.map((f, i) => ({
        story_id: storyId,
        family_id: me.family_id,
        storage_path: f.storagePath,
        mime_type: f.mimeType,
        file_name: clamp(f.fileName, 200),
        transcript: f.transcript ? clamp(f.transcript, STORY_TRANSCRIPT_MAX) || null : null,
        duration_seconds:
          typeof f.durationSeconds === "number" && f.durationSeconds > 0 ? Math.min(f.durationSeconds, STORY_RECORDING_MAX_SECONDS) : null,
        position: firstPosition + i,
      })),
    );
    if (fileError) {
      // The story is kept (it may already have had words or files); the new
      // files are not, so nothing sits in storage that no row points at.
      await discardUploads(supabase, uploads);
      revalidate(person.id);
      return { error: `The story was saved, but its files were not: ${humanDatabaseError(fileError.message)}`, id: storyId };
    }
  }

  revalidate(person.id);
  if (!input.storyId || newlyShared) {
    const personFirst = (await personName(supabase, person)).split(" ")[0];
    const isNew = !input.storyId;
    after(() => sendTreeStoryPush({ id: storyId, personId: person.id, isNew, title, writerFirst: me.full_name.split(" ")[0], personFirst }));
  }
  return { error: null, id: storyId };
}

/** The name the household has for someone on its tree: their member name
 * when they are a member, the tree's otherwise. */
async function personName(supabase: Awaited<ReturnType<typeof createClient>>, person: { full_name: string | null; member_id: string | null }) {
  if (person.member_id) {
    const { data } = await supabase.from("members").select("full_name").eq("id", person.member_id).maybeSingle();
    if (data?.full_name) return data.full_name;
  }
  return person.full_name || "them";
}

/** Deletes a story and its files. Whoever added it may; so may a grown-up. */
export async function deleteTreeStoryAction(storyId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(storyId)) return { error: "That story could not be found." };
  const supabase = await createClient();
  // The files are read first: once the story is gone, so are the rows that
  // say where they are. A failed read keeps the story rather than leave its
  // files in storage, still counted, with nothing pointing at them.
  const { data: fileRows, error: readError } = await supabase.from("tree_person_story_files").select("storage_path").eq("story_id", storyId);
  if (readError) return { error: humanDatabaseError(readError.message) };

  const { data: gone, error } = await supabase.from("tree_person_stories").delete().eq("id", storyId).eq("family_id", me.family_id).select("person_id").maybeSingle();
  if (error) return { error: humanDatabaseError(error.message) };
  if (!gone) return { error: "Only whoever added a story, or a grown-up, can delete it." };

  await removeStoredFiles(
    supabase,
    (fileRows ?? []).map((f) => f.storage_path),
  );
  revalidate(gone.person_id);
  return { error: null };
}
