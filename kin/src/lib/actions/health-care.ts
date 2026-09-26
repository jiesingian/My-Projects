"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { humanDatabaseError } from "@/lib/db-errors";
import { explainVisibilityRefusal } from "@/lib/visibility";
import { clamp } from "@/lib/text";
import { familyDay } from "@/lib/time";
import { parseTimes } from "@/lib/health-plan";

/** Medicines, the illness log, and notes and photos on a visit (26
 * September). Who may see and change each is the tables' own business
 * (20260926110000_health_medicines_illness_visits.sql); these shape the
 * input and say in words what went wrong. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const VISIBILITY = new Set(["family", "parents", "private"]);

const done = (memberId: string, error: string | null): ActionState => {
  revalidatePath(`/family/members/${memberId}`);
  revalidatePath("/family");
  return { error };
};
const say = (message: string) => explainVisibilityRefusal(humanDatabaseError(message));

// ── medicines ────────────────────────────────────────────────────────────────

export async function addMedicineAction(input: { memberId: string; name: string; dose: string; times: string; startDate: string; endDate: string; notes: string; visibility: string }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(input.memberId)) return { error: "Choose who it's for." };
  const name = clamp(input.name, 120);
  if (!name) return { error: "Give the medicine a name." };
  const times = parseTimes(input.times);
  if (input.times.trim() && times.length === 0) return { error: "Kin couldn't read those times. Try something like 8am, 8pm." };
  const start = DAY.test(input.startDate) ? input.startDate : familyDay();
  const end = DAY.test(input.endDate) ? input.endDate : null;
  if (end && end < start) return { error: "The last day is before the first." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_medicines").insert({
    family_id: me.family_id,
    member_id: input.memberId,
    name,
    dose: clamp(input.dose, 120) || null,
    times,
    start_date: start,
    end_date: end,
    notes: clamp(input.notes, 1000) || null,
    visibility: VISIBILITY.has(input.visibility) ? input.visibility : "family",
    created_by: me.id,
  });
  return done(input.memberId, error ? say(error.message) : null);
}

export async function stopMedicineAction(id: string, memberId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That medicine could not be found." };
  const supabase = await createClient();
  // Stopping ends the course yesterday rather than deleting it, so what was
  // taken stays on record; a medicine added by mistake is deleted instead.
  const yesterday = new Date(Date.now() - 86_400_000);
  const { error } = await supabase.from("health_medicines").update({ end_date: familyDay(yesterday) }).eq("id", id);
  return done(memberId, error ? say(error.message) : null);
}

export async function deleteMedicineAction(id: string, memberId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That medicine could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_medicines").delete().eq("id", id);
  return done(memberId, error ? say(error.message) : null);
}

/** Tick a dose as taken, or untick it. */
export async function setDoseTakenAction(input: { medicineId: string; memberId: string; day: string; time: string; taken: boolean }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(input.medicineId) || !DAY.test(input.day) || !/^\d{2}:\d{2}$/.test(input.time)) return { error: "That dose could not be found." };
  const supabase = await createClient();
  if (input.taken) {
    const { error } = await supabase
      .from("health_medicine_doses")
      .upsert({ family_id: me.family_id, medicine_id: input.medicineId, dose_date: input.day, dose_time: input.time, taken_by: me.id }, { onConflict: "medicine_id,dose_date,dose_time", ignoreDuplicates: true });
    return done(input.memberId, error ? say(error.message) : null);
  }
  const { error } = await supabase.from("health_medicine_doses").delete().eq("medicine_id", input.medicineId).eq("dose_date", input.day).eq("dose_time", input.time);
  return done(input.memberId, error ? say(error.message) : null);
}

// ── the illness log ──────────────────────────────────────────────────────────

export async function addIllnessLogAction(input: { memberId: string; temperature: string; symptoms: string; given: string; note: string; visibility: string }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(input.memberId)) return { error: "Choose who is unwell." };
  const raw = input.temperature.trim().replace(",", ".");
  let temperature: number | null = null;
  if (raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return { error: "The temperature isn't a number." };
    // A reading over 45 was almost certainly typed in Fahrenheit.
    temperature = n > 45 ? Math.round(((n - 32) * 5) / 9 * 10) / 10 : Math.round(n * 10) / 10;
    if (temperature < 30 || temperature > 45) return { error: "That temperature doesn't look right." };
  }
  const symptoms = clamp(input.symptoms, 300) || null;
  const given = clamp(input.given, 300) || null;
  const note = clamp(input.note, 1000) || null;
  if (temperature === null && !symptoms && !given && !note) return { error: "Write down a temperature, a symptom or what was given." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_illness_logs").insert({
    family_id: me.family_id,
    member_id: input.memberId,
    temperature_c: temperature,
    symptoms,
    given,
    note,
    visibility: VISIBILITY.has(input.visibility) ? input.visibility : "family",
    created_by: me.id,
  });
  return done(input.memberId, error ? say(error.message) : null);
}

export async function deleteIllnessLogAction(id: string, memberId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That entry could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_illness_logs").delete().eq("id", id);
  return done(memberId, error ? say(error.message) : null);
}

// ── a visit's notes and photos ───────────────────────────────────────────────

export async function saveVisitNotesAction(appointmentId: string, memberId: string, notes: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(appointmentId)) return { error: "That visit could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_appointments").update({ notes: clamp(notes, 4000) || null }).eq("id", appointmentId);
  revalidatePath(`/family/members/${memberId}/visit/${appointmentId}`);
  return done(memberId, error ? say(error.message) : null);
}

/** Records a photo the browser has already put in Storage, under
 * <family id>/health/<visit id>/. The table checks the path is this
 * household's; Storage checked the upload itself. */
export async function addVisitPhotoAction(appointmentId: string, memberId: string, storagePath: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(appointmentId) || !storagePath.startsWith(`${me.family_id}/health/${appointmentId}/`)) return { error: "That photo could not be saved." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_visit_photos").insert({ family_id: me.family_id, appointment_id: appointmentId, storage_path: storagePath, created_by: me.id });
  revalidatePath(`/family/members/${memberId}/visit/${appointmentId}`);
  return done(memberId, error ? say(error.message) : null);
}

export async function deleteVisitPhotoAction(id: string, appointmentId: string, memberId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That photo could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("health_visit_photos").delete().eq("id", id).select("storage_path").maybeSingle();
  if (!error && data?.storage_path) await supabase.storage.from("journal").remove([data.storage_path]);
  revalidatePath(`/family/members/${memberId}/visit/${appointmentId}`);
  return done(memberId, error ? say(error.message) : null);
}

// ── the growth chart's one question ──────────────────────────────────────────

export async function setMemberSexAction(memberId: string, sex: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(memberId) || (sex !== "female" && sex !== "male")) return { error: "Choose girl or boy." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").update({ sex }).eq("id", memberId).select("id");
  if (!error && (!data || data.length === 0)) return { error: "Only the child's own grown-ups can set this." };
  return done(memberId, error ? say(error.message) : null);
}
