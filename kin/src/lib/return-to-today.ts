/** How long the app has to have been away before coming back opens Today
 * rather than wherever it was left. Agreed as 30 minutes (item 2, 25
 * September): long enough that a quick trip to another app -- checking a
 * message, copying a number -- comes back to exactly where it was; short
 * enough that picking the phone up later in the day starts on Today, as
 * opening Kin fresh already does. */
export const RETURN_AFTER_MS = 30 * 60 * 1000;

/** Whether coming back to the app should take the reader to Today.
 *
 * Never when they are already there, and never when the page they left has
 * something typed into it that has not been saved -- a half-written journal
 * entry is worth more than a consistent starting screen. */
export function shouldReturnToToday({
  awayMs,
  pathname,
  hasUnsavedInput,
}: {
  awayMs: number;
  pathname: string;
  hasUnsavedInput: boolean;
}): boolean {
  if (!Number.isFinite(awayMs) || awayMs < RETURN_AFTER_MS) return false;
  if (pathname === "/today" || pathname.startsWith("/today/")) return false;
  return !hasUnsavedInput;
}
