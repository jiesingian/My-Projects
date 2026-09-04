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
  activities: { label: "Activity", color: "var(--cal-schedule)", icon: "calendarDays" },
  trips: { label: "Travel", color: "var(--cal-schedule)", icon: "plane" },
  events: { label: "Event", color: "var(--cal-occasion)", icon: "gift" },
  bills: { label: "Bill", color: "var(--cal-money)", icon: "receipt" },
  meal_plans: { label: "Meal", color: "var(--cal-home)", icon: "utensils" },
  goals: { label: "Goal", color: "var(--cal-goal)", icon: "target" },
};

/** The legend, in the order the colours were assigned. It doubles as the
 * filter, so each entry names the group it switches. */
export const CALENDAR_LEGEND: { group: CalendarGroup; label: string; color: string; icon: IconName }[] = [
  { group: "schedule", label: "Activities & travel", color: "var(--cal-schedule)", icon: "calendarDays" },
  { group: "events", label: "Events", color: "var(--cal-occasion)", icon: "gift" },
  { group: "bills", label: "Bills", color: "var(--cal-money)", icon: "receipt" },
  { group: "meals", label: "Meals", color: "var(--cal-home)", icon: "utensils" },
  { group: "goals", label: "Goals", color: "var(--cal-goal)", icon: "target" },
];

export function styleFor(table: CalendarSource) {
  return CALENDAR_STYLE[table] ?? CALENDAR_STYLE.activities;
}
