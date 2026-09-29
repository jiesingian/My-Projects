/** What a household is entitled to, and why.
 *
 * Access belongs to the household rather than to a person: one family pays, or
 * is given a code, and everyone in it is covered. That matches the rest of the
 * data model, where every row is scoped to a family_id.
 *
 * Since 28 September there are two plans, Kin Free and Kin Plus, and nobody is
 * ever locked out (20260928150000_kin_free_and_plus.sql). A new household gets
 * a 7-day Plus trial (14 before 29 September, 20260929140000); when it ends the household drops to Free and keeps its
 * calendar, lists, chat and everything it already added. The database is what
 * enforces the difference -- family_has_plus() and the require_kin_plus guard
 * on the Plus areas -- and this file is the same rule, read for the screen.
 *
 * The columns behind this are protected by a trigger -- the organizer can
 * rename their household from the browser, but cannot change what it is
 * entitled to. Only the security-definer functions move these. */

export type AccessStatus = "trialing" | "active" | "comped" | "past_due" | "expired";
export type AccessSource = "code" | "subscription" | null;
export type Plan = "plus" | "free";

/** How long a new household's Kin Plus trial runs. The database default on
 * families.access_expires_at is the one that counts; this is for the copy. */
export const TRIAL_DAYS = 7;

/** Free households get this many Kin AI questions and flyer scans a month
 * (use_kin_ai() holds the real number). */
export const FREE_AI_PER_MONTH = 5;

/** Kin's own photo and file storage, per household. Files on the family's
 * Google Drive don't count. */
export const FREE_STORAGE_BYTES = 1024 ** 3;
export const PLUS_STORAGE_BYTES = 50 * 1024 ** 3;

export type HouseholdAccess = {
  status: AccessStatus;
  source: AccessSource;
  expiresAt: string | null;
  plan: Plan;
  /** Kin Plus features are open right now: paid, given by a code, or trialing. */
  plus: boolean;
  /** On the Plus trial with time left. */
  trialing: boolean;
  /** Kept for callers that ask; always true now that Free never locks. */
  allowed: true;
  /** Days left before the trial or subscription ends, when that is a
   * meaningful question. */
  daysLeft: number | null;
};

const DAY = 24 * 60 * 60 * 1000;

export function readAccess(row: {
  access_status: string;
  access_source: string | null;
  access_expires_at: string | null;
}): HouseholdAccess {
  const status = (row.access_status ?? "trialing") as AccessStatus;
  const expiresAt = row.access_expires_at;
  const msLeft = expiresAt ? new Date(expiresAt).getTime() - Date.now() : null;

  // past_due is deliberately still Plus: a card that failed on Tuesday is
  // usually a card, not a decision. A trial needs an end date to count --
  // "trialing, no end date" used to mean "never ends", which was a bug.
  const trialing = status === "trialing" && msLeft !== null && msLeft > 0;
  const plus = status === "comped" || status === "active" || status === "past_due" || trialing;

  return {
    status,
    source: (row.access_source ?? null) as AccessSource,
    expiresAt,
    plan: plus ? "plus" : "free",
    plus,
    trialing,
    allowed: true,
    daysLeft: msLeft === null ? null : Math.max(0, Math.ceil(msLeft / DAY)),
  };
}

/** One line for Settings and the plan screen. */
export function planLabel(a: HouseholdAccess): string {
  if (a.status === "comped") return "Kin Plus · free for good";
  if (a.trialing) return a.daysLeft === 1 ? "Kin Plus trial · last day" : `Kin Plus trial · ${a.daysLeft} days left`;
  if (a.status === "past_due") return "Kin Plus · payment due";
  if (a.plus) return "Kin Plus";
  return "Kin Free";
}
