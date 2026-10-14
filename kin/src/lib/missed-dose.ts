/** "Tell someone if a dose is missed" (20261014200000_missed_dose_alerts.sql),
 * the words and the arithmetic, kept free of the database so they can be
 * tested on their own (e2e/missed-dose.logic.spec.ts). The five-minute job
 * does the same sum in SQL; this is what the screen says and what the spec
 * pins, so the two are written to agree. */

import { familyInstant } from "@/lib/time";

/** The delays a person can choose, in minutes. An hour is the default. */
export const MISSED_DELAYS = [30, 60, 120] as const;
export type MissedDelay = (typeof MISSED_DELAYS)[number];
export const DEFAULT_MISSED_DELAY: MissedDelay = 60;

export function isMissedDelay(n: number): n is MissedDelay {
  return (MISSED_DELAYS as readonly number[]).includes(n);
}

/** "half an hour", "an hour", "two hours". */
export function delayWords(minutes: number): string {
  if (minutes === 30) return "half an hour";
  if (minutes === 120) return "two hours";
  return "an hour";
}

/** The line on the medicine's card, so nobody is watched without knowing:
 * "Ben is told if a dose is late by an hour". */
export function alertLine(receiverFirstName: string, delayMinutes: number): string {
  return `${receiverFirstName} is told if a dose is late by ${delayWords(delayMinutes)}`;
}

/** "08:00" as "8:00 AM", the way the push says it. */
export function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** The push's title: "Lola hasn't taken her 8:00 AM Losartan". Without a
 * recorded sex it doesn't guess: "Lola's 8:00 AM Losartan isn't ticked". */
export function missedTitle(firstName: string, sex: string | null, time: string, medicine: string): string {
  if (sex === "female") return `${firstName} hasn't taken her ${time12(time)} ${medicine}`;
  if (sex === "male") return `${firstName} hasn't taken his ${time12(time)} ${medicine}`;
  return `${firstName}'s ${time12(time)} ${medicine} isn't ticked`;
}

/** When a dose on a household day, at a household time, is reported if
 * still not ticked: its time in the household's zone plus the delay. Null
 * for a day or time that isn't real. */
export function missedAlertAt(day: string, time: string, delayMinutes: number, tz: string): Date | null {
  const at = familyInstant(day, time, tz);
  return at ? new Date(at.getTime() + delayMinutes * 60_000) : null;
}

/** How long after it falls due a report is still worth sending. The job
 * looks this far back, so a missed tick or two of the job is caught up; any
 * later and the news is stale. */
export const MISSED_WINDOW_MINUTES = 180;

/** Is this dose to be reported at `now`? The same test the job makes:
 * due, not stale, not ticked, and scheduled after the alert was turned on. */
export function missedAlertDue(input: { day: string; time: string; delayMinutes: number; tz: string; activeSince: Date; now: Date; taken: boolean }): boolean {
  if (input.taken) return false;
  const doseAt = familyInstant(input.day, input.time, input.tz);
  if (!doseAt || doseAt < input.activeSince) return false;
  const dueAt = doseAt.getTime() + input.delayMinutes * 60_000;
  return dueAt <= input.now.getTime() && dueAt > input.now.getTime() - MISSED_WINDOW_MINUTES * 60_000;
}

/** Who may be told about a medicine: an active grown-up of the household with
 * a login, not the person taking it, and someone the medicine's visibility
 * already lets see it. The database checks the same (medicine_alert_receiver_ok);
 * this only keeps the picker to people it would accept. */
export function canBeTold(
  person: { id: string; role: string; hasLogin: boolean },
  medicine: { member_id: string; visibility: string; created_by: string | null },
): boolean {
  if (!person.hasLogin || (person.role !== "parent" && person.role !== "adult")) return false;
  if (person.id === medicine.member_id) return false;
  return medicine.visibility === "family" || person.id === medicine.created_by || (medicine.visibility === "parents" && person.role === "parent");
}
