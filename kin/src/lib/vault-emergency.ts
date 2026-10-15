/** Emergency access to the vault, in words (20261015120000).
 *
 * Who may name, ask, allow or read is the database's call, and so is the
 * state of a request: waiting, open, denied, revoked or expired is worked
 * out there from its timestamps and now(). What is here is how each of those
 * reads on screen, and the checks that save a round trip before the database
 * says the same thing. Nothing here decides who sees what. */

export const WAIT_DAYS = [1, 3, 7] as const;
export type WaitDays = (typeof WAIT_DAYS)[number];
export const DEFAULT_WAIT: WaitDays = 3;
/** How many trusted people a household may name. */
export const MAX_TRUSTED = 2;
/** How long a grant stays open once it opens. */
export const OPEN_DAYS = 30;
export const REASON_MIN = 3;
export const REASON_MAX = 300;

export type EmergencyStatus = "waiting" | "open" | "denied" | "revoked" | "expired";

export function isWaitDays(n: number): n is WaitDays {
  return (WAIT_DAYS as readonly number[]).includes(n);
}

export function asStatus(s: string): EmergencyStatus {
  return s === "waiting" || s === "open" || s === "denied" || s === "revoked" ? s : "expired";
}

export function waitLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

/** Null when the reason will do; otherwise what to say. */
export function reasonProblem(reason: string): string | null {
  const r = reason.trim();
  if (r.length < REASON_MIN) return "Say in a few words why you need it.";
  if (r.length > REASON_MAX) return `Keep it under ${REASON_MAX} characters.`;
  return null;
}

/** "12 Nov 3:40 pm", in the household's zone. Built from parts so the comma
 * en-GB puts between the date and the time does not creep in. */
export function shortWhen(at: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(at);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
}

/** One line of the log the household reads: "Ate Liza opened Passport
 * (Mia), 12 Nov 3:40 pm". */
export function openedLine(who: string, item: string, at: Date, tz: string): string {
  return `${who} opened ${item}, ${shortWhen(at, tz)}`;
}

/** "the Santos household" from a household's name, which is often already
 * "Santos" or "Santos Family". */
export function householdPhrase(name: string): string {
  const n = name.trim();
  if (!n) return "their household";
  if (/\b(household|family|home)$/i.test(n)) return `the ${n}`;
  return `the ${n} household`;
}

/** What a request's state means, for the household whose vault it is. */
export function ownerStatusLine(
  r: { status: EmergencyStatus; opensAt: Date; endsAt: Date; answeredBy: string | null },
  tz: string,
): string {
  switch (r.status) {
    case "waiting":
      return `Opens ${shortWhen(r.opensAt, tz)} unless a grown-up here says no.`;
    case "open":
      return `Open, read-only, until ${shortWhen(r.endsAt, tz)} unless you take it back.`;
    case "denied":
      return r.answeredBy ? `Denied by ${r.answeredBy}.` : "Denied.";
    case "revoked":
      return r.answeredBy ? `Taken back by ${r.answeredBy}.` : "Ended.";
    case "expired":
      return "Ended after 30 days.";
  }
}

/** The same, for the trusted person who asked. */
export function trustedStatusLine(r: { status: EmergencyStatus; opensAt: Date; endsAt: Date }, tz: string): string {
  switch (r.status) {
    case "waiting":
      return `Waiting. Opens ${shortWhen(r.opensAt, tz)} if nobody there says no. They have been told.`;
    case "open":
      return `Open, read-only, until ${shortWhen(r.endsAt, tz)}. Each item you open is shown to them.`;
    case "denied":
      return "A grown-up there said no to this request.";
    case "revoked":
      return "A grown-up there ended this access.";
    case "expired":
      return "This access ended after 30 days. Ask again if you still need it.";
  }
}

/** The database's refusals, as sentences. Anything not recognised is passed
 * on as a generic line rather than as Postgres's own words. */
export function emergencyError(message: string): string {
  if (message.includes("kin_plus_required")) return "Naming someone is part of Kin Plus.";
  if (message.includes("cannot be named")) return "Only a grown-up with Kin in a linked household can be named.";
  if (message.includes("Two people at most")) return "Two people at most. Remove one first.";
  if (message.includes("1, 3 or 7")) return "Choose a wait of 1, 3 or 7 days.";
  if (message.includes("has not named you")) return "That household has not named you.";
  if (message.includes("no longer linked")) return "Your households are no longer linked.";
  if (message.includes("few words")) return "Say in a few words why you need it.";
  if (message.includes("already waiting")) return "Your request is already waiting.";
  if (message.includes("One request a day")) return "You can ask once a day. Try again tomorrow.";
  if (message.includes("no longer waiting")) return "That request has already been answered.";
  if (message.includes("already ended")) return "That access has already ended.";
  if (message.includes("not open")) return "Emergency access is not open.";
  if (message.includes("not there")) return "That item is no longer there.";
  if (message.includes("not yours")) return "That isn't yours to change.";
  if (message.includes("Only a grown-up")) return "Only a grown-up of this household can do that.";
  return "That didn't work. Try again in a moment.";
}
