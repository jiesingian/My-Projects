"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** "Show chores" on the Planner agenda: on, every day's chores are listed in
 * full; off (the default), each day folds them into one "N chores" line.
 * Remembered the same way as the legend filter -- a year-long cookie the
 * server reads -- so the agenda renders the right way first time, with no
 * flash of the other layout. */
export function ShowChoresSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  const [shown, setShown] = useState(on);
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      onClick={() => {
        const next = !shown;
        setShown(next);
        // One year, lax: a display preference, never sent cross-site.
        document.cookie = `kin_show_chores=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      }}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "0.875rem",
        minHeight: "2.75rem",
        marginTop: "0.75rem",
        padding: 0,
        background: "none",
        border: 0,
        font: "inherit",
        color: "inherit",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: "0.9375rem", display: "block" }}>Show chores</span>
        <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
          {shown ? "Every chore, listed on its day" : "Folded into one line a day"}
        </span>
      </span>
      <span className="kin-switch" data-on={shown} />
    </button>
  );
}
