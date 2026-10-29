import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { isGrownUp } from "@/lib/roles";
import { openSchoolToday } from "@/lib/school";
import type { RoutineFreq } from "@/lib/routines";
import { NoClassesButton } from "@/components/no-classes-button";

/** On a school day, for a grown-up: one line offering "No classes today",
 * which skips the day's class days and pickups (a class suspension, a
 * typhoon, a holiday the calendar didn't know). Its own fetch, like
 * HolidayLine; nothing shows on a day with no school routines left open. */
export async function NoClassesToday() {
  const me = await getCurrentMember();
  if (!me || !isGrownUp(me.role)) return null;
  const supabase = await createClient();
  const day = familyDay(new Date(), await householdZone());
  const [{ data: routines }, { data: logs }] = await Promise.all([
    supabase.from("routines").select("id, title, kind, freq, repeat_interval, byweekday, bymonthday, start_date, end_date").eq("family_id", me.family_id).eq("kind", "school"),
    supabase.from("routine_log").select("routine_id").eq("family_id", me.family_id).eq("occurrence_date", day),
  ]);
  const open = openSchoolToday(
    (routines ?? []).map((r) => ({ ...r, freq: r.freq as RoutineFreq, byweekday: r.byweekday ?? [] })),
    new Set((logs ?? []).map((l) => l.routine_id)),
    day,
  );
  if (open.length === 0) return null;
  const names = [...new Set(open.map((r) => r.title))].slice(0, 3).join(", ");
  return <NoClassesButton names={names} />;
}
