/** A thin progress bar, for the goals game and Today. `mark` draws a tick
 * at a fraction of the way -- a steps goal's 50%, where half its XP and
 * coins are earned. */
export function ProgressBar({ fraction, label, mark, height = 8 }: { fraction: number; label: string; mark?: number; height?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ position: "relative", height, borderRadius: 999, background: "color-mix(in srgb, var(--color-text) 10%, transparent)", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--color-accent-solid)", transition: "width 240ms ease-out" }} />
      {mark !== undefined && <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: `${Math.round(mark * 100)}%`, width: 2, background: "var(--color-surface, #fff)", opacity: 0.9 }} />}
    </div>
  );
}
