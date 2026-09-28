import type { CSSProperties, ReactNode } from "react";

/** A progress ring. Server-rendered SVG: the fill draws in once when the ring
 * first appears (CSS, off the main thread, so it stays smooth while the rest
 * of the page is still arriving) and after that only moves when the number
 * does -- a refresh that changes nothing replays nothing, because the element
 * is the same element. Reduced motion shows the value at once.
 *
 * pathLength="100" makes the dash arithmetic a percentage, whatever the size. */
export function GoalRing({
  fraction,
  size = 64,
  stroke = 7,
  colour = "var(--color-accent-solid)",
  index = 0,
  label,
  children,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  colour?: string;
  /** Position in the list, for a short stagger on entry. */
  index?: number;
  label: string;
  children?: ReactNode;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10;
  const r = (size - stroke) / 2;
  const style = { "--kin-ring-off": 100 - pct, "--kin-ring-delay": `${Math.min(index, 8) * 45}ms`, width: size, height: size } as CSSProperties;

  return (
    <div className="kin-goal-ring" style={style} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in srgb, var(--color-text) 9%, transparent)" strokeWidth={stroke} />
        <circle
          className="kin-goal-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          // Start at twelve o'clock and run clockwise.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ opacity: pct === 0 ? 0 : 1 }}
        />
      </svg>
      <div className="kin-goal-ring-centre">{children}</div>
    </div>
  );
}
