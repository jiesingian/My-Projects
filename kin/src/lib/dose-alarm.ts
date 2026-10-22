/** A medicine reminder as an alarm (22 October). The cron names each dose
 * reminder 'dose:<medicine>:<day>:<time>' and each repeat
 * 'dose-again:<medicine>:<day>:<time>:<n>' (20261022190000); the alarm screen
 * is opened from that, so the push needs nothing new from the database.
 * Pure, with logic tests (e2e/dose-alarm.logic.spec.ts). */

export type DoseRef = { medicineId: string; day: string; time: string };

const KEY = /^dose(?:-again)?:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})(?::\d+)?$/i;

/** The dose a reminder key names, or null for any other reminder. */
export function doseFromKey(key: string): DoseRef | null {
  const m = KEY.exec(key);
  return m ? { medicineId: m[1].toLowerCase(), day: m[2], time: m[3] } : null;
}

/** Where the alarm opens: the full-screen dose page. */
export function doseAlarmUrl(d: DoseRef): string {
  return `/today/dose?med=${d.medicineId}&day=${d.day}&time=${encodeURIComponent(d.time)}`;
}

/** The same, read back from the page's search params; null if anything is off. */
export function doseFromParams(p: { med?: string; day?: string; time?: string }): DoseRef | null {
  return doseFromKey(`dose:${p.med ?? ""}:${p.day ?? ""}:${p.time ?? ""}`);
}
