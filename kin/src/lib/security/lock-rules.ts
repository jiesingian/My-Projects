import type { LockState } from "@/lib/security/gate";

/** Why a change to the lock itself is refused right now, or null if it may
 * go ahead.
 *
 * Every way of changing the lock is also a way round it, if it is allowed
 * while the lock is shut: add a face or fingerprint and it opens the
 * documents; set a PIN on an account that only had a fingerprint and the new
 * PIN opens them; remove the PIN or the last device and there is no lock at
 * all. So once a lock exists, changing it needs the documents open -- the
 * same rule the screens always followed, now held by the server, which is
 * the only place a rule can be held against someone holding the phone.
 *
 * Setting up the first lock needs nothing: there is nothing to protect yet,
 * and getLockState reports an unconfigured lock as open. */
export function lockChangeProblem(lock: Pick<LockState, "configured" | "unlocked">): string | null {
  if (lock.configured && !lock.unlocked) return "Unlock your documents first, then change the lock.";
  return null;
}
