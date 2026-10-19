/** The doctor-visit sheet: one page to bring to a check-up, gathered from
 * what Health already holds -- current medicines with doses, allergies, the
 * latest readings, recent illnesses, a child's vaccines -- plus the family's
 * questions to ask (health_visit_questions, 20261020002000).
 *
 * Pure functions, so what goes on the sheet can be tested without a
 * database. Each row was read as the viewer, so a reading kept "parents
 * only" or private is on it only for someone allowed to see it. */

import { addDays } from "@/lib/health-plan";
import { doseName, type GuideDose } from "@/lib/vaccine-schedule";

/** Who may open someone's sheet: the person themself, or a grown-up who is
 * not in kid view. Another child is refused. */
export function maySeeSheet(viewer: { id: string; role: string; kidView: boolean }, targetId: string): boolean {
  if (viewer.kidView) return false;
  if (viewer.id === targetId) return true;
  return viewer.role === "parent" || viewer.role === "adult";
}

export const VITAL_LABEL: Record<string, string> = {
  blood_pressure: "Blood pressure",
  weight: "Weight",
  length: "Height",
  height: "Height",
  heart_rate: "Heart rate",
  temperature: "Temperature",
  blood_sugar: "Blood sugar",
  glucose: "Blood sugar",
  oxygen: "Oxygen",
  sleep: "Sleep",
};

/** Readings a doctor does not ask for on a visit. */
const LEFT_OFF = new Set(["steps"]);

export type Vital = { vital_type: string; reading_date: string; value_text: string; unit: string };
export type VitalLine = { label: string; latest: string; on: string; earlier: string[] };

/** The latest reading of each kind from the last `days` days, and up to two
 * before it, so a trend shows ("128/84, earlier 135/88, 140/90"). */
export function recentVitals(vitals: Vital[], today: string, days = 90): VitalLine[] {
  const since = addDays(today, -days);
  const byType = new Map<string, Vital[]>();
  for (const v of vitals) {
    if (LEFT_OFF.has(v.vital_type) || v.reading_date < since || v.reading_date > today) continue;
    byType.set(v.vital_type, [...(byType.get(v.vital_type) ?? []), v]);
  }
  const fmt = (v: Vital) => `${v.value_text}${v.unit ? ` ${v.unit}` : ""}`;
  return [...byType.entries()]
    .map(([type, rows]) => {
      const sorted = [...rows].sort((a, b) => b.reading_date.localeCompare(a.reading_date));
      return { label: VITAL_LABEL[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), latest: fmt(sorted[0]), on: sorted[0].reading_date, earlier: sorted.slice(1, 3).map(fmt) };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type IllnessLog = { logged_at: string; temperature_c: number | null; symptoms: string | null; given: string | null; note: string | null };
export type IllnessLine = { day: string; text: string };

/** Illness log entries from the last `days` days, newest first, each in one
 * line: "38.6 °C · cough, runny nose · gave paracetamol". */
export function recentIllness(logs: IllnessLog[], today: string, dayOf: (iso: string) => string, days = 60): IllnessLine[] {
  const since = addDays(today, -days);
  return logs
    .map((l) => ({ l, day: dayOf(l.logged_at) }))
    .filter(({ day }) => day >= since && day <= today)
    .sort((a, b) => b.l.logged_at.localeCompare(a.l.logged_at))
    .map(({ l, day }) => ({
      day,
      text: [l.temperature_c != null ? `${Number(l.temperature_c).toFixed(1)} °C` : null, l.symptoms?.trim() || null, l.given?.trim() ? `gave ${l.given.trim()}` : null, l.note?.trim() || null]
        .filter(Boolean)
        .join(" · "),
    }))
    .filter((x) => x.text);
}

/** A child's vaccines for the sheet: what is recorded as given, and what is
 * due or overdue now -- the things a paediatrician asks about. */
export function vaccineLines(guide: GuideDose[]): { given: string[]; dueNow: string[] } {
  return {
    given: guide.filter((d) => d.status === "done").map((d) => `${doseName(d)}${d.givenOn ? ` (${d.givenOn})` : ""}`),
    dueNow: guide.filter((d) => d.status === "due" || d.status === "overdue").map((d) => `${doseName(d)}${d.status === "overdue" ? " (overdue)" : ""}`),
  };
}

/** A question as typed, made safe to keep: trimmed, one line, at most 300. */
export function cleanQuestion(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 300);
}

export type SheetText = {
  name: string;
  born: string | null;
  allergies: string | null;
  bloodType: string | null;
  doctor: string | null;
  medicines: string[];
  conditions: string[];
  vitals: VitalLine[];
  illness: IllnessLine[];
  labs: string[];
  vaccines: { given: string[]; dueNow: string[] } | null;
  questions: string[];
};

/** The sheet as plain text, for Share: a message to send the doctor's
 * secretary, or to paste into the clinic's form. */
export function sheetText(s: SheetText): string {
  const section = (title: string, lines: string[]) => (lines.length ? [``, title.toUpperCase(), ...lines.map((l) => `- ${l}`)] : []);
  return [
    `FOR THE DOCTOR: ${s.name}${s.born ? `, born ${s.born}` : ""}`,
    `Allergies: ${s.allergies?.trim() || "none recorded"}`,
    ...(s.bloodType ? [`Blood type: ${s.bloodType}`] : []),
    ...(s.doctor ? [`Usual doctor: ${s.doctor}`] : []),
    ...section("Medicines now", s.medicines),
    ...section("Conditions", s.conditions),
    ...section("Recent readings", s.vitals.map((v) => `${v.label}: ${v.latest} (${v.on})${v.earlier.length ? `; earlier ${v.earlier.join(", ")}` : ""}`)),
    ...section("Recent illness", s.illness.map((i) => `${i.day}: ${i.text}`)),
    ...section("Recent lab results", s.labs),
    ...(s.vaccines ? [...section("Vaccines given", s.vaccines.given), ...section("Vaccines due", s.vaccines.dueNow)] : []),
    ...section("Questions to ask", s.questions),
  ].join("\n");
}
