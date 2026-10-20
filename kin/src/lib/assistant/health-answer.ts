/** The 2 a.m. question (#699): "Ano ang allergy ni Lia?", "What is Dad's
 * blood type?", "Anong gamot ni Lolo ngayon?" -- asked of Ask Kin and
 * answered from what Health already holds, the way the emergency card and
 * the doctor-visit sheet gather it.
 *
 * Pure: the rows come in, a compact object goes out for the model to read
 * from. Who may ask is decided here too. Every row was read as the asker
 * through row-level security, so a medicine or reading kept "parents only"
 * or private by someone else is simply not in the rows. */

import { activeOn } from "@/lib/health-plan";
import { isGrownUp } from "@/lib/roles";
import { guideApplies, vaccineGuide } from "@/lib/vaccine-schedule";
import { recentIllness, recentVitals, vaccineLines, type IllnessLog, type Vital } from "@/lib/visit-sheet";

/** Grown-ups only (Jonathan, 20 October): a parent or adult who is not in
 * kid view. A child asking about themself uses their own Health page; the
 * assistant does not answer health questions for children at all. */
export function mayAskHealth(viewer: { role: string; kidView: boolean }): boolean {
  return !viewer.kidView && isGrownUp(viewer.role);
}

export type HealthRows = {
  member: {
    full_name: string;
    role: string;
    dob: string | null;
    blood_type: string | null;
    allergies: string | null;
    physician_name: string | null;
    insurance_info: string | null;
    philhealth_number: string | null;
  };
  medicines: { name: string; dose: string | null; times: string[]; start_date: string; end_date: string | null; notes: string | null }[];
  conditions: { name: string; status: string; meta_note: string | null; health_condition_entries?: { entry_date: string }[] | null }[];
  vitals: Vital[];
  illness: IllnessLog[];
  labs: { name: string; result: string | null; flag: string | null; test_date: string }[];
  /** Who a hospital rings: the other grown-ups with a number, then the
   * household's emergency contacts, in that order. */
  calls: { name: string; relationship: string; phone: string }[];
  /** Health checks due or due soon for this person. */
  checks: { what: string; when_date: string | null; status: string }[];
  /** Open questions for the next doctor's visit. */
  questions: string[];
  /** YYYY-MM-DD in the household's zone. */
  today: string;
  /** An instant to the household's day. */
  dayOf: (iso: string) => string;
};

/** What the model gets. Short labels, plain values, "none recorded" said
 * outright so the model does not fill a blank with a guess. */
export function healthAnswer(rows: HealthRows): Record<string, unknown> {
  const { member, today } = rows;
  const medicines = rows.medicines
    .filter((m) => activeOn(m, today))
    .map((m) => ({
      name: m.name,
      dose: m.dose?.trim() || null,
      times: m.times.length ? m.times : "as needed",
      ...(m.notes?.trim() ? { notes: m.notes.trim() } : {}),
    }));
  const conditions = rows.conditions
    .filter((c) => c.status !== "routine" && !/resolved|past|healed/i.test(c.status))
    .map((c) => `${c.name}${c.meta_note ? ` (${c.meta_note})` : ""}`);
  const vitals = recentVitals(rows.vitals, today).map((v) => `${v.label}: ${v.latest} on ${v.on}${v.earlier.length ? `; earlier ${v.earlier.join(", ")}` : ""}`);
  const illness = recentIllness(rows.illness, today, rows.dayOf).map((l) => `${l.day}: ${l.text}`);
  const labs = rows.labs.map((l) => `${l.name}: ${l.result ?? "result not recorded"}${l.flag ? ` (${l.flag})` : ""}, ${l.test_date}`);
  const vaccines =
    guideApplies(member.role, member.dob, today) && member.dob
      ? vaccineLines(
          vaccineGuide(
            member.dob,
            rows.conditions.filter((c) => c.status === "routine").map((c) => ({ name: c.name, dates: (c.health_condition_entries ?? []).map((e) => e.entry_date) })),
            today,
          ),
        )
      : null;

  return {
    who: member.full_name,
    born: member.dob,
    allergies: member.allergies?.trim() || "none recorded",
    blood_type: member.blood_type?.trim() || "not recorded",
    medicines_now: medicines.length ? medicines : "none being taken",
    conditions: conditions.length ? conditions : "none recorded",
    hmo_or_insurance: member.insurance_info?.trim() || "not recorded",
    philhealth: member.philhealth_number?.trim() || "not recorded",
    usual_doctor: member.physician_name?.trim() || "not recorded",
    who_to_call: rows.calls.length ? rows.calls : "nobody with a number recorded",
    health_checks_due: rows.checks.length ? rows.checks : "none due",
    recent_readings_90_days: vitals.length ? vitals : "none",
    recent_illness_60_days: illness.length ? illness : "nothing logged",
    lab_results_6_months: labs.length ? labs : "none",
    ...(vaccines ? { vaccines_due_now: vaccines.dueNow.length ? vaccines.dueNow : "none due", vaccines_given: vaccines.given.length ? vaccines.given : "none recorded" } : {}),
    questions_for_the_doctor: rows.questions.length ? rows.questions : "none written down",
    note: "Read as the person asking: records kept parents-only or private by someone else are not here. Blood type, allergies, doctor and HMO are on the profile; the rest is in Health.",
  };
}
