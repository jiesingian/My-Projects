import { householdZone } from "@/lib/household-zone";
import { createClient } from "@/lib/supabase/server";
import { familyInstant, familyClock } from "@/lib/time";
import { expandRoutine, type RoutineRule } from "@/lib/routines";
import { clashes, DEFAULT_MINUTES, type ClashPlan } from "@/lib/clash";

export type Clash = { title: string; time: string; who: string };
export type ClashReport = { clashes: Clash[]; sameDay: string[] };

type Named = { member_id: string; members?: unknown };
const namesOf = (rows: Named[] | null | undefined) =>
  (rows ?? []).map((r) => ({ id: r.member_id, name: ((r.members as { full_name?: string } | null)?.full_name ?? "").split(" ")[0] }));

/** What a plan on `date` from `from` to `to`, for these people, would run
 * into: the one-off plans and timed routines it overlaps for someone it
 * involves, and the all-day events that day (a reminder, never a block).
 * lib/clash.ts decides what counts. `excludeId` is the plan being edited. */
export async function findClashes(
  familyId: string,
  input: { date: string; from: string; to: string; wholeFamily: boolean; who: string[]; excludeId?: string },
): Promise<ClashReport> {
  const tz = await householdZone();
  const startAt = familyInstant(input.date, input.from || "09:00", tz);
  if (!startAt) return { clashes: [], sameDay: [] };
  const endAt = (input.to && familyInstant(input.date, input.to, tz)) || new Date(startAt.getTime() + DEFAULT_MINUTES * 60_000);
  const mine: ClashPlan = { start: startAt.getTime(), end: Math.max(endAt.getTime(), startAt.getTime() + 60_000), wholeFamily: input.wholeFamily, memberIds: input.wholeFamily ? [] : input.who };

  const supabase = await createClient();
  const day = 86_400_000;
  const [{ data: activities }, { data: routines }, { data: events }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, title, start_at, end_at, status, applies_to_whole_family, activity_members(member_id, members(full_name))")
      .eq("family_id", familyId)
      .gte("start_at", new Date(startAt.getTime() - day).toISOString())
      .lt("start_at", new Date(endAt.getTime() + day).toISOString()),
    supabase
      .from("routines")
      .select("id, title, kind, time_of_day, freq, repeat_interval, byweekday, bymonthday, start_date, end_date, paused, applies_to_whole_family, routine_members(member_id, members(full_name))")
      .eq("family_id", familyId)
      .not("time_of_day", "is", null)
      .lte("start_date", input.date)
      .or(`end_date.is.null,end_date.gte.${input.date}`),
    supabase
      .from("events")
      .select("title, event_date, end_date, recurs_yearly, applies_to_whole_family, event_members(member_id)")
      .eq("family_id", familyId)
      .or(`event_date.eq.${input.date},recurs_yearly.eq.true,and(event_date.lt.${input.date},end_date.gte.${input.date})`),
  ]);

  const found: Clash[] = [];
  const whoOf = (whole: boolean, people: { name: string }[]) => (whole || people.length === 0 ? "Whole family" : people.map((p) => p.name).join(", "));

  for (const a of activities ?? []) {
    if (a.id === input.excludeId || a.status === "cancelled" || a.status === "completed") continue;
    const s = new Date(a.start_at).getTime();
    const e = a.end_at ? new Date(a.end_at).getTime() : s + DEFAULT_MINUTES * 60_000;
    const people = namesOf(a.activity_members);
    if (!clashes(mine, { start: s, end: e, wholeFamily: a.applies_to_whole_family, memberIds: people.map((p) => p.id) })) continue;
    found.push({ title: a.title, time: `${familyClock(new Date(s), tz)}${a.end_at ? `–${familyClock(new Date(e), tz)}` : ""}`, who: whoOf(a.applies_to_whole_family, people) });
  }

  // Timed routines that come round that day (Mass, a class) -- not the
  // chores, which fit round everything.
  const dayStart = new Date(`${input.date}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + day);
  for (const r of routines ?? []) {
    if (r.paused || r.kind === "chore" || !r.time_of_day) continue;
    const rule: RoutineRule = { freq: r.freq as RoutineRule["freq"], repeat_interval: r.repeat_interval, byweekday: r.byweekday ?? [], bymonthday: r.bymonthday, start_date: r.start_date, end_date: r.end_date };
    if (expandRoutine(rule, dayStart, dayEnd).length === 0) continue;
    const at = familyInstant(input.date, r.time_of_day.slice(0, 5), tz);
    if (!at) continue;
    const people = namesOf(r.routine_members);
    const plan: ClashPlan = { start: at.getTime(), end: at.getTime() + DEFAULT_MINUTES * 60_000, wholeFamily: r.applies_to_whole_family, memberIds: people.map((p) => p.id) };
    if (!clashes(mine, plan)) continue;
    found.push({ title: r.title, time: familyClock(at, tz), who: whoOf(r.applies_to_whole_family, people) });
  }

  // All-day events that day, for the people involved: a reminder only.
  const md = input.date.slice(5);
  const sameDay = (events ?? [])
    .filter((e) => (e.recurs_yearly ? e.event_date.slice(5) === md : true))
    .filter((e) => {
      const tagged = (e.event_members ?? []).map((m) => m.member_id);
      return clashes(mine, { start: mine.start, end: mine.end, wholeFamily: e.applies_to_whole_family, memberIds: tagged });
    })
    .map((e) => e.title);

  return { clashes: found, sameDay: [...new Set(sameDay)] };
}
