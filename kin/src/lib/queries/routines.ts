import { createClient } from "@/lib/supabase/server";
import { assigneeFor, currentStreak, expandRoutine, nextOccurrence, toISODate, type RoutineRule } from "@/lib/routines";

export type RoutineMember = { id: string; name: string };

export type RoutineView = {
  id: string;
  title: string;
  kind: string;
  rule: RoutineRule;
  timeOfDay: string | null;
  location: string | null;
  notes: string | null;
  appliesToAll: boolean;
  rotates: boolean;
  paused: boolean;
  reminderMinutes: number | null;
  expectedCost: number | null;
  costAccountId: string | null;
  members: RoutineMember[];
  /** The next time it comes round, or null once it has run out. */
  next: Date | null;
  /** Today's occurrence, when there is one, with whose turn it is and
   * whether it has been answered for. */
  today: { date: string; assignee: RoutineMember | null; status: "done" | "skipped" | null } | null;
  streak: number;
  /** Recent history, newest first, for the small activity trail on the row. */
  recent: { date: string; status: "done" | "skipped" }[];
};

/** How far back the streak and history look. Long enough for a fortnightly
 * routine to show a meaningful run, short enough to stay one cheap query. */
const HISTORY_DAYS = 180;

export async function getRoutines(familyId: string, memberId?: string): Promise<RoutineView[]> {
  const supabase = await createClient();
  const today = new Date();
  const historyStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - HISTORY_DAYS);

  const [{ data: rows }, { data: logs }] = await Promise.all([
    supabase
      .from("routines")
      .select("*, routine_members(member_id, position, members(id, full_name))")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("routine_log")
      .select("routine_id, occurrence_date, status")
      .eq("family_id", familyId)
      .gte("occurrence_date", toISODate(historyStart))
      .order("occurrence_date", { ascending: false }),
  ]);

  const logByRoutine = new Map<string, Map<string, "done" | "skipped">>();
  for (const l of logs ?? []) {
    const forRoutine = logByRoutine.get(l.routine_id) ?? new Map();
    forRoutine.set(l.occurrence_date, l.status as "done" | "skipped");
    logByRoutine.set(l.routine_id, forRoutine);
  }

  const views: RoutineView[] = [];

  for (const r of rows ?? []) {
    const members: RoutineMember[] = (r.routine_members ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((rm) => ({
        id: (rm.members as unknown as { id: string } | null)?.id ?? rm.member_id,
        name: (rm.members as unknown as { full_name: string } | null)?.full_name ?? "",
      }))
      .filter((m) => !!m.id);

    // A member filter hides routines that are nobody else's business, but
    // never anything the whole household is on for.
    if (memberId && !r.applies_to_whole_family && !members.some((m) => m.id === memberId)) continue;

    const rule: RoutineRule = {
      freq: r.freq as RoutineRule["freq"],
      repeat_interval: r.repeat_interval,
      byweekday: r.byweekday ?? [],
      bymonthday: r.bymonthday,
      start_date: r.start_date,
      end_date: r.end_date,
    };

    const status = logByRoutine.get(r.id) ?? new Map<string, "done" | "skipped">();
    const past = expandRoutine(rule, historyStart, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
    const todayISO = toISODate(today);
    const todaysOccurrence = past.find((o) => toISODate(o.date) === todayISO);

    views.push({
      id: r.id,
      title: r.title,
      kind: r.kind,
      rule,
      timeOfDay: r.time_of_day,
      location: r.location,
      notes: r.notes,
      appliesToAll: r.applies_to_whole_family,
      rotates: r.rotate_assignee,
      paused: r.paused,
      reminderMinutes: r.reminder_minutes,
      expectedCost: r.expected_cost ? Number(r.expected_cost) : null,
      costAccountId: r.cost_account_id,
      members,
      next: r.paused ? null : nextOccurrence(rule, today),
      today: todaysOccurrence
        ? {
            date: todayISO,
            assignee: r.rotate_assignee ? assigneeFor(members, todaysOccurrence.index) : null,
            status: status.get(todayISO) ?? null,
          }
        : null,
      streak: currentStreak(
        past.map((o) => o.date),
        status,
        today,
      ),
      recent: past
        .map((o) => toISODate(o.date))
        .filter((iso) => status.has(iso))
        .reverse()
        .slice(0, 8)
        .map((iso) => ({ date: iso, status: status.get(iso)! })),
    });
  }

  // Active first, then by when they next come round.
  return views.sort((a, b) => {
    if (a.paused !== b.paused) return a.paused ? 1 : -1;
    return (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity);
  });
}

/** Routines falling today, for the Today hub. */
export async function getRoutinesDueToday(familyId: string, memberId?: string) {
  const all = await getRoutines(familyId, memberId);
  return all.filter((r) => !r.paused && r.today);
}
