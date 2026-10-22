"use server";

import { householdZone } from "@/lib/household-zone";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { databaseError, type DatabaseFailure, RLS_EXPLAINED } from "@/lib/report-error";
import { explainVisibilityRefusal } from "@/lib/visibility";
import { clamp } from "@/lib/text";
import { familyDay } from "@/lib/time";
import { parseTimes } from "@/lib/health-plan";
import { isMissedDelay } from "@/lib/missed-dose";
import { isSupplyUnit, STORE_MAX } from "@/lib/medicine-supply";
import { isGrownUp } from "@/lib/roles";
import { UUID } from "@/lib/ids";

/** Front and back of a slip, a refill or two: plenty for one medicine. */
const MAX_PRESCRIPTION_PHOTOS = 6;

/** Medicines, the illness log, and notes and photos on a visit (26
 * September). Who may see and change each is the tables' own business
 * (20260926110000_health_medicines_illness_visits.sql); these shape the
 * input and say in words what went wrong. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const VISIBILITY = new Set(["family", "parents", "private"]);

const done = (memberId: string, error: string | null): ActionState => {
  revalidatePath(`/family/members/${memberId}`);
  revalidatePath("/family");
  return { error };
};
const say = (error: DatabaseFailure) => explainVisibilityRefusal(databaseError(error, RLS_EXPLAINED));

// ── medicines ────────────────────────────────────────────────────────────────

export async function addMedicineAction(input: { memberId: string; name: string; dose: string; times: string; startDate: string; endDate: string; notes: string; visibility: string }): Promise<ActionState> {
  const tz = await householdZone();
  const me = await requireCurrentMember();
  if (!UUID.test(input.memberId)) return { error: "Choose who it's for." };
  const name = clamp(input.name, 120);
  if (!name) return { error: "Give the medicine a name." };
  const times = parseTimes(input.times);
  if (input.times.trim() && times.length === 0) return { error: "Kin couldn't read those times. Try something like 8am, 8pm." };
  const start = DAY.test(input.startDate) ? input.startDate : familyDay(new Date(), tz);
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
  return done(input.memberId, error ? say(error) : null);
}

export async function stopMedicineAction(id: string, memberId: string): Promise<ActionState> {
  const tz = await householdZone();
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That medicine could not be found." };
  const supabase = await createClient();
  // Stopping ends the course yesterday rather than deleting it, so what was
  // taken stays on record; a medicine added by mistake is deleted instead.
  // A course that started today (or is set to start later) ends on its own
  // start date instead: the table requires end_date >= start_date, so
  // "yesterday" was refused and a medicine added by mistake today could be
  // neither stopped nor deleted.
  const { data: med } = await supabase.from("health_medicines").select("start_date").eq("id", id).maybeSingle();
  if (!med) return { error: "That medicine could not be found." };
  const yesterday = familyDay(new Date(Date.now() - 86_400_000), tz);
  const end = yesterday < med.start_date ? med.start_date : yesterday;
  const { error } = await supabase.from("health_medicines").update({ end_date: end }).eq("id", id);
  return done(memberId, error ? say(error) : null);
}

export async function deleteMedicineAction(id: string, memberId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That medicine could not be found." };
  const supabase = await createClient();
  // Its prescription photos' rows go with it (on delete cascade); their files
  // are read first so they can be removed once the medicine is gone.
  const { data: photos } = await supabase.from("health_medicine_photos").select("storage_path").eq("medicine_id", id);
  const { error } = await supabase.from("health_medicines").delete().eq("id", id);
  if (!error && photos?.length) await supabase.storage.from("journal").remove(photos.map((p) => p.storage_path));
  return done(memberId, error ? say(error) : null);
}

/** Records a prescription photo the browser has already put in Storage,
 * under <family id>/health/<medicine id>/ (the upload session's visit_photo
 * folder, keyed on the medicine). The table checks the path is this
 * household's and this medicine's, and that the caller can see it. */
export async function addMedicinePhotoAction(medicineId: string, memberId: string, storagePath: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(medicineId) || !storagePath.startsWith(`${me.family_id}/health/${medicineId}/`)) return { error: "That photo could not be saved." };
  const supabase = await createClient();
  const { count } = await supabase.from("health_medicine_photos").select("id", { count: "exact", head: true }).eq("medicine_id", medicineId);
  if ((count ?? 0) >= MAX_PRESCRIPTION_PHOTOS) return { error: `A medicine keeps up to ${MAX_PRESCRIPTION_PHOTOS} prescription photos. Delete an old one first.` };
  const { error } = await supabase.from("health_medicine_photos").insert({ family_id: me.family_id, medicine_id: medicineId, storage_path: storagePath, created_by: me.id });
  return done(memberId, error ? say(error) : null);
}

export async function deleteMedicinePhotoAction(id: string, memberId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That photo could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("health_medicine_photos").delete().eq("id", id).select("storage_path").maybeSingle();
  if (!error && data?.storage_path) await supabase.storage.from("journal").remove([data.storage_path]);
  return done(memberId, error ? say(error) : null);
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
    return done(input.memberId, error ? say(error) : null);
  }
  const { error } = await supabase.from("health_medicine_doses").delete().eq("medicine_id", input.medicineId).eq("dose_date", input.day).eq("dose_time", input.time);
  return done(input.memberId, error ? say(error) : null);
}

/** "Tell someone if a dose is missed" (20261014200000): name one grown-up of
 * the household and how long to wait, or pass null to turn it off. The table
 * decides who may set it and who may be told; this says it in words first. */
export async function setMissedDoseAlertAction(input: { medicineId: string; memberId: string; notifyMemberId: string | null; delayMinutes: number }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can change who is told." };
  if (!UUID.test(input.medicineId)) return { error: "That medicine could not be found." };
  const supabase = await createClient();
  if (input.notifyMemberId === null) {
    const { error } = await supabase.from("health_medicine_alerts").delete().eq("medicine_id", input.medicineId);
    return done(input.memberId, error ? say(error) : null);
  }
  if (!UUID.test(input.notifyMemberId)) return { error: "Choose who to tell." };
  if (!isMissedDelay(input.delayMinutes)) return { error: "Choose how long to wait." };
  // One already on is changed in place; only turning it on is a new row,
  // which is what Kin Plus guards (an upsert would meet that guard on its
  // insert step even when it only changes who is told). A count, not
  // .select(): KNOWN_RISKS, "Actions that reported success".
  const fields = { notify_member_id: input.notifyMemberId, delay_minutes: input.delayMinutes, set_by: me.id };
  const { count, error: updateError } = await supabase.from("health_medicine_alerts").update(fields, { count: "exact" }).eq("medicine_id", input.medicineId);
  const { error } =
    updateError || count
      ? { error: updateError }
      : await supabase.from("health_medicine_alerts").insert({ medicine_id: input.medicineId, family_id: me.family_id, ...fields });
  // The table refuses a child, someone without a login, or someone the
  // medicine is hidden from, all with the same row-level refusal.
  if (error && /row-level security/i.test(error.message)) return { error: "That person can't be told about this medicine. Choose a grown-up with a login who can see it." };
  return done(input.memberId, error ? say(error) : null);
}

/** Pills left (20261014201000): a new count, and how many go per dose. A
 * count already there is changed in place (a new count starts a new supply
 * cycle; the table sets when); only a first count is a new row, which is
 * what Kin Plus guards. */
export async function setMedicineSupplyAction(input: { medicineId: string; memberId: string; counted: string; unit: string; perDose: string }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can change what's left." };
  if (!UUID.test(input.medicineId)) return { error: "That medicine could not be found." };
  const counted = Number(input.counted.trim().replace(",", "."));
  if (!input.counted.trim() || !Number.isFinite(counted) || counted < 0 || counted > 100000) return { error: "Write how many are on hand, e.g. 30." };
  const perDose = input.perDose.trim() ? Number(input.perDose.trim().replace(",", ".")) : 1;
  if (!Number.isFinite(perDose) || perDose <= 0 || perDose > 1000) return { error: "Write how many go per dose, e.g. 1." };
  const unit = isSupplyUnit(input.unit) ? input.unit : "tablet";
  const supabase = await createClient();
  const fields = { counted, unit, per_dose: perDose, set_by: me.id };
  // A count, not .select(): KNOWN_RISKS, "Actions that reported success".
  const { count, error } = await supabase.from("health_medicine_supply").update(fields, { count: "exact" }).eq("medicine_id", input.medicineId);
  if (error) return done(input.memberId, say(error));
  if (count) return done(input.memberId, null);
  const { error: insertError } = await supabase.from("health_medicine_supply").insert({ medicine_id: input.medicineId, family_id: me.family_id, ...fields });
  return done(input.memberId, insertError ? say(insertError) : null);
}

/** "Refilled: add a box". The database adds it to what is left now, so a
 * dose ticked a moment ago is not lost. */
export async function addToMedicineSupplyAction(medicineId: string, memberId: string, add: number): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can change what's left." };
  if (!UUID.test(medicineId) || !Number.isFinite(add) || add <= 0 || add > 10000) return { error: "That couldn't be added." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_to_medicine_supply", { p_medicine: medicineId, p_add: add });
  if (!error && data === null) return { error: "That couldn't be added. Count what's left instead." };
  return done(memberId, error ? say(error) : null);
}

/** What the household's helper reads for this medicine's refill line
 * (20261020160000): "Medicine refill", with the store it is usually bought
 * at, or the medicine's name once a grown-up says so. Only these two columns
 * move, so the supply cycle (counted, counted_at) stays as it is. */
export async function setMedicineHelperLineAction(input: { medicineId: string; memberId: string; showName: boolean; store: string }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can change what the helper sees." };
  if (!UUID.test(input.medicineId)) return { error: "That medicine could not be found." };
  const store = clamp(input.store, STORE_MAX);
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("health_medicine_supply")
    .update({ show_name_to_helper: input.showName === true, store: store || null, set_by: me.id }, { count: "exact" })
    .eq("medicine_id", input.medicineId);
  if (!error && !count) return { error: "Count what's left first; the refill line comes from that." };
  return done(input.memberId, error ? say(error) : null);
}

export async function stopMedicineSupplyAction(medicineId: string, memberId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can change what's left." };
  if (!UUID.test(medicineId)) return { error: "That medicine could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_medicine_supply").delete().eq("medicine_id", medicineId);
  return done(memberId, error ? say(error) : null);
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
  return done(input.memberId, error ? say(error) : null);
}

export async function deleteIllnessLogAction(id: string, memberId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That entry could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_illness_logs").delete().eq("id", id);
  return done(memberId, error ? say(error) : null);
}

// ── a visit's notes and photos ───────────────────────────────────────────────

export async function saveVisitNotesAction(appointmentId: string, memberId: string, notes: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(appointmentId)) return { error: "That visit could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_appointments").update({ notes: clamp(notes, 4000) || null }).eq("id", appointmentId);
  revalidatePath(`/family/members/${memberId}/visit/${appointmentId}`);
  return done(memberId, error ? say(error) : null);
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
  return done(memberId, error ? say(error) : null);
}

export async function deleteVisitPhotoAction(id: string, appointmentId: string, memberId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That photo could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("health_visit_photos").delete().eq("id", id).select("storage_path").maybeSingle();
  if (!error && data?.storage_path) await supabase.storage.from("journal").remove([data.storage_path]);
  revalidatePath(`/family/members/${memberId}/visit/${appointmentId}`);
  return done(memberId, error ? say(error) : null);
}

// ── the growth chart's one question ──────────────────────────────────────────

export async function setMemberSexAction(memberId: string, sex: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(memberId) || (sex !== "female" && sex !== "male")) return { error: "Choose girl or boy." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").update({ sex }).eq("id", memberId).select("id");
  if (!error && (!data || data.length === 0)) return { error: "Only the child's own grown-ups can set this." };
  return done(memberId, error ? say(error) : null);
}
