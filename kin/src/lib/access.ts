/** What a household is entitled to, and why.
 *
 * Access belongs to the household rather than to a person: one family pays, or
 * is given a code, and everyone in it is let in. That matches the rest of the
 * data model, where every row is scoped to a family_id.
 *
 * The columns behind this are protected by a trigger — the organizer can
 * rename their household from the browser, but cannot change what it is
 * entitled to. Only the security-definer functions move these. */

export type AccessStatus = "trialing" | "active" | "comped" | "past_due" | "expired";
export type AccessSource = "code" | "subscription" | null;

export type HouseholdAccess = {
  status: AccessStatus;
  source: AccessSource;
  expiresAt: string | null;
  /** May the household use Kin at all right now. */
  allowed: boolean;
  /** Days left before it stops, when that is a meaningful question. */
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
  const lapsed = msLeft !== null && msLeft <= 0;

  // past_due is deliberately still allowed: a card that failed on Tuesday is
  // usually a card, not a decision, and locking a family out of their own
  // records over it would be the wrong way round. It shows a warning instead,
  // and only becomes 'expired' once the retries are genuinely done.
  const allowed =
    status === "comped" ||
    status === "active" ||
    status === "past_due" ||
    (status === "trialing" && !lapsed);

  return {
    status,
    source: (row.access_source ?? null) as AccessSource,
    expiresAt,
    allowed,
    daysLeft: msLeft === null ? null : Math.max(0, Math.ceil(msLeft / DAY)),
  };
}
