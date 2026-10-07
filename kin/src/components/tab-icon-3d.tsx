import { useId } from "react";

/** The tab bar's icons, in soft 3D (28 September): satin, rounded, slightly
 * inflated, lit from the top left and seen straight on from a touch above.
 *
 * Drawn, not pictures, so they stay sharp at every size the bar takes and
 * follow the theme: every tone is mixed from currentColor, which means the
 * selected tab is the accent's satin and the rest the neutral's, in light and
 * dark alike. Each shape is four layers in the same order, which is what keeps
 * the light and the camera consistent across all seven:
 *
 *   1. a blurred contact shadow a little below it (the ambient shadow, and on
 *      stacked shapes the one that falls on the shape behind);
 *   2. a rim, the same outline dropped by 1 unit in a deeper tone -- the edge
 *      you see from slightly above, which is what reads as thickness;
 *   3. the body, a radial gradient brightest up and to the left, darkening
 *      toward the lower right -- the "inflated" part;
 *   4. a satin sheen, a white wash fading out halfway down.
 *
 * Details (the chat dots, the calendar rings, the door) are a lighter cream
 * set on top with a smaller shadow of their own, so they read as raised
 * rather than printed.
 *
 * The shadows and rim mix toward --i-shade, a warm near-black by default. The
 * Today disc sets it to a deep accent, so its white tiles shade pink rather
 * than grey. */

export type TabIconName = "users" | "message" | "images" | "layoutGrid" | "calendarDays" | "house" | "wallet" | "envelope";

/** body: a satin solid. light: a raised cream detail. tone: a band of deeper
 * colour laid on the body below it (the calendar's header). */
type Part = { d: string; kind: "body" | "light" | "tone" };

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const rect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

// A 32-unit square. Bodies end by y 27.5 so the rim and shadow stay inside it.
const ICONS: Record<TabIconName, Part[]> = {
  // Two people, the one behind a little smaller and to the right.
  users: [
    // Two parents and a child under the Kin roof (2 October, Janine's pick
    // from the icon options): the household, not just two people.
    { kind: "body", d: "M2.8 13.6 15 4.1a1.6 1.6 0 0 1 2 0l12.2 9.5a1.4 1.4 0 0 1-1.7 2.2L16 7.2 4.5 15.8a1.4 1.4 0 0 1-1.7-2.2z" },
    { kind: "body", d: circle(10.5, 16, 2.9) },
    { kind: "body", d: "M5.2 28c0-3.8 2.4-6.6 5.3-6.6s5.3 2.8 5.3 6.6z" },
    { kind: "body", d: circle(21.5, 16, 2.9) },
    { kind: "body", d: "M16.2 28c0-3.8 2.4-6.6 5.3-6.6s5.3 2.8 5.3 6.6z" },
    { kind: "light", d: circle(16, 20.6, 2.2) },
    { kind: "light", d: "M12.6 28.6c0-2.9 1.5-4.8 3.4-4.8s3.4 1.9 3.4 4.8z" },
  ],
  // A speech bubble with three raised dots.
  message: [
    { kind: "body", d: "M7 4.5h18a4.5 4.5 0 0 1 4.5 4.5v10a4.5 4.5 0 0 1-4.5 4.5H14.6l-5.3 3.9c-.8.6-1.9 0-1.9-1V23.5H7A4.5 4.5 0 0 1 2.5 19V9A4.5 4.5 0 0 1 7 4.5z" },
    { kind: "light", d: circle(10.2, 14, 1.9) },
    { kind: "light", d: circle(16, 14, 1.9) },
    { kind: "light", d: circle(21.8, 14, 1.9) },
  ],
  // Two photos, one laid over the other, with a hill and a sun on the front.
  images: [
    { kind: "body", d: rect(10.5, 3.5, 18.5, 15, 3.6) },
    { kind: "body", d: rect(3, 10, 19.5, 17, 3.8) },
    { kind: "light", d: "M6.8 23.6l4.3-5.2a1.2 1.2 0 0 1 1.8 0l2.6 3 1.6-1.7a1.2 1.2 0 0 1 1.7 0l2.8 3.9z" },
    { kind: "light", d: circle(16.6, 14.6, 1.8) },
  ],
  // Four pillowy tiles -- Today, the dashboard.
  layoutGrid: [
    { kind: "body", d: rect(4, 3.5, 10.8, 10.8, 3) },
    { kind: "body", d: rect(17.2, 3.5, 10.8, 10.8, 3) },
    { kind: "body", d: rect(4, 16.7, 10.8, 10.8, 3) },
    { kind: "body", d: rect(17.2, 16.7, 10.8, 10.8, 3) },
  ],
  // A desk calendar: a deeper header band, two rings, six raised days.
  calendarDays: [
    { kind: "body", d: rect(3.5, 6, 25, 21.5, 4.5) },
    { kind: "tone", d: "M8 6h16a4.5 4.5 0 0 1 4.5 4.5V12.5h-25V10.5A4.5 4.5 0 0 1 8 6z" },
    { kind: "light", d: rect(9.2, 3, 3.2, 6.6, 1.6) },
    { kind: "light", d: rect(19.6, 3, 3.2, 6.6, 1.6) },
    { kind: "light", d: rect(8.4, 16, 3.6, 3, 1.2) },
    { kind: "light", d: rect(14.2, 16, 3.6, 3, 1.2) },
    { kind: "light", d: rect(20, 16, 3.6, 3, 1.2) },
    { kind: "light", d: rect(8.4, 21, 3.6, 3, 1.2) },
    { kind: "light", d: rect(14.2, 21, 3.6, 3, 1.2) },
  ],
  // A house with a soft roof and an arched door.
  house: [
    { kind: "body", d: "M14.3 4.5a2.7 2.7 0 0 1 3.4 0l9.3 7.7c.9.7 1.4 1.8 1.4 2.9v9.4a3 3 0 0 1-3 3H6.6a3 3 0 0 1-3-3v-9.4c0-1.1.5-2.2 1.4-2.9z" },
    { kind: "light", d: "M12.8 27.5v-5.6a3.2 3.2 0 0 1 6.4 0v5.6z" },
  ],
  // A wallet with a card tucked in behind and a clasp on the right.
  // A sealed letter, its flap a lighter fold on top (kid view's Letters).
  envelope: [
    { kind: "body", d: rect(3, 7, 26, 19, 4) },
    { kind: "light", d: "M6.2 9.6h19.6l-8.7 7a1.8 1.8 0 0 1-2.2 0z" },
  ],
  wallet: [
    { kind: "body", d: "M6.3 9.8l-.5-2.7a2 2 0 0 1 1.6-2.3l12.4-2.2a2 2 0 0 1 2.3 1.6l.9 5.6z" },
    { kind: "body", d: rect(3, 8.5, 25, 19, 4.5) },
    { kind: "body", d: rect(19, 14.2, 10.5, 7.6, 3.8) },
    { kind: "light", d: circle(23.2, 18, 1.5) },
  ],
};

const mix = (pct: number, other: string) => `color-mix(in srgb, currentColor ${pct}%, ${other})`;
const SHADE = "var(--i-shade, #2b1219)";

export function TabIcon3D({ name, size }: { name: TabIconName; size: string }) {
  // useId gives characters that are not safe inside url(#...).
  const id = "t3" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const u = (k: string) => `url(#${id}${k})`;

  return (
    <span className="kin-i kin-i3d inline-flex" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}b`} cx="0.36" cy="0.28" r="0.95">
            <stop offset="0" style={{ stopColor: mix(50, "#fff") }} />
            <stop offset="0.5" style={{ stopColor: mix(86, "#fff") }} />
            <stop offset="1" style={{ stopColor: mix(88, SHADE) }} />
          </radialGradient>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" style={{ stopColor: mix(16, "#fff") }} />
          </linearGradient>
          <filter id={`${id}f`} x="-30%" y="-30%" width="160%" height="170%">
            <feGaussianBlur stdDeviation="0.9" />
          </filter>
        </defs>
        {ICONS[name].map((p, i) =>
          p.kind === "body" ? (
            <g key={i}>
              <path d={p.d} transform="translate(0 1.7)" filter={u("f")} style={{ fill: SHADE }} opacity="0.3" />
              <path d={p.d} transform="translate(0 1)" style={{ fill: mix(66, SHADE) }} />
              <path d={p.d} fill={u("b")} />
              <path d={p.d} fill={u("s")} />
            </g>
          ) : p.kind === "tone" ? (
            <path key={i} d={p.d} style={{ fill: mix(70, SHADE) }} opacity="0.32" />
          ) : (
            <g key={i}>
              <path d={p.d} transform="translate(0 0.8)" style={{ fill: SHADE }} opacity="0.28" />
              <path d={p.d} fill={u("l")} />
            </g>
          ),
        )}
      </svg>
    </span>
  );
}
