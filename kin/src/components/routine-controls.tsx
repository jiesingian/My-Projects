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

function readableDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function daysAgo(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  return Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - then.getTime()) / 86_400_000);
}

/** What a routine is behind on, and a way to answer for any other day —
 * ahead of time, or after the fact against the day it actually happened
 * rather than the day it was remembered. */
export function RoutineOccurrences({
  routineId,
  overdue,
  upcoming,
  cost,
  currency,
}: {
  routineId: string;
  overdue: string[];
  upcoming: string[];
  cost: number | null;
  currency: string;
}) {
  const { pending, error, run } = useRoutineAction();
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState(upcoming[0] ?? overdue[0] ?? "");

  const log = (date: string, status: "done" | "skipped") => run(() => logRoutineAction({ routineId, date, status }));
  const choices = [...overdue, ...upcoming];

  return (
    <div>
      {overdue.length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--cal-money) 14%, transparent)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <Icon name="info" size={14} style={{ color: "var(--cal-money)" }} />
            {overdue.length === 1 ? "One day still unanswered" : `${overdue.length} days still unanswered`}
          </div>
          {overdue.slice(0, 3).map((date) => (
            <div key={date} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ flex: 1, minWidth: 110, fontSize: 13 }}>
                {readableDate(date)}
                <span style={{ color: "var(--color-neutral-700)" }}> · {daysAgo(date)}d ago</span>
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minHeight: 30, fontSize: 12.5, padding: "0 11px", gap: 4 }}
                disabled={pending}
                onClick={() => log(date, "done")}
              >
                <Icon name="check" size={13} />
                Done that day
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 30, fontSize: 12.5, padding: "0 8px" }}
                disabled={pending}
                onClick={() => log(date, "skipped")}
              >
                Skipped
              </button>
            </div>
          ))}
          {overdue.length > 3 && (
            <div style={{ fontSize: 12.5, color: "var(--color-neutral-700)" }}>
              and {overdue.length - 3} earlier — use “Another day” below.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        {!picking ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 30, fontSize: 12.5, padding: "0 8px", gap: 4 }}
            onClick={() => setPicking(true)}
            disabled={choices.length === 0}
          >
            <Icon name="calendarDays" size={13} />
            Another day
          </button>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="input"
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              style={{ minHeight: 38, fontSize: 13, flex: 1, minWidth: 150 }}
              aria-label="Which day to mark"
            >
              {overdue.length > 0 && (
                <optgroup label="Not answered for">
                  {overdue.map((d) => (
                    <option key={d} value={d}>
                      {readableDate(d)}
                    </option>
                  ))}
                </optgroup>
              )}
              {upcoming.length > 0 && (
                <optgroup label="Still to come">
                  {upcoming.map((d) => (
                    <option key={d} value={d}>
                      {readableDate(d)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: 38, fontSize: 13, padding: "0 13px", gap: 4 }}
              disabled={pending || !chosen}
              onClick={() => log(chosen, "done")}
            >
              <Icon name="check" size={13} />
              Done
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: 38, fontSize: 13, padding: "0 11px" }}
              disabled={pending || !chosen}
              onClick={() => log(chosen, "skipped")}
            >
              Skip
            </button>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 38, fontSize: 12.5, padding: "0 8px" }} onClick={() => setPicking(false)}>
              Close
            </button>
          </div>
        )}
        {picking && upcoming.includes(chosen) && (
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-700)", marginTop: 6 }}>
            Marking a day ahead of time is fine — it counts on {readableDate(chosen)}
            {cost ? `, and posts ${currency === "PHP" ? "₱" : `${currency} `}${cost.toLocaleString("en-PH")}` : ""}.
          </div>
        )}
        {error && <div style={{ fontSize: 12.5, color: "var(--cal-occasion)", marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}
