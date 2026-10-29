import { occurrenceStarts, type ActivityRule } from "@/lib/activity-repeat";
import { doseAlarmUrl } from "@/lib/dose-alarm";
import { addDays, familyClock, familyDay, familyInstant } from "@/lib/time";

/** Real alarms in the Kin iPhone app (Jonathan, 29 October): what rings, and
 * when. The app (kin/native) asks api/alarms for this list each time Kin
 * opens and hands it to AlarmKit, which rings each one full screen, with
 * sound even on silent and offline, like the Clock app.
 *
 * - Medicine doses ring at their time, for the same people the dose reminder
 *   goes to (due_dose_repeats, 20261022190000): the person taking it, and for
 *   a child's medicine the grown-ups it is shared with -- family, parents
 *   when they are a parent, or whoever added it. Under the member's "Health
 *   reminders" switch.
 * - Plans, check-ups and bills ring only when the member switched that item
 *   on (alarm_picks, 20261029100000): a plan 30 minutes before it starts, as
 *   its reminder does; a check-up an hour before, to leave time to get
 *   there; a bill at 09:00 on its due day.
 *
 * Pure, tested alone (e2e/alarms.logic.spec.ts). */

export type AlarmKind = "dose" | "activity" | "appointment" | "bill";
export type KinAlarm = { id: string; kind: AlarmKind; at: string; title: string; body: string; url: string };

/** How far ahead the phone is given alarms. Kin re-sends the list every time
 * it opens, so this only matters for a phone Kin is not opened on for a
 * while. */
export const ALARM_DAYS = 14;
/** AlarmKit has no published limit; the phone is never handed more than this. */
export const ALARM_MAX = 60;
export const PLAN_LEAD_MIN = 30;
export const CHECKUP_LEAD_MIN = 60;
export const BILL_TIME = "09:00";

type Me = { id: string; role: string; firstName: string };
export type AlarmMedicine = {
  id: string;
  name: string;
  dose: string | null;
  times: string[];
  start_date: string;
  end_date: string | null;
  member_id: string;
  visibility: string;
  created_by: string | null;
  member: { full_name: string; role: string; status?: string | null } | null;
};
export type AlarmActivity = ActivityRule & { id: string; title: string; start_at: string; status: string; location?: string | null };
export type AlarmAppointment = { id: string; what: string; when_at: string; where_text?: string | null; member_id: string; member: { full_name: string } | null };
export type AlarmBill = { id: string; name: string; amount: number | null; due_date: string | null; status: string };

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "Someone";
const grownUp = (role: string) => role === "parent" || role === "adult";
const child = (role: string) => role === "child_managed" || role === "child_self";

/** Whether this member's phone rings for this medicine: the dose reminder's
 * own rule, so the alarm and the reminder always go to the same people. */
export function ringsFor(me: Me, med: AlarmMedicine): boolean {
  if (med.member_id === me.id) return true;
  if (!grownUp(me.role) || !med.member || !child(med.member.role)) return false;
  if (med.member.status && med.member.status !== "active") return false;
  return med.visibility === "family" || (med.visibility === "parents" && me.role === "parent") || med.created_by === me.id;
}

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function buildAlarms(input: {
  now: Date;
  tz: string;
  me: Me;
  dosesOn: boolean;
  medicines: AlarmMedicine[];
  activities: AlarmActivity[];
  appointments: AlarmAppointment[];
  bills: AlarmBill[];
  days?: number;
}): KinAlarm[] {
  const { now, tz, me } = input;
  const days = input.days ?? ALARM_DAYS;
  const today = familyDay(now, tz);
  const last = addDays(today, days - 1) ?? today;
  const horizon = familyInstant(addDays(today, days) ?? today, "00:00", tz) ?? now;
  const out: KinAlarm[] = [];
  const keep = (a: KinAlarm) => {
    const at = new Date(a.at);
    if (at > now && at < horizon) out.push(a);
  };

  if (input.dosesOn) {
    for (const med of input.medicines) {
      if (!ringsFor(me, med)) continue;
      const whose = med.member_id === me.id ? "your" : `${first(med.member?.full_name)}'s`;
      for (let d = 0; d < days; d++) {
        const day = addDays(today, d);
        if (!day || day < med.start_date || (med.end_date && day > med.end_date)) continue;
        for (const time of med.times) {
          if (!HHMM.test(time)) continue;
          const at = familyInstant(day, time, tz);
          if (!at) continue;
          keep({
            id: `dose:${med.id}:${day}:${time}`,
            kind: "dose",
            at: at.toISOString(),
            title: `Time for ${whose} ${med.name}`.slice(0, 80),
            body: [med.dose, time].filter(Boolean).join(" · "),
            url: doseAlarmUrl({ medicineId: med.id, day, time }),
          });
        }
      }
    }
  }

  for (const a of input.activities) {
    if (a.status !== "upcoming") continue;
    const start = new Date(a.start_at);
    if (Number.isNaN(start.getTime())) continue;
    for (const s of occurrenceStarts(a, start, today, last, tz)) {
      const day = familyDay(s, tz);
      keep({
        id: `activity:${a.id}:${day}`,
        kind: "activity",
        at: new Date(s.getTime() - PLAN_LEAD_MIN * 60_000).toISOString(),
        title: `${a.title}`.slice(0, 80),
        body: [`At ${familyClock(s, tz)}`, a.location].filter(Boolean).join(" · "),
        url: "/planner",
      });
    }
  }

  for (const v of input.appointments) {
    const at = new Date(v.when_at);
    if (Number.isNaN(at.getTime())) continue;
    keep({
      id: `appointment:${v.id}`,
      kind: "appointment",
      at: new Date(at.getTime() - CHECKUP_LEAD_MIN * 60_000).toISOString(),
      title: `${first(v.member?.full_name)}: ${v.what}`.slice(0, 80),
      body: [`At ${familyClock(at, tz)}`, v.where_text].filter(Boolean).join(" · "),
      url: `/family/members/${v.member_id}/visit/${v.id}`,
    });
  }

  for (const b of input.bills) {
    if (!b.due_date || b.status === "paid" || b.status === "cancelled") continue;
    const at = familyInstant(b.due_date, BILL_TIME, tz);
    if (!at) continue;
    keep({
      id: `bill:${b.id}:${b.due_date}`,
      kind: "bill",
      at: at.toISOString(),
      title: `${b.name} is due today`.slice(0, 80),
      body: b.amount ? peso(Number(b.amount)) : "",
      url: "/wealth?seg=cashflow&open=expenses",
    });
  }

  return out.sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id)).slice(0, ALARM_MAX);
}
