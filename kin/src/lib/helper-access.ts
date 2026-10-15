import { addDays, familyDay, weekdayOf } from "@/lib/time";
import { MEAL_SLOTS, MEAL_SLOT_LABEL, type MealSlot } from "@/lib/recipes";

/** Helper access for the kasambahay, yaya or driver (20261015121000).
 *
 * A helper is not a member of the household. The database gives them three
 * things through its own functions -- the open To-Buy list, today's and
 * tomorrow's meals, and the children's plans for those two days -- each behind
 * a switch the grown-ups set. This file is the arithmetic around those: the
 * link, the code, and which day each plan falls on. */

/** Where the helper link's code waits while the person signs up or signs in
 * (app/helper/join). Separate from the household invite's "kin-invite". */
export const HELPER_INVITE_COOKIE = "kin-helper-invite";

/** The three switches, in the order the screens list them. */
export type HelperSwitches = { list: boolean; meals: boolean; kids: boolean };

export const HELPER_SWITCH_LABEL: Record<keyof HelperSwitches, string> = {
  list: "To-Buy list",
  meals: "Meals",
  kids: "Children's plans",
};

/** A helper code as typed or scanned: ten characters, no 0/O or 1/I. Spaces,
 * dashes and lower case are forgiven; anything else is not a code. */
export function normaliseHelperCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return /^[A-HJ-NP-Z2-9]{10}$/.test(code) ? code : null;
}

/** What a helper may see, in a few words, for Settings. */
export function switchesSummary(s: HelperSwitches): string {
  const on = (Object.keys(HELPER_SWITCH_LABEL) as (keyof HelperSwitches)[]).filter((k) => s[k]).map((k) => HELPER_SWITCH_LABEL[k]);
  if (on.length === 0) return "Sees nothing yet";
  return on.join(" · ");
}

/** "Today" or "Tomorrow", the only two days a helper's screen shows. */
export type HelperDay = "today" | "tomorrow";

export type HelperMealRow = { plan_date: string; slot: string; dish: string; meal_position: number };
export type HelperMeal = { slot: string; label: string; dish: string };

/** Today's and tomorrow's meals, each day in the order the meals happen. */
export function mealsForTwoDays(rows: HelperMealRow[], today: string): Record<HelperDay, HelperMeal[]> {
  const tomorrow = addDays(today, 1);
  const order = (slot: string) => {
    const i = MEAL_SLOTS.indexOf(slot as MealSlot);
    return i === -1 ? MEAL_SLOTS.length : i;
  };
  const pick = (day: string | null) =>
    rows
      .filter((r) => r.plan_date === day)
      .sort((a, b) => order(a.slot) - order(b.slot) || a.meal_position - b.meal_position)
      .map((r) => ({ slot: r.slot, label: MEAL_SLOT_LABEL[r.slot as MealSlot] ?? r.slot, dish: r.dish }));
  return { today: pick(today), tomorrow: pick(tomorrow) };
}

export type HelperPlanRow = {
  title: string;
  start_at: string;
  end_at: string | null;
  repeat: string | null;
  repeat_days?: number[] | null;
  repeat_until?: string | null;
  place: string | null;
  children: string[];
};
export type HelperPlan = { day: HelperDay; title: string; at: Date; endAt: Date | null; place: string | null; children: string[] };

const DAY_MS = 86_400_000;

/** Does a plan that started on `first` fall on `day`? Once, weekly, monthly
 * or yearly -- the Planner's four repeats -- with a weekly one's chosen days
 * and any repeat's last day (20261014120000), read as that change's
 * lib/activity-repeat.ts reads them: no days chosen means the first day's own
 * weekday, no last day means it never ends. */
function fallsOn(r: HelperPlanRow, first: string, day: string): boolean {
  if (day < first) return false;
  const repeat = r.repeat ?? "once";
  if (!["weekly", "monthly", "yearly"].includes(repeat)) return day === first;
  if (r.repeat_until && day > r.repeat_until) return false;
  if (repeat === "weekly") {
    const chosen = (r.repeat_days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    const wd = weekdayOf(day);
    return wd !== null && (chosen.length ? chosen.includes(wd) : wd === weekdayOf(first));
  }
  if (repeat === "monthly") return day.slice(8) === first.slice(8);
  return day.slice(5) === first.slice(5);
}

/** The children's plans for today and tomorrow, in time order. The database
 * sends every repeating plan that has started; this picks the days it lands
 * on and moves it there, keeping its wall-clock time (the household's zone
 * is shifted by whole days, as brief.ts does). */
export function plansForTwoDays(rows: HelperPlanRow[], now: Date, tz: string): HelperPlan[] {
  const today = familyDay(now, tz);
  const tomorrow = addDays(today, 1);
  const out: HelperPlan[] = [];
  for (const r of rows) {
    const start = new Date(r.start_at);
    if (Number.isNaN(start.getTime())) continue;
    const first = familyDay(start, tz);
    const end = r.end_at ? new Date(r.end_at) : null;
    for (const [label, day] of [["today", today], ["tomorrow", tomorrow]] as const) {
      if (!day || !fallsOn(r, first, day)) continue;
      const shift = Math.round((Date.parse(day) - Date.parse(first)) / DAY_MS) * DAY_MS;
      out.push({
        day: label,
        title: r.title,
        at: new Date(start.getTime() + shift),
        endAt: end && !Number.isNaN(end.getTime()) ? new Date(end.getTime() + shift) : null,
        place: r.place?.trim() || null,
        children: r.children,
      });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime() || a.title.localeCompare(b.title));
}

/** "Ana", "Ana and Ben", "Ana, Ben and Cara". */
export function namesSaid(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What the helper's own page should do with a signed-in person who is not a
 * member anywhere: claim a waiting link first, then show the households they
 * help, else send them on to set up their own Kin. Members never reach this
 * (member first: their Kin is the household's, with a link to /helper from
 * Settings). */
export function helperLanding(opts: { hasInviteCookie: boolean; helps: number }): "accept" | "helper" | "onboarding" {
  if (opts.hasInviteCookie) return "accept";
  if (opts.helps > 0) return "helper";
  return "onboarding";
}
