import { FAMILY_TZ, familyDay } from "@/lib/time";

/** Today's plan as something to be heard, not read: what the "Today in Kin"
 * Shortcut fetches and the iPhone speaks aloud with its own voice. Plain
 * sentences, times the way a person says them ("3:30 PM", "9 AM"), all-day
 * things first, then what is still to come, and only a count of what is
 * already past -- nobody at 4 PM wants the morning read back to them.
 *
 * The rows are what today_brief() returns (the member's calendar-link scope);
 * this picks today's occurrences of the repeating ones. */

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

export function buildBrief(fullName: string, items: BriefItem[], now: Date = new Date(), tz: string = FAMILY_TZ): string {
  const today = familyDay(now, tz);
  const first = fullName.trim().split(/\s+/)[0] || "there";
  const dateSaid = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);

  const allDay = items.filter((i) => allDayToday(i, today)).map((i) => clean(i.title));
  const timed = items
    .map((i) => ({ i, at: timedToday(i, today, tz) }))
    .filter((x): x is { i: BriefItem; at: Date } => x.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  // Still to come: not yet started, or started within the last half hour.
  const upcoming = timed.filter((x) => x.at.getTime() >= now.getTime() - 30 * 60_000);
  const earlier = timed.length - upcoming.length;

  const lines = [`${greeting(now, tz)}, ${first}. It's ${dateSaid}.`];
  if (allDay.length === 0 && timed.length === 0) {
    lines.push("There's nothing on the calendar today.");
  } else {
    if (allDay.length > 0) lines.push(`Today: ${allDay.join(", and ")}.`);
    if (upcoming.length > 0) {
      lines.push(upcoming.length === 1 ? "One thing still to come." : `${upcoming.length} things still to come.`);
      for (const { i, at } of upcoming) {
        lines.push(`At ${spokenTime(at, tz)}, ${clean(i.title)}${i.location ? `, at ${clean(i.location)}` : ""}.`);
      }
    } else if (timed.length > 0) {
      lines.push("Everything with a time today is already behind you.");
    }
    if (earlier > 0 && upcoming.length > 0) lines.push(earlier === 1 ? "One more was earlier today." : `${earlier} more were earlier today.`);
  }
  lines.push("That's everything. Have a good day.");
  return lines.join("\n");
}
