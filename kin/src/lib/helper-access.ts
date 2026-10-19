import { addDays, familyDay } from "@/lib/time";
import { occurrenceStarts } from "@/lib/activity-repeat";
import { MEAL_SLOTS, MEAL_SLOT_LABEL, type MealSlot } from "@/lib/recipes";

/** Helper access for the kasambahay, yaya or driver (20261015121000).
 *
 * A helper is not a member of the household. The database gives them three
 * things through its own functions -- the open To-Buy list, today's and
 * tomorrow's meals, and the family's plans for those two days -- each behind
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
  kids: "Family plans",
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
  /** For the whole family or tagged to nobody (20261019090000). */
  for_whole_family?: boolean;
};
export type HelperPlan = { day: HelperDay; title: string; at: Date; endAt: Date | null; place: string | null; children: string[]; forWholeFamily: boolean };

/** The family's plans (the children's and the whole family's) for today
 * and tomorrow, in time order. The database sends every repeating plan that
 * has started; lib/activity-repeat.ts -- the same rules the Planner, the
 * brief and the calendar feed use -- says which of the two days it lands on
 * (a weekly plan's chosen days, any plan's last day) and at what instant,
 * keeping its wall-clock time in the household's zone. */
export function plansForTwoDays(rows: HelperPlanRow[], now: Date, tz: string): HelperPlan[] {
  const today = familyDay(now, tz);
  const tomorrow = addDays(today, 1);
  if (!tomorrow) return [];
  const out: HelperPlan[] = [];
  for (const r of rows) {
    const start = new Date(r.start_at);
    if (Number.isNaN(start.getTime())) continue;
    const end = r.end_at ? new Date(r.end_at) : null;
    const length = end && !Number.isNaN(end.getTime()) ? end.getTime() - start.getTime() : null;
    for (const at of occurrenceStarts(r, start, today, tomorrow, tz)) {
      out.push({
        day: familyDay(at, tz) === today ? "today" : "tomorrow",
        title: r.title,
        at,
        endAt: length === null ? null : new Date(at.getTime() + length),
        place: r.place?.trim() || null,
        children: r.children ?? [],
        forWholeFamily: r.for_whole_family === true,
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
