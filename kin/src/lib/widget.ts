import { familyInstant } from "@/lib/time";
import type { TodayDose } from "@/lib/today-doses";

/** The Kin iPhone app's Home Screen and Lock Screen widgets (approved 30
 * September): Today's next dose and next plan, and how many things are on
 * the To-Buy list.
 *
 * The app asks api/widget, as the member through row-level security, each
 * time Kin opens and when the silent alarm push wakes it (KinAlarmSync), and
 * leaves the answer in the App Group the widget reads (kin/native,
 * KinWidgetStore). The Android app's widgets are the same two, from the same
 * answer (KinWidgets.java, its own SharedPreferences). A widget can't sign in, so it never asks the server
 * itself. The rest of the day's doses and plans ride along, so the widget
 * steps on to the next one at its time without a new read; a tick in Kin is
 * shown at the next open or wake. Only what is harmless a little stale is
 * here -- a time, a name, a count -- and tapping opens the live page.
 *
 * Pure, tested alone (e2e/widget.logic.spec.ts). */

export type WidgetItem = { title: string; detail: string; at: string; url: string };
export type WidgetSnapshot = {
  /** When it was read, so the widget can say how fresh it is. */
  updatedAt: string;
  /** The household's day it is for; the widget hides it on another day. */
  day: string;
  doses: WidgetItem[];
  plans: WidgetItem[];
  toBuy: number;
  toBuyUrl: string;
};

/** At most this many of each ride along: enough for a day. */
export const WIDGET_MAX = 12;
export const TO_BUY_URL = "/household?seg=buy";

export type WidgetPlan = { id: string; title: string; meta: string; at?: number; mark?: string; href: string };

export function widgetSnapshot(input: { now: Date; tz: string; day: string; doses: TodayDose[]; plans: WidgetPlan[]; toBuy: number }): WidgetSnapshot {
  const { now, tz, day } = input;
  const doses: WidgetItem[] = [];
  for (const row of input.doses) {
    const title = row.who ? `${row.who} · ${row.name}` : row.name;
    for (const time of row.times) {
      if (row.taken.includes(time)) continue;
      const at = familyInstant(day, time, tz);
      if (!at) continue;
      doses.push({ title: title.slice(0, 60), detail: row.dose ?? "", at: at.toISOString(), url: row.href });
    }
  }
  // A plan at a time of day, not ticked or skipped on Today, still ahead.
  const plans: WidgetItem[] = input.plans
    .filter((p) => p.at !== undefined && !p.mark && p.at > now.getTime())
    .map((p) => ({ title: p.title.slice(0, 60), detail: p.meta, at: new Date(p.at!).toISOString(), url: p.href.startsWith("/") ? p.href : "/planner" }));
  const byTime = (a: WidgetItem, b: WidgetItem) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title);
  return {
    updatedAt: now.toISOString(),
    day,
    doses: doses.sort(byTime).slice(0, WIDGET_MAX),
    plans: plans.sort(byTime).slice(0, WIDGET_MAX),
    toBuy: Math.max(0, Math.floor(input.toBuy)),
    toBuyUrl: TO_BUY_URL,
  };
}
