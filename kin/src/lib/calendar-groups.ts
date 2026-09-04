/** The calendar's categories, kept in their own module with no imports of
 * their own: the query layer and the styling layer both need them, and each
 * already refers to the other. */

export const CALENDAR_TABLES = ["activities", "trips", "events", "bills", "meal_plans", "goals"] as const;
export type CalendarTable = (typeof CALENDAR_TABLES)[number];

/** What the legend switches on and off. Activities and travel share one
 * group because they share a colour — both are somewhere to be. */
export const CALENDAR_GROUPS = ["schedule", "events", "bills", "meals", "goals"] as const;
export type CalendarGroup = (typeof CALENDAR_GROUPS)[number];

export const GROUP_OF: Record<CalendarTable, CalendarGroup> = {
  activities: "schedule",
  trips: "schedule",
  events: "events",
  bills: "bills",
  meal_plans: "meals",
  goals: "goals",
};

/** Which groups are switched off, read from the URL. Absent means none are:
 * a calendar shows everything until told otherwise, and recording what is
 * hidden rather than what is shown keeps that default a plain empty param. */
export function parseHidden(param?: string): Set<CalendarGroup> {
  if (!param) return new Set();
  const wanted = param.split(",");
  return new Set(CALENDAR_GROUPS.filter((g) => wanted.includes(g)));
}

export function serializeHidden(hidden: Set<CalendarGroup>): string {
  return CALENDAR_GROUPS.filter((g) => hidden.has(g)).join(",");
}

/** The param you would get by flipping one group. */
export function toggledHidden(hidden: Set<CalendarGroup>, group: CalendarGroup): string {
  const next = new Set(hidden);
  if (next.has(group)) next.delete(group);
  else next.add(group);
  return serializeHidden(next);
}
