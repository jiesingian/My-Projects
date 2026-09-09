/** Trims and caps free text before it reaches the database. A `maxLength`
 * on the input it came from is cosmetic only -- these are Server Actions,
 * reachable with a string of any length from devtools, a scripted request,
 * or the assistant/chat tool layer regardless of what the form allows. */
export function clamp(value: string, max: number): string {
  return value.trim().slice(0, max);
}
