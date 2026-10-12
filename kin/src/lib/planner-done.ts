import { nextEventDate } from "@/lib/grocery";

/** What "completed" means on the Planner, so the Events and Goals tabs can
 * fold finished things away by default (asked for 12 October) and show them
 * again on request. There is no "done" status on an event or a goal; both are
 * read from what is already stored. */

/** An event is over once its last day has gone: the end date for a trip or
 * anything else spanning days, the day itself otherwise. A yearly one (a
 * birthday, an anniversary) is never over -- it comes round again, and is
 * listed at its next turn instead. `today` is the household's day,
 * YYYY-MM-DD (familyDay). */
export function eventIsOver(e: { event_date: string; end_date?: string | null; recurs_yearly?: boolean | null }, today: string): boolean {
  if (e.recurs_yearly) return false;
  return (e.end_date && e.end_date > e.event_date ? e.end_date : e.event_date) < today;
}

/** A goal is finished when there is nothing left to do on it: a one-off
 * ("so far") target that has been reached, and whose reward, if it had one,
 * is settled -- received, or refused. A daily, weekly or monthly goal starts
 * again each period, so it is never finished; nor is one whose reward is
 * still owed, since the giver and the receiver still have a step to take. */
export function goalIsFinished(g: { period: string; reached: boolean; reward: { status: string } | null }): boolean {
  if (g.period !== "total" || !g.reached) return false;
  return !g.reward || g.reward.status === "received" || g.reward.status === "refused";
}

/** The `done` search param: "1" shows completed things, anything else hides them. */
export function showsDone(param: string | undefined): boolean {
  return param === "1";
}

/** The Events tab's When filter, beside Who (asked 12 October). Upcoming is
 * everything not over yet -- what is on today included, so a trip already
 * under way does not vanish from the default view. Current is only what is
 * on today. Past is what is over. */
export const EVENT_WHENS = ["upcoming", "current", "past"] as const;
export type EventWhen = (typeof EVENT_WHENS)[number];

/** The `when` search param, Upcoming unless it names another. */
export function eventWhen(param: string | undefined): EventWhen {
  return (EVENT_WHENS as readonly string[]).includes(param ?? "") ? (param as EventWhen) : "upcoming";
}

/** On today: a one-day event on its day, a multi-day one between its first
 * and last day, a yearly one on its anniversary. */
export function eventIsCurrent(e: { event_date: string; end_date?: string | null; recurs_yearly?: boolean | null }, today: string): boolean {
  if (e.recurs_yearly) return nextEventDate(e, today) === today;
  const last = e.end_date && e.end_date > e.event_date ? e.end_date : e.event_date;
  return e.event_date <= today && today <= last;
}

/** Whether an event belongs under the chosen When. */
export function eventMatches(e: { event_date: string; end_date?: string | null; recurs_yearly?: boolean | null }, when: EventWhen, today: string): boolean {
  if (when === "past") return eventIsOver(e, today);
  if (when === "current") return eventIsCurrent(e, today);
  return !eventIsOver(e, today);
}
