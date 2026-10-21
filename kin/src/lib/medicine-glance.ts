import type { DueDose } from "@/lib/health-plan";
import { formatTimeOfDay } from "@/lib/routines";

/** Today's "At a glance" medicine tile (Janine, 21 October): the reader's
 * own doses today, from the same rules Health uses (lib/health-plan
 * dosesFor). A late dose comes first and takes the warning tint; then the
 * next one to take; then all taken. No dose today: nothing to remind. */
export function medicineGlance(due: DueDose[]): { value: string; label: string; warn: boolean } {
  if (due.length === 0) return { value: "No medicines", label: "none to take today", warn: false };
  const taken = due.filter((d) => d.taken).length;
  const late = due.filter((d) => d.late);
  const ofTotal = `${taken} of ${due.length} taken`;
  if (late.length > 0) return { value: `${late.length} dose${late.length === 1 ? "" : "s"} late`, label: `${late[0].name} · ${ofTotal}`, warn: true };
  const next = due.find((d) => !d.taken);
  if (next) return { value: `${next.name} ${formatTimeOfDay(next.time)}`, label: `next · ${ofTotal}`, warn: false };
  return { value: "All taken ✓", label: `${due.length} dose${due.length === 1 ? "" : "s"} today`, warn: false };
}
