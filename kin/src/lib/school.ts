import { expandRoutine, parseISODate, type RoutineRule } from "@/lib/routines";

/** School life (29 October): class days and pickups are routines of kind
 * "school" (the Class days and School pickup templates). Pure, so Today and
 * the logic spec agree on which of them fall today and are still open. */

export type SchoolRoutine = RoutineRule & { id: string; title: string; kind: string };

/** The school routines that fall on `day` (YYYY-MM-DD) and nobody has
 * marked yet: what "No classes today" would skip. */
export function openSchoolToday(routines: SchoolRoutine[], logged: Set<string>, day: string): SchoolRoutine[] {
  const from = parseISODate(day);
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  return routines.filter((r) => r.kind === "school" && !logged.has(r.id) && expandRoutine(r, from, to).length > 0);
}
