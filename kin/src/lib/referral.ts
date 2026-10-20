/** Invite a family (20261020180000_invite_a_family.sql): a referral link
 * from Settings, Kin Plus days for both households when the invited one
 * finishes setup, the inviter rewarded for its first five. Pure, so the
 * Settings page, the route and the logic tests agree with the database. */

export const REFERRAL_CAP = 5;
export const REFERRAL_DAYS = 7;
/** A new household can name who invited it in its first 14 days (claim_referral). */
export const REFERRAL_WINDOW_DAYS = 14;
export const REFERRAL_COOKIE = "kin-referral";

/** A family's referral code as it travels in a link: 8 letters and digits. */
export const REFERRAL_CODE = /^[A-Z0-9]{8}$/;

/** What arrives in a URL or a cookie, cleaned to a code or nothing. */
export function cleanReferralCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
  return REFERRAL_CODE.test(code) ? code : null;
}

export function referralUrl(origin: string, code: string): string {
  return `${origin}/r/${code.replace(/[^A-Za-z0-9]/g, "")}`;
}

/** The share-sheet message, written once by Kin and sent by the family
 * themselves. */
export function referralMessage(householdName: string, url: string): string {
  return `${householdName.trim() || "We"} invite you to Kin, the app for family life. Set up your family through this link and we both get ${REFERRAL_DAYS} days of Kin Plus: ${url}`;
}

/** "3 families joined through you" for the Settings row. */
export function referralLine(joined: number): string {
  if (joined === 0) return "Share your link";
  return `${joined} ${joined === 1 ? "family" : "families"} joined through you`;
}

/** The line under the link: what each invite earns and how many are left to earn. */
export function referralRewardLine(rewarded: number, cap: number = REFERRAL_CAP): string {
  const left = Math.max(0, cap - rewarded);
  if (left === 0) return `You've earned the days for ${cap} families, the most Kin gives for inviting. New families you invite still get their ${REFERRAL_DAYS} days.`;
  return `Each family that finishes setup gets ${REFERRAL_DAYS} days of Kin Plus, and so do you, for ${left} more ${left === 1 ? "family" : "families"}.`;
}
