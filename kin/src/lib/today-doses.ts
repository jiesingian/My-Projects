import { minutes, type DueDose } from "@/lib/health-plan";
import { formatTimeOfDay } from "@/lib/routines";

/** Medicines on Today's list (Jonathan, 23 October): one row per person and
 * medicine for the reader and the people they give medicine to -- their
 * own, and a grown-up's children, as far as Health lets them see (the same
 * people the dose push reaches, 20260926140000_reminders.sql). The row
 * carries the next dose to take, ticked on the row; it sinks once every
 * dose of the day is taken. The reader's own used to be a tile only, so a
 * dose was the one thing due today that Today never listed. */
export type TodayDose = {
  /** `dose-<medicineId>`: one row per medicine, whoever it is for. */
  id: string;
  medicineId: string;
  memberId: string;
  /** The person's first name, or null for the reader's own. */
  who: string | null;
  name: string;
  dose: string | null;
  /** Today's dose times, in order, and the ones already ticked. */
  times: string[];
  taken: string[];
  /** The next dose still to take, or null once all are. */
  next: string | null;
  /** The next one is more than an hour past its time (lib/health-plan). */
  late: boolean;
  href: string;
};

/** Rows from Health's own dose list (dosesFor), grouped by medicine. `who`
 * names the person for everyone but the reader. */
export function doseRows(due: DueDose[], who: (memberId: string) => string | null): TodayDose[] {
  const byMedicine = new Map<string, DueDose[]>();
  for (const d of due) byMedicine.set(d.medicineId, [...(byMedicine.get(d.medicineId) ?? []), d]);
  const rows: TodayDose[] = [];
  for (const [medicineId, doses] of byMedicine) {
    const first = doses[0];
    const next = doses.find((d) => !d.taken) ?? null;
    rows.push({
      id: `dose-${medicineId}`,
      medicineId,
      memberId: first.memberId,
      who: who(first.memberId),
      name: first.name,
      dose: first.dose,
      times: doses.map((d) => d.time),
      taken: doses.filter((d) => d.taken).map((d) => d.time),
      next: next?.time ?? null,
      late: !!next?.late,
      href: `/family/members/${first.memberId}?view=health&seg=medicines`,
    });
  }
  return rows;
}

/** "Erynne · Clindamycin", or just the medicine for the reader's own. */
export function doseTitle(row: TodayDose): string {
  return row.who ? `${row.who} · ${row.name}` : row.name;
}

/** The row's second line: "7:00 am · late · 1 of 4 taken", "7:00 pm · next ·
 * 2 of 4 taken", "4 of 4 taken". The amount rides along when there is one. */
export function doseMeta(row: TodayDose): string {
  const ofTotal = `${row.taken.length} of ${row.times.length} taken`;
  const parts = row.next ? [formatTimeOfDay(row.next), row.late ? "late" : "next", ofTotal] : [ofTotal];
  if (row.dose) parts.push(row.dose);
  return parts.filter(Boolean).join(" · ");
}

/** Minutes into the day of the next dose, for Today's ordering; -1 once all
 * are taken (the row has sunk, and the order among sunk rows is by name). */
export function doseAt(row: TodayDose): number {
  return row.next ? minutes(row.next) : -1;
}
