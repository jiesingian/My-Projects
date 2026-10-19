/** Who wins when a change made offline meets what happened in the meantime,
 * for the changes added on 19 October: medicine doses and chores done or
 * approved away from Today. The same rules as the first four
 * (app/api/offline/replay), written here as plain functions so they can be
 * tested without a database.
 *
 * - A dose tick or untick: the later one wins. A tick finds the dose already
 *   ticked and is done. An untick finds it ticked after the offline tap --
 *   someone ticked it since -- and their tick stands.
 * - A chore marked done or skipped: if somebody already answered that day's
 *   chore, their answer stands. If it was this person with the same answer,
 *   it is done; with the other answer, this later one is applied.
 * - A yes or no to a chore waiting for approval: only while it still waits.
 *   Another grown-up's answer stands; a chore un-done since has nothing to
 *   answer.
 */

export type Verdict = { apply: true } | { apply: false; outcome: "applied" | "skipped"; note?: string };

const APPLY: Verdict = { apply: true };
const ALREADY: Verdict = { apply: false, outcome: "applied" };
const skip = (note: string): Verdict => ({ apply: false, outcome: "skipped", note });

export function doseVerdict(op: { at: string; taken: boolean; label: string }, existing: { taken_at: string } | null): Verdict {
  if (op.taken) return existing ? ALREADY : APPLY;
  if (!existing) return ALREADY;
  if (existing.taken_at > op.at) return skip(`${op.label} was ticked by someone after you.`);
  return APPLY;
}

export function choreLogVerdict(op: { label: string; status?: string }, logged: { logged_by: string | null; status?: string | null } | null, me: string): Verdict {
  if (!logged) return APPLY;
  if (logged.logged_by !== me) return skip(`${op.label} was already answered by someone else.`);
  // Their own earlier answer, changed since (done, then skipped): the later
  // one is what they meant. Reporting it "sent" left the first one saved.
  return op.status && logged.status && op.status !== logged.status ? APPLY : ALREADY;
}

export function choreAnswerVerdict(op: { approve: boolean; label: string }, log: { approval: string; approved_by: string | null } | null, me: string): Verdict {
  if (!log) return skip(`${op.label} is no longer waiting for an answer.`);
  if (log.approval === "pending") return APPLY;
  const mine = log.approved_by === me && log.approval === (op.approve ? "approved" : "rejected");
  if (mine) return ALREADY;
  if (log.approval === "approved" || log.approval === "rejected") return skip(`${op.label} was already answered by someone else.`);
  return skip(`${op.label} is no longer waiting for an answer.`);
}

/** What a tick is a tick of, for changes where only the last one matters: a
 * list item, one dose, or one day of a chore. A second tick on the same thing
 * replaces the first in the queue (lib/offline/store). Null for everything
 * else. */
export function toggleTarget(op: { kind: string; itemId?: string; medicineId?: string; day?: string; time?: string; routineId?: string; date?: string }): string | null {
  if (op.kind === "buy.toggle") return `buy|${op.itemId}`;
  if (op.kind === "dose.set") return `dose|${op.medicineId}|${op.day}|${op.time}`;
  if (op.kind === "chore.log" && op.routineId && op.date) return `chore|${op.routineId}|${op.date}`;
  return null;
}

/** What the offline line at the top of a live page says, by page. */
export function offlineLine(pathname: string): string {
  if (/^\/(today|household|chat\/household)$/.test(pathname)) return "Offline — Done, ticks, new items and messages wait here and send when you’re back.";
  // Chores and approvals on the Planner; a member's medicine doses.
  if (/^\/planner$/.test(pathname) || /^\/family\/members\/[^/]+$/.test(pathname)) return "Offline — chores and medicine ticks wait here and send when you’re back. Other changes won’t save.";
  return "Offline — changes on this screen won’t save.";
}
