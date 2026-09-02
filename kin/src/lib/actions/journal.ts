"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";

export async function uploadGalleryPhotosAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one photo or video." };

  for (const file of files) {
    const path = `${me.family_id}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("journal").upload(path, file, {
      contentType: file.type || undefined,
    });
    if (uploadErr) return { error: uploadErr.message };
    await supabase.from("journal_media").insert({
      family_id: me.family_id,
      storage_path: path,
      media_type: file.type.startsWith("video") ? "video" : "photo",
      taken_at: new Date().toISOString().slice(0, 10),
      uploaded_by: me.id,
    });
  }

  revalidatePath("/journal");
  return { error: null };
}

export async function createJournalEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const note = String(formData.get("note") ?? "").trim() || null;
  const people = formData.getAll("people").map(String);
  if (!title) return { error: "Give the entry a title." };

  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert({ family_id: me.family_id, entry_date: date, title, note, source: "manual", created_by: me.id })
    .select()
    .single();
  if (error) return { error: error.message };

  if (people.length > 0) {
    await supabase.from("journal_entry_people").insert(people.map((memberId) => ({ entry_id: entry.id, member_id: memberId })));
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  let order = 0;
  for (const file of files) {
    const path = `${me.family_id}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("journal").upload(path, file, { contentType: file.type || undefined });
    if (uploadErr) continue;
    const { data: media } = await supabase
      .from("journal_media")
      .insert({ family_id: me.family_id, storage_path: path, media_type: file.type.startsWith("video") ? "video" : "photo", taken_at: date, uploaded_by: me.id })
      .select()
      .single();
    if (media) {
      await supabase.from("journal_entry_media").insert({ entry_id: entry.id, media_id: media.id, sort_order: order++ });
    }
  }

  revalidatePath("/journal");
  redirect("/journal?seg=entries");
}

export async function createMilestoneAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const memberId = String(formData.get("member_id") ?? "") || null;
  if (!title) return { error: "Give the milestone a title." };

  const { error } = await supabase.from("milestones").insert({
    family_id: me.family_id,
    member_id: memberId,
    milestone_date: date,
    title,
    created_by: me.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/journal");
  return { error: null };
}
