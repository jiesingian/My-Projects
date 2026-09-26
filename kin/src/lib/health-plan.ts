/** The Health tab's "what needs doing" arithmetic, kept free of the database
 * so it can be tested on its own (e2e/health-plan.logic.spec.ts). */

export type Medicine = { id: string; member_id: string; name: string; dose: string | null; times: string[]; start_date: string; end_date: string | null };
export type Dose = { medicine_id: string; dose_date: string; dose_time: string };
export type DueDose = { medicineId: string; memberId: string; name: string; dose: string | null; time: string; taken: boolean; late: boolean };

/** Is the medicine being taken on this day? */
export function activeOn(m: Pick<Medicine, "start_date" | "end_date">, day: string): boolean {
  return m.start_date <= day && (m.end_date === null || m.end_date >= day);
}

/** Every scheduled dose for a day, in time order, with whether it was ticked
 * and whether it is past its time (an hour's grace) without being ticked.
 * `now` is "HH:MM" in the family's time zone, or null for a day that is not
 * today (then nothing is late yet, or everything untaken was, for a past day). */
export function dosesFor(medicines: Medicine[], doses: Dose[], day: string, now: string | null, past = false): DueDose[] {
  const taken = new Set(doses.filter((d) => d.dose_date === day).map((d) => `${d.medicine_id}|${d.dose_time}`));
  const out: DueDose[] = [];
  for (const m of medicines) {
    if (!activeOn(m, day)) continue;
    for (const time of [...m.times].sort()) {
      const isTaken = taken.has(`${m.id}|${time}`);
      const late = !isTaken && (past || (now !== null && minutes(now) - minutes(time) > 60));
      out.push({ medicineId: m.id, memberId: m.member_id, name: m.name, dose: m.dose, time, taken: isTaken, late });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "08:00, 20:00" typed any reasonable way: "8am, 8pm", "8:00 20:00",
 * "0800". Anything unreadable is left out; duplicates collapse. */
export function parseTimes(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/[,;\s]+(?![ap]\.?m)/i)) {
    const t = raw.trim().toLowerCase().replace(/\./g, "");
    if (!t) continue;
    const m = t.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/);
    if (!m) continue;
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    out.add(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return [...out].sort().slice(0, 8);
}

/** A reading of 38.0 °C or more is a fever. */
export const FEVER_C = 38;

/** Is the latest blood pressure high (140/90 or over)? "120/80" style. */
export function highBloodPressure(value: string): boolean {
  const m = value.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return !!m && (Number(m[1]) >= 140 || Number(m[2]) >= 90);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
