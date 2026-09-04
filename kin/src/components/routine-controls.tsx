"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logRoutineAction, clearRoutineLogAction, setRoutinePausedAction, deleteRoutineAction } from "@/lib/actions/routines";
import { Icon } from "@/components/icons";

function useRoutineAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return { pending, error, run };
}

/** Done or skipped for today's occurrence, and a way back if it was a
 * mis-tap. What is already answered for reads as a state, not a button. */
export function RoutineTick({
  routineId,
  date,
  status,
  cost,
  currency,
}: {
  routineId: string;
  date: string;
  status: "done" | "skipped" | null;
  cost: number | null;
  currency: string;
}) {
  const { pending, error, run } = useRoutineAction();

  if (status) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            minHeight: 30,
            padding: "0 11px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
            background: status === "done" ? "color-mix(in srgb, var(--color-switch-on) 18%, transparent)" : "color-mix(in srgb, var(--color-text) 7%, transparent)",
            color: status === "done" ? "var(--color-neutral-900)" : "var(--color-neutral-700)",
          }}
        >
          <Icon name={status === "done" ? "check" : "x"} size={14} />
          {status === "done" ? "Done today" : "Skipped today"}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 30, fontSize: 12.5, padding: "0 8px" }}
          disabled={pending}
          onClick={() => run(() => clearRoutineLogAction(routineId, date))}
        >
          Undo
        </button>
        {error && <span style={{ fontSize: 12.5, color: "var(--color-neutral-700)" }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-primary"
        style={{ minHeight: 32, fontSize: 13, padding: "0 14px", gap: 5 }}
        disabled={pending}
        onClick={() => run(() => logRoutineAction({ routineId, date, status: "done" }))}
      >
        <Icon name="check" size={14} />
        Done
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ minHeight: 32, fontSize: 13, padding: "0 12px" }}
        disabled={pending}
        onClick={() => run(() => logRoutineAction({ routineId, date, status: "skipped" }))}
      >
        Skip
      </button>
      {cost ? (
        <span style={{ fontSize: 12.5, color: "var(--color-neutral-700)" }}>
          posts {currency === "PHP" ? "₱" : `${currency} `}
          {cost.toLocaleString("en-PH")}
        </span>
      ) : null}
      {error && <span style={{ fontSize: 12.5, color: "var(--color-neutral-700)" }}>{error}</span>}
    </div>
  );
}

export function RoutinePauseButton({ id, paused }: { id: string; paused: boolean }) {
  const { pending, run } = useRoutineAction();
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ minHeight: 30, fontSize: 12.5, padding: "0 8px", gap: 4 }}
      disabled={pending}
      onClick={() => run(() => setRoutinePausedAction(id, !paused))}
      aria-label={paused ? "Resume this routine" : "Pause this routine"}
    >
      <Icon name={paused ? "play" : "pause"} size={13} />
      {paused ? "Resume" : "Pause"}
    </button>
  );
}

export function RoutineDeleteButton({ id, title }: { id: string; title: string }) {
  const { pending, run } = useRoutineAction();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        style={{ minHeight: 30, fontSize: 12.5, padding: "0 8px", color: "var(--color-neutral-700)" }}
        onClick={() => setConfirming(true)}
      >
        Remove
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
      <span style={{ color: "var(--color-neutral-700)" }}>Remove “{title}”?</span>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ minHeight: 30, fontSize: 12.5, padding: "0 8px", color: "var(--cal-occasion)" }}
        disabled={pending}
        onClick={() => run(() => deleteRoutineAction(id))}
      >
        Remove
      </button>
      <button type="button" className="btn btn-ghost" style={{ minHeight: 30, fontSize: 12.5, padding: "0 8px" }} onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  );
}
