/** Medicine doses as iPhone Clock alarms (23 October): the free stopgap until
 * the native app. The "Kin Alarms" Shortcut fetches the member's private
 * link (api/dose-alarms), clears its old "Kin ·" alarms and makes one Clock
 * alarm per dose time. A Clock alarm rings full screen with sound even on
 * silent, which a web notification on an iPhone cannot
 * (20261022190000_dose_reminder_repeats.sql). What the link may list, and
 * for whom, is dose_alarms_by_link() in 20261023237000_dose_alarm_link.sql. */

export type DoseAlarm = { time: string; hour: number; minute: number; label: string; until: string | null };
export type DoseAlarmFeed = { name: string; tz: string | null; today: string; alarms: DoseAlarm[] };

/** Every alarm the Shortcut makes starts with this, so it can find (and
 * clear) its own and never touch anyone's other alarms. */
export const ALARM_LABEL_PREFIX = "Kin ·";

/** The ready-made "Kin Alarms" Shortcut, shared from an iPhone as an iCloud
 * link (https://www.icloud.com/shortcuts/...). It asks for the member's
 * private link once, on import (an Import Question), so nobody assembles
 * it by hand. Empty until Jonathan builds and shares it
 * (docs/SETUP_FOR_JONATHAN.md, section 9); the Medicine alarms screen then
 * says it is coming instead of showing the button. */
export const KIN_ALARMS_SHORTCUT_URL = "";

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** The database's answer, checked: anything not shaped like an alarm is
 * dropped rather than handed to the Shortcut. */
export function readAlarmFeed(raw: unknown): DoseAlarmFeed | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.alarms) ? r.alarms : [];
  const alarms: DoseAlarm[] = [];
  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    const x = a as Record<string, unknown>;
    if (typeof x.time !== "string" || !HHMM.test(x.time) || typeof x.label !== "string" || !x.label.startsWith(ALARM_LABEL_PREFIX)) continue;
    const [hour, minute] = x.time.split(":").map(Number);
    alarms.push({ time: x.time, hour, minute, label: x.label, until: typeof x.until === "string" ? x.until : null });
  }
  return { name: typeof r.name === "string" ? r.name : "", tz: typeof r.tz === "string" ? r.tz : null, today: typeof r.today === "string" ? r.today : "", alarms };
}

/** What the Shortcut shows when it's done: "3 Kin alarms: 08:00, 20:00 and
 * 21:00." Shown, not spoken, so the times are written as times. */
export function alarmSummary(alarms: DoseAlarm[]): string {
  if (alarms.length === 0) return "No Kin alarms: no medicine has a dose time today.";
  const times = [...new Set(alarms.map((a) => a.time))];
  const list = times.length === 1 ? times[0] : `${times.slice(0, -1).join(", ")} and ${times[times.length - 1]}`;
  return `${alarms.length} Kin alarm${alarms.length === 1 ? "" : "s"}: ${list}.`;
}
