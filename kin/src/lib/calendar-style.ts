import type { IconName } from "@/components/icons";
import type { CalendarGroup, CalendarTable } from "@/lib/calendar-groups";

type CalendarSource = CalendarTable;

/** Colour groups a calendar item by which part of life it comes from; the
 * icon says exactly what it is; the title says which one. Identity never
 * rests on colour, which matters because six fully colourblind-separable
 * hues don't exist — the four here were checked with a CVD validator and the
 * closest pair (green/orange) sits at ΔE 7.0, which is only acceptable
 * alongside a second channel like these glyphs. */
export const CALENDAR_STYLE: Record<CalendarSource, { label: string; color: string; icon: IconName }> = {
  // The table is still `activities`; the word people read is Task, because
  // that is the Planner tab these are listed in.
  activities: { label: "Task", color: "var(--cal-schedule)", icon: "calendarDays" },
  events: { label: "Event", color: "var(--cal-occasion)", icon: "gift" },
  bills: { label: "Bill", color: "var(--cal-money)", icon: "receipt" },
  meal_plans: { label: "Meal", color: "var(--cal-home)", icon: "utensils" },
  goals: { label: "Goal", color: "var(--cal-goal)", icon: "target" },
  // Routines share the schedule hue deliberately: a fifth separable colour
  // does not exist for the colourblind, and a routine is a kind of thing to
  // be somewhere for. The repeat glyph is what tells them apart.
  routines: { label: "Routine", color: "var(--cal-schedule)", icon: "repeat" },
};

/** The legend, in the order the colours were assigned. It doubles as the
 * filter, so each entry names the group it switches. */
export const CALENDAR_LEGEND: { group: CalendarGroup; label: string; color: string; icon: IconName }[] = [
  // Two groups of task, told apart by whether they come round again -- the
  // legend doubles as the filter, so they cannot both just say "Tasks".
  { group: "schedule", label: "Tasks", color: "var(--cal-schedule)", icon: "calendarDays" },
  { group: "routines", label: "Recurring tasks", color: "var(--cal-schedule)", icon: "repeat" },
  { group: "events", label: "Events & travel", color: "var(--cal-occasion)", icon: "gift" },
  { group: "bills", label: "Bills", color: "var(--cal-money)", icon: "receipt" },
  { group: "meals", label: "Meals", color: "var(--cal-home)", icon: "utensils" },
  { group: "goals", label: "Goals", color: "var(--cal-goal)", icon: "target" },
];

export function styleFor(table: CalendarSource) {
  return CALENDAR_STYLE[table] ?? CALENDAR_STYLE.activities;
}
