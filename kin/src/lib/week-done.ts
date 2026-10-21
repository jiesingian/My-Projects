/** Planner → Calendar → Week (Janine, 21 October): the week's list shows the
 * tapped day, then only today and the days still to come -- a past day is
 * opened from the date rail -- and what was already ticked done today folds
 * under "Done today". */

/** The other days listed under the tapped one: today and later, with
 * something on them. */
export function weekRest<D extends { day: string; isSelected: boolean; activities: unknown[] }>(days: D[], today: string): D[] {
  return days.filter((d) => !d.isSelected && d.day >= today && d.activities.length > 0);
}

/** What an item is, across its repeats: "routines:<id>", "activities:<id>". */
export function itemKey(i: { table: string; id: string; sourceId?: string }): string {
  return `${i.table}:${i.sourceId ?? i.id.split(":")[0]}`;
}

/** Today's items, still to do then done (in their order). */
export function splitDoneToday<I extends { table: string; id: string; sourceId?: string }>(items: I[], doneKeys: Set<string>): { open: I[]; done: I[] } {
  return { open: items.filter((i) => !doneKeys.has(itemKey(i))), done: items.filter((i) => doneKeys.has(itemKey(i))) };
}

/** Today's marks as item keys: Today's own keys ("activity-<id>",
 * "event-<id>", "bill-<id>") turned into the calendar's tables. */
export function keysFromMarks(marks: { item_key: string; state: string }[]): string[] {
  const table: Record<string, string> = { activity: "activities", event: "events", bill: "bills" };
  return marks.flatMap((m) => {
    const hit = /^(activity|event|bill)-(.+)$/.exec(m.item_key);
    return m.state === "done" && hit ? [`${table[hit[1]]}:${hit[2]}`] : [];
  });
}
