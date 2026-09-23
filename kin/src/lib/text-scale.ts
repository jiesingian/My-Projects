/** Kin's own text size, and the layout that has to answer it.
 *
 * The slider in Settings sets a percentage on :root, so everything sized in
 * rem follows it. Three pieces of layout change shape once text is large for
 * the width it has -- the tab bar drops its labels, the hub grid goes one-up,
 * the composer puts its field on a line of its own -- and those used to be
 * plain `@media (max-width: Nem)` rules in globals.css.
 *
 * That only ever answered the browser's text size. `em` inside a media query is
 * the browser's default font size, and nothing a page sets on :root reaches it,
 * so at 300% from this slider the tab bar kept seven labels on a phone and the
 * hub grid kept two columns of names that no longer fit. The rules live here
 * now, and each threshold is multiplied by the member's own scale: a switch
 * that fired at 14em of browser text fires at 14 x 3 = 42em when Kin is at
 * 300%, which is the same point measured in the text the reader actually sees.
 * At 100% the output is exactly what globals.css used to hold.
 */

export const TEXT_SCALE_MIN = 85;
export const TEXT_SCALE_MAX = 300;
export const TEXT_SCALE_DEFAULT = 100;

export function clampTextScale(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return TEXT_SCALE_DEFAULT;
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, n));
}

/** Where each switch fires, in ems of the reader's text. The bodies are the
 * rules; the numbers are what the measurements in the earlier changes found. */
const SWITCHES: { at: number; why: string; rules: string }[] = [
  {
    at: 14,
    why: "tab bar: labels go, icons take the room",
    rules: `.kin-nav{--kin-tab-icon:min(2rem,12vw);--kin-tab-disc:min(3.5rem,15vw);--kin-tab-disc-icon:min(2.25rem,9vw)}
.kin-tab-label{display:none}
.kin-tab{padding:0.625rem 0 0}
.kin-tab-ico{max-width:3.25rem;height:min(2.5rem,14vw)}`,
  },
  {
    at: 18,
    why: "hub grid: one-up",
    rules: `.kin-hubgrid{grid-template-columns:1fr}
.kin-hub-wide{grid-column:span 1}`,
  },
  {
    at: 19,
    why: "composer: the field takes a line of its own",
    rules: `.kin-composer-field{order:-1;flex-basis:100%}
.kin-composer-row>.btn:last-child{margin-left:auto}`,
  },
];

/** The stylesheet for one member's scale. Each rule is prefixed with :root so
 * it outranks the base rule it overrides whatever order the two stylesheets
 * land in, and every query stops short of 1024px, where the tab bar has become
 * a sidebar and none of these switches mean anything. */
export function textScaleCss(scale: number): string {
  const s = clampTextScale(scale) / 100;
  const root = s === 1 ? "" : `:root{font-size:${+(s * 100).toFixed(2)}%}\n`;
  const blocks = SWITCHES.map(({ at, why, rules }) => {
    const scoped = rules
      .split("\n")
      .map((r) => `:root ${r}`)
      .join("\n");
    return `/* ${why} */\n@media (max-width:${+(at * s).toFixed(3)}em) and (max-width:1023.98px){\n${scoped}\n}`;
  });
  return root + blocks.join("\n");
}
