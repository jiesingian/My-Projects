/** The member card on Today (approved by Jonathan, 30 September): tap a
 * person's initials and see how they are -- their time, where they are if
 * they share it, their day, and a way to reach them. Built for families that
 * live apart, where "is it late there?" and "are they all right?" are the
 * questions.
 *
 * Who sees what is decided here, once, free of the database, so it can be
 * tested on its own (e2e/member-card.logic.spec.ts) and so the card a person
 * previews of themselves is built by the same rules as the one others see.
 * Row-level security still has the last word on every row: these rules only
 * ever narrow what the database already allows.
 *
 *   Section        Grown-up viewer         Child viewer (incl. kid view)
 *   Now            yes                     yes
 *    - location    only if they share it   only if they share it
 *    - weather     only if they share it   only if they share it
 *   Today, goals   yes                     yes
 *   Money          yes                     never
 *   Care           yes, as Health allows   never
 *   Last active    yes                     yes
 */

export type CardAudience = "self" | "grownup" | "child";

export type CardSections = {
  now: boolean;
  today: boolean;
  money: boolean;
  care: boolean;
  lastActive: boolean;
  /** Call, message, "Are you okay?" -- none of which you send yourself. */
  actions: boolean;
};

export function isGrownUpRole(role: string): boolean {
  return role === "parent" || role === "adult";
}

/** Who is looking. Kid view is a child whatever else is true. */
export function audienceOf(viewer: { id: string; role: string; kidView: boolean }, targetId: string): CardAudience {
  if (viewer.id === targetId) return "self";
  if (viewer.kidView) return "child";
  return isGrownUpRole(viewer.role) ? "grownup" : "child";
}

export function sectionsFor(audience: CardAudience): CardSections {
  switch (audience) {
    case "self":
      return { now: true, today: true, money: true, care: true, lastActive: true, actions: false };
    case "grownup":
      return { now: true, today: true, money: true, care: true, lastActive: true, actions: true };
    case "child":
      return { now: true, today: true, money: false, care: false, lastActive: true, actions: true };
  }
}

/** Your own card, as someone else would see it. The preview is read with your
 * own session, which can see your "Just me" things, so this is where they come
 * out again: only what the household is shown. */
export function forPreview<T extends { visibility: string }>(rows: T[]): T[] {
  return rows.filter((r) => r.visibility === "family");
}

/** Money on the card is the spending on accounts that are the person's own.
 * A joint account is the household's, not theirs; a private one is shown only
 * to its owner (the accounts policy says so, and a preview says the same). */
export function ownSpendingAccounts<T extends { owner_member_id: string | null; is_joint: boolean; is_private: boolean }>(accounts: T[], memberId: string, preview: boolean): T[] {
  return accounts.filter((a) => a.owner_member_id === memberId && !a.is_joint && !(preview && a.is_private));
}

// ── time ────────────────────────────────────────────────────────────────

/** An IANA zone name the runtime actually knows. The database checks the
 * shape; this checks it is real. */
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "Asia/Dubai" -> "Dubai", "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
export function zoneCity(tz: string): string {
  return (tz.split("/").pop() ?? tz).replace(/_/g, " ");
}

/** Minutes east of UTC at that instant, daylight saving included. */
export function offsetMinutes(tz: string, at: Date): number | null {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
    if (name === "GMT") return 0;
    const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(name);
    if (!m) return null;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  } catch {
    return null;
  }
}

/** "4 h behind you", "2 h 30 min ahead of you", "Same time as you". */
export function apartLabel(theirTz: string, myTz: string, at: Date): string | null {
  const theirs = offsetMinutes(theirTz, at);
  const mine = offsetMinutes(myTz, at);
  if (theirs === null || mine === null) return null;
  const diff = theirs - mine;
  if (diff === 0) return "Same time as you";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const min = abs % 60;
  const size = [h ? `${h} h` : "", min ? `${min} min` : ""].filter(Boolean).join(" ");
  return diff > 0 ? `${size} ahead of you` : `${size} behind you`;
}

/** "3:40 pm", the way the rest of Today writes a time. */
export function clockIn(tz: string, at: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(at).replace(/\s?AM$/, " am").replace(/\s?PM$/, " pm");
}

/** YYYY-MM-DD in that zone. */
export function dayIn(tz: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Is it night where they are? 10 pm to 7 am: a hint not to ring. */
export function isNightIn(tz: string, at: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(at)) % 24;
  return hour >= 22 || hour < 7;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function sinceLabel(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

/** The latest of several moments, or null if none. */
export function latest(...isos: (string | null | undefined)[]): string | null {
  return isos.filter((x): x is string => !!x).sort().pop() ?? null;
}

// ── SOS ─────────────────────────────────────────────────────────────────

/** How long the button has to be held, and how long there is to change your
 * mind afterwards before anything is sent. Long enough that a pocket or a
 * toddler cannot do both; short enough for someone who means it. */
export const SOS_HOLD_MS = 3000;
export const SOS_COUNTDOWN_S = 5;

/** A position fit to send: finite, in range, accuracy rounded and capped.
 * Anything else is sent as no position rather than a wrong one. */
export function cleanPosition(lat: unknown, lng: unknown, accuracy: unknown): { lat: number; lng: number; accuracy_m: number | null } | null {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const acc = typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 ? Math.min(10_000_000, Math.round(accuracy)) : null;
  return { lat, lng, accuracy_m: acc };
}

export function mapLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** The push that asks "are you okay?", to the one person asked. It opens the
 * one-tap answer page and lasts six hours: an ask that arrives the next day
 * is worse than none. */
export function checkInAskPush(askerName: string, memberId: string, checkInId: string) {
  return {
    kind: "checkins" as const,
    memberIds: [memberId],
    title: `${askerName.split(" ")[0]} asks: are you okay?`,
    body: "One tap to answer.",
    url: `/today/check-in/${checkInId}`,
    tag: `checkin-${checkInId}`,
    ttlSeconds: 6 * 60 * 60,
  };
}

/** The push back to whoever asked. Same tag as the ask, so it replaces it on
 * a phone that shows both; "call me" is sent urgent. */
export function checkInAnswerPush(answererName: string, askerId: string, checkInId: string, answer: "ok" | "call_me") {
  const first = answererName.split(" ")[0];
  return {
    kind: "checkins" as const,
    memberIds: [askerId],
    title: answer === "ok" ? `${first} is okay` : `${first} asked you to call`,
    body: answer === "ok" ? "Answered your check-in just now." : "Answered your check-in: call me. Tap to open Kin.",
    url: `/today/check-in/${checkInId}`,
    tag: `checkin-${checkInId}`,
    urgent: answer === "call_me",
  };
}
