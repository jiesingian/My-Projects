import { FAMILY_TZ, familyDay, familyInstant } from "@/lib/time";
import { assigneeFor, expandRoutine, parseISODate, type RoutineFreq } from "@/lib/routines";

/** Today's plan as something to be heard, not read: what the "Today in Kin"
 * Shortcut fetches and the iPhone speaks aloud with its own voice. Plain
 * sentences, times the way a person says them ("3:30 PM", "9 AM"), all-day
 * things first, then what is still to come, and only a count of what is
 * already past -- nobody at 4 PM wants the morning read back to them.
 *
 * The rows are what today_brief() returns (the member's calendar-link scope,
 * plus chores and routines and, for grown-ups, what is running low); this
 * picks today's occurrences of the repeating ones and whose turn it is. */

export type BriefItem = {
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  all_day: string | null;
  all_day_end: string | null;
  yearly: boolean;
  repeat: string | null;
  location: string | null;
};

/** A chore or routine as today_brief() returns it. */
export type BriefRoutine = {
  title: string;
  freq: RoutineFreq;
  repeat_interval: number;
  byweekday: number[];
  bymonthday: number | null;
  start_date: string;
  end_date: string | null;
  time_of_day: string | null;
  location: string | null;
  whole_family: boolean;
  rotate: boolean;
  members: string[];
  /** Days (YYYY-MM-DD) around today already marked done or skipped. */
  logged: string[];
};

export type BriefExtras = { me?: string; routines?: BriefRoutine[]; low?: string[] };

/** Today's chores and routines that are still this member's to do: falling
 * today, not yet marked done or skipped, and theirs -- the whole family's,
 * nobody's in particular, assigned to them, or their turn on a rota. */
export function routinesToday(routines: BriefRoutine[], me: string | undefined, today: string): { title: string; time: string | null; location: string | null }[] {
  const day = parseISODate(today);
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const out: { title: string; time: string | null; location: string | null }[] = [];
  for (const r of routines) {
    if (r.logged.includes(today)) continue;
    const occ = expandRoutine({ freq: r.freq, repeat_interval: r.repeat_interval, byweekday: r.byweekday, bymonthday: r.bymonthday, start_date: r.start_date, end_date: r.end_date }, day, next)[0];
    if (!occ) continue;
    const mine =
      r.whole_family || r.members.length === 0 || (r.rotate ? assigneeFor(r.members, occ.index) === me : me !== undefined && r.members.includes(me));
    if (mine) out.push({ title: r.title, time: r.time_of_day ? r.time_of_day.slice(0, 5) : null, location: r.location });
  }
  return out;
}

const listSaid = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const dayParts = (day: string) => day.split("-").map(Number) as [number, number, number];

/** Does a timed task happen today, and at what instant? */
function timedToday(item: BriefItem, today: string, tz: string): Date | null {
  if (!item.starts_at) return null;
  const start = new Date(item.starts_at);
  if (Number.isNaN(start.getTime())) return null;
  const first = familyDay(start, tz);
  if (first > today) return null;
  const [, fm, fd] = dayParts(first);
  const [, tm, td] = dayParts(today);
  const ok =
    item.repeat === "weekly"
      ? Math.round((Date.parse(today) - Date.parse(first)) / 86_400_000) % 7 === 0
      : item.repeat === "monthly"
        ? fd === td
        : item.repeat === "yearly"
          ? fm === tm && fd === td
          : first === today;
  if (!ok) return null;
  // Same wall-clock time, moved to today. The family's zone has no daylight
  // saving, so shifting by whole days keeps the time right.
  const days = Math.round((Date.parse(today) - Date.parse(first)) / 86_400_000);
  return new Date(start.getTime() + days * 86_400_000);
}

function allDayToday(item: BriefItem, today: string): boolean {
  if (!item.all_day) return false;
  if (item.yearly) return item.all_day.slice(5) === today.slice(5) && item.all_day <= today;
  return item.all_day <= today && today <= (item.all_day_end ?? item.all_day);
}

/** "9 AM", "3:30 PM": how the time is said, in the family's zone. */
export function spokenTime(at: Date, tz: string = FAMILY_TZ): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(at);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const period = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toUpperCase();
  return minute === "00" ? `${hour} ${period}` : `${hour}:${minute} ${period}`;
}

function greeting(now: Date, tz: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");

export function buildBrief(fullName: string, items: BriefItem[], now: Date = new Date(), tz: string = FAMILY_TZ, extras: BriefExtras = {}): string {
  const today = familyDay(now, tz);
  const first = fullName.trim().split(/\s+/)[0] || "there";
  const dateSaid = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);

  const allDay = items.filter((i) => allDayToday(i, today)).map((i) => clean(i.title));
  const chores = routinesToday(extras.routines ?? [], extras.me, today);
  const untimedChores = chores.filter((c) => !c.time).map((c) => clean(c.title));
  const low = (extras.low ?? []).map(clean).filter(Boolean);
  const timed = [
    ...items.map((i) => ({ title: i.title, location: i.location, at: timedToday(i, today, tz) })),
    ...chores.filter((c) => c.time).map((c) => ({ title: c.title, location: c.location, at: familyInstant(today, c.time!, tz) })),
  ]
    .filter((x): x is { title: string; location: string | null; at: Date } => x.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  // Still to come: not yet started, or started within the last half hour.
  const upcoming = timed.filter((x) => x.at.getTime() >= now.getTime() - 30 * 60_000);
  const earlier = timed.length - upcoming.length;

  const lines = [`${greeting(now, tz)}, ${first}. It's ${dateSaid}.`];
  if (allDay.length === 0 && timed.length === 0 && untimedChores.length === 0) {
    lines.push("There's nothing on the calendar today.");
  } else {
    if (allDay.length > 0) lines.push(`Today: ${allDay.join(", and ")}.`);
    if (upcoming.length > 0) {
      lines.push(upcoming.length === 1 ? "One thing still to come." : `${upcoming.length} things still to come.`);
      for (const { title, location, at } of upcoming) {
        lines.push(`At ${spokenTime(at, tz)}, ${clean(title)}${location ? `, at ${clean(location)}` : ""}.`);
      }
    } else if (timed.length > 0) {
      lines.push("Everything with a time today is already behind you.");
    }
    if (earlier > 0 && upcoming.length > 0) lines.push(earlier === 1 ? "One more was earlier today." : `${earlier} more were earlier today.`);
    if (untimedChores.length > 0) lines.push(`Chores to do: ${listSaid(untimedChores)}.`);
  }
  if (low.length > 0) lines.push(`Running low: ${listSaid(low)}.`);
  lines.push("That's everything. Have a good day.");
  return lines.join("\n");
}
