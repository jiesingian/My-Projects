/** "Are you 18 or older?", asked once at sign-up (Jonathan, 29 October: legal
 * readiness, "Ask age; under-18 joins only"). The answer is kept with the
 * account (actions/auth.ts, signUp); no birthday is stored for it.
 *
 * Someone who said no cannot start a household, only join one with its
 * invite code, and their request reaches the organizer as a child's, so a
 * parent's approval is part of how they arrive (Data Privacy Act: a minor's
 * data on a guardian's consent; COPPA for a US child under 13). Accounts made
 * before the question have no answer and are treated as before. */
export function saidUnder18(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.over_18 === false;
}
