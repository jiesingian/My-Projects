"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import type { ActionState } from "@/lib/actions/auth";
import { cleanNote, NOTE_MAX } from "@/lib/personal-notes";

/** Private notes (lib/personal-notes.ts). The owner is never sent: the
 * table fills it from the signed-in person, and row-level security refuses
 * a note that is anybody else's, so these only add the sentences. */

const TOO_LONG = `A note can be up to ${NOTE_MAX.toLocaleString("en-US")} characters.`;

export async function addNoteAction(body: string): Promise<ActionState & { id?: string }> {
  await requireCurrentMember();
  const text = cleanNote(body);
  if (!text) return { error: typeof body === "string" && body.trim() ? TOO_LONG : "Write something first." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("personal_notes").insert({ body: text }).select("id").single();
  if (error || !data) return { error: error ? humanDatabaseError(error.message) : "That didn't save." };
  revalidatePath("/notes");
  return { error: null, id: data.id };
}

export async function updateNoteAction(id: string, body: string): Promise<ActionState> {
  await requireCurrentMember();
  const text = cleanNote(body);
  if (!text) return { error: typeof body === "string" && body.trim() ? TOO_LONG : "A note can't be empty. Delete it instead." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_notes")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "That note isn't there any more." };
  revalidatePath("/notes");
  return { error: null };
}

export async function deleteNoteAction(id: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  // The rows actually removed: a note already gone (another tab, another
  // device) says so rather than reporting success.
  const { data, error } = await supabase.from("personal_notes").delete().eq("id", id).select("id");
  revalidatePath("/notes");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "That note was already removed." };
  return { error: null };
}
