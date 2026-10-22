"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { databaseError, reportError } from "@/lib/report-error";
import { UUID } from "@/lib/ids";

/** Photos on a calendar event (20260926150000_event_photos.sql). The browser
 * has already put the file in Storage under <family id>/events/<event id>/;
 * this records it. */


export async function addEventPhotoAction(eventId: string, storagePath: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(eventId) || !storagePath.startsWith(`${me.family_id}/events/${eventId}/`)) return { error: "That photo could not be saved." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_photos").insert({ family_id: me.family_id, event_id: eventId, storage_path: storagePath, created_by: me.id });
  revalidatePath("/planner");
  return { error: error ? databaseError(error) : null };
}

export async function deleteEventPhotoAction(id: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That photo could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_photos").delete().eq("id", id).select("storage_path").maybeSingle();
  if (!error && data?.storage_path) await supabase.storage.from("journal").remove([data.storage_path]);
  revalidatePath("/planner");
  return { error: error ? databaseError(error) : null };
}

/** A past event's photos into the Journal, as one entry (asked 12 October):
 * the event's title and day, who was there, and a copy of each photo.
 *
 * Copied, not shared: deleting a photo from the event removes its file, and
 * deleting one from the Journal removes its own, so two rows pointing at one
 * file would let either side break the other. The copy sits under the
 * household's own folder like any Journal upload.
 *
 * Saved as source 'manual', the one value every Journal entry is known to be
 * allowed: 'from_event' and then 'from_plan' were both refused by the
 * journal_entries check in production (12 October), and that check is older
 * than supabase/migrations, so the repo cannot say what else it takes. An
 * entry made this way is found again by its title and day, so a second tap
 * opens it rather than making a duplicate. journal_entries.event_id
 * is reserved for milestones (milestones_are_entries.sql), so it is not used. */
export async function addEventToJournalAction(eventId: string): Promise<{ error: string | null; entryId?: string }> {
  const me = await requireCurrentMember();
  if (!UUID.test(eventId)) return { error: "That event could not be found." };
  const supabase = await createClient();

  const [{ data: event }, { data: photos }, { data: people }] = await Promise.all([
    supabase.from("events").select("id, title, event_date, sub_note").eq("id", eventId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("event_photos").select("storage_path").eq("event_id", eventId).eq("family_id", me.family_id).order("created_at", { ascending: true }),
    supabase.from("event_members").select("member_id").eq("event_id", eventId),
  ]);
  if (!event) return { error: "That event is no longer there." };
  if (!photos?.length) return { error: "This event has no photos yet." };

  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("family_id", me.family_id)
    .eq("source", "manual")
    .eq("title", event.title)
    .eq("entry_date", event.event_date)
    .limit(1)
    .maybeSingle();
  if (existing) return { error: null, entryId: existing.id };

  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert({
      family_id: me.family_id,
      entry_date: event.event_date,
      title: event.title,
      note: event.sub_note,
      source: "manual",
      created_by: me.id,
      visibility: "household",
    })
    .select("id")
    .single();
  // Each step says which it was, and the raw error goes to the server log:
  // a bare "isn't allowed here" twice over, with nothing recorded, is how
  // this took two rounds to find.
  if (error) {
    reportError("addEventToJournal: entry", error);
    return { error: `The Journal entry couldn't be made. ${databaseError(error)}` };
  }

  if (people?.length) {
    const { error: peopleError } = await supabase.from("journal_entry_people").insert(people.map((p) => ({ entry_id: entry.id, member_id: p.member_id })));
    if (peopleError) reportError("addEventToJournal: people", peopleError);
    if (peopleError) return { error: `The entry was made, but not who was there. ${databaseError(peopleError)}`, entryId: entry.id };
  }

  let failed = 0;
  for (const [i, photo] of photos.entries()) {
    const ext = (photo.storage_path.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const to = `${me.family_id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-event.${ext}`;
    const { error: copyError } = await supabase.storage.from("journal").copy(photo.storage_path, to);
    if (copyError) {
      reportError("addEventToJournal: copy", copyError);
      failed++;
      continue;
    }
    const { data: media, error: mediaError } = await supabase
      .from("journal_media")
      .insert({ family_id: me.family_id, media_type: "photo", uploaded_by: me.id, storage_provider: "supabase", storage_path: to, visibility: "household" })
      .select("id")
      .single();
    if (mediaError) {
      reportError("addEventToJournal: media", mediaError);
      await supabase.storage.from("journal").remove([to]);
      failed++;
      continue;
    }
    const { error: linkError } = await supabase.from("journal_entry_media").insert({ entry_id: entry.id, media_id: media.id, sort_order: i });
    if (linkError) {
      reportError("addEventToJournal: link", linkError);
      failed++;
    }
  }

  revalidatePath("/journal");
  revalidatePath("/planner");
  if (failed) return { error: `The entry was made, but ${failed} of ${photos.length} photos didn't copy.`, entryId: entry.id };
  return { error: null, entryId: entry.id };
}
