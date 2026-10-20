import { eventIsOver } from "@/lib/planner-done";

/** Who's coming (20261014090000_event_rsvps.sql): the rules the event's
 * screen and the Events list read, kept here so they are the database's
 * rules said once more in the app, not a second opinion. The policies are
 * what actually decide; this decides what to show. */

export type RsvpAnswer = "going" | "maybe" | "no";

export const RSVP_ANSWERS: { key: RsvpAnswer; label: string }[] = [
  { key: "going", label: "Going" },
  { key: "maybe", label: "Maybe" },
  { key: "no", label: "Can't go" },
];

export function isRsvpAnswer(v: string): v is RsvpAnswer {
  return v === "going" || v === "maybe" || v === "no";
}

type RsvpEvent = { event_date: string; end_date?: string | null; recurs_yearly?: boolean | null; applies_to_whole_family: boolean };
type RsvpMember = { id: string; role: string; status?: string | null };

/** Whether an event asks at all: one-off events and trips do; a birthday or
 * anniversary comes round every year, and one answer could not say which. */
export function eventTakesRsvps(e: RsvpEvent): boolean {
  return !e.recurs_yearly;
}

/** Who is asked: the people the event is for, or the whole household when it
 * is for the whole family or names nobody (the Planner reads both that way).
 * Only active members, in the household's own order. */
export function askedMembers<M extends RsvpMember>(e: RsvpEvent, memberIds: string[], members: M[]): M[] {
  // A managed child (no login) is "managed", not "active", and is asked too:
  // a grown-up answers for them (20261021000500).
  const active = members.filter((m) => !m.status || m.status === "active" || m.status === "managed");
  if (e.applies_to_whole_family || memberIds.length === 0) return active;
  return active.filter((m) => memberIds.includes(m.id));
}

/** Answers can be given and changed until the event's last day has gone;
 * after that they are a record. `today` is the household's day (familyDay). */
export function rsvpOpen(e: RsvpEvent, today: string): boolean {
  return eventTakesRsvps(e) && !eventIsOver(e, today);
}

/** Whom `me` may answer for: themselves, and -- a grown-up only -- a managed
 * child, who has no login of their own. A child with a login answers for
 * themselves. */
export function canAnswerFor(me: { id: string; role: string }, member: RsvpMember): boolean {
  if (member.id === me.id) return true;
  return member.role === "child_managed" && (me.role === "parent" || me.role === "adult");
}

/** The asked people grouped by answer, and who has not answered yet. An
 * answer from someone no longer asked (the event's people changed) is left
 * out rather than counted. */
export function summarizeRsvps<M extends { id: string }>(asked: M[], answers: { member_id: string; answer: string }[]) {
  const by = new Map(answers.map((a) => [a.member_id, a.answer]));
  const groups: Record<RsvpAnswer, M[]> = { going: [], maybe: [], no: [] };
  const waiting: M[] = [];
  for (const m of asked) {
    const a = by.get(m.id);
    if (a && isRsvpAnswer(a)) groups[a].push(m);
    else waiting.push(m);
  }
  return { ...groups, waiting };
}

/** The short line on an Events row: "3 going · 1 maybe", or nothing when
 * nobody has answered. */
export function rsvpLine(summary: { going: unknown[]; maybe: unknown[]; no: unknown[] }): string {
  const parts = [
    summary.going.length ? `${summary.going.length} going` : "",
    summary.maybe.length ? `${summary.maybe.length} maybe` : "",
    summary.no.length ? `${summary.no.length} can't go` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}
