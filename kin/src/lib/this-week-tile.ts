import type { GlanceTile } from "@/lib/queries/today";

/** "At a glance" This week (Jonathan, 26 October): the Medicine tile said
 * what the list's dose rows already say, so its place counts what Coming up
 * holds -- "7 things · coming up this week" -- and opens it. A figure, not a
 * task: the list keeps everything due today. */
export function thisWeekTile(count: number): GlanceTile {
  if (count === 0) return { id: "week", icon: "calendarDays", value: "Quiet week", label: "nothing coming up yet", href: "/planner" };
  return { id: "week", icon: "calendarDays", value: `${count} thing${count === 1 ? "" : "s"}`, label: "coming up this week", href: "#coming-up" };
}
