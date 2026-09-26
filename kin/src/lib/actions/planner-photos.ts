"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { humanDatabaseError } from "@/lib/db-errors";

/** Photos on a calendar event (20260926150000_event_photos.sql). The browser
 * has already put the file in Storage under <family id>/events/<event id>/;
 * this records it. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addEventPhotoAction(eventId: string, storagePath: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(eventId) || !storagePath.startsWith(`${me.family_id}/events/${eventId}/`)) return { error: "That photo could not be saved." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_photos").insert({ family_id: me.family_id, event_id: eventId, storage_path: storagePath, created_by: me.id });
  revalidatePath("/planner");
  return { error: error ? humanDatabaseError(error.message) : null };
}

export async function deleteEventPhotoAction(id: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That photo could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_photos").delete().eq("id", id).select("storage_path").maybeSingle();
  if (!error && data?.storage_path) await supabase.storage.from("journal").remove([data.storage_path]);
  revalidatePath("/planner");
  return { error: error ? humanDatabaseError(error.message) : null };
}
