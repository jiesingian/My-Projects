import Link from "next/link";

/** The line between what is still ahead and what is finished, on the Planner
 * tabs that fold finished things away (Events, Goals). Hidden by default; the
 * link says how many there are, and the choice lives in the URL (done=1) so
 * it survives a refresh and the back button. Nothing finished, no line. */
export function CompletedToggle({ seg, who, count, shown }: { seg: string; who: string; count: number; shown: boolean }) {
  if (count === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", margin: "0.875rem 0 0.5rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)" }}>
      <span style={{ fontSize: "0.75rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>Completed · {count}</span>
      <Link
        href={`/planner?seg=${seg}&who=${who}${shown ? "" : "&done=1"}`}
        aria-expanded={shown}
        style={{ minHeight: "2rem", display: "flex", alignItems: "center", padding: "0 0.5rem", fontSize: "0.8125rem", color: "var(--color-accent-700)", textDecoration: "none" }}
      >
        {shown ? "Hide" : `Show ${count}`}
      </Link>
    </div>
  );
}
