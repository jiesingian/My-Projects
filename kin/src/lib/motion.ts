/** "smooth", unless the reader has asked their device to Reduce Motion.
 *
 * CSS answers that setting through `@media (prefers-reduced-motion)`, but a
 * scroll started from script doesn't read CSS: `scrollIntoView({ behavior:
 * "smooth" })` glides the page whatever the setting says. Pass this instead. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || !window.matchMedia) return "smooth";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
