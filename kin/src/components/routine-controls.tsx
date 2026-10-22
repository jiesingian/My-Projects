"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logRoutineAction, clearRoutineLogAction, setRoutinePausedAction, deleteRoutineAction } from "@/lib/actions/routines";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { familyDay, daysBetween, readableDay } from "@/lib/time";
import { newOpId, sendOrQueue, useQueue } from "@/lib/offline/live";

function useRoutineAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // `queued`: kept on the phone with no signal (lib/offline); a refresh with
  // no network would leave the page, so it waits for the replay instead.
  const run = (fn: () => Promise<{ error: string | null; queued?: boolean }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      if (!result.queued) router.refresh();
    });
  };

  return { pending, error, run };
}

/** Done or skipped for one day: sent now, or with no signal kept in the
 * offline queue (app/api/offline/replay decides who wins on reconnect). */
function logChore(routineId: string, title: string, date: string, status: "done" | "skipped") {
  return sendOrQueue(
    () => logRoutineAction({ routineId, date, status }),
    () => ({ id: newOpId(), at: new Date().toISOString(), kind: "chore.log", routineId, date, status, label: title }),
  );
}

/** What this phone has waiting to send for a chore, by day. */
function useQueuedChore(routineId: string): Map<string, "done" | "skipped"> {
  const queue = useQueue();
  const out = new Map<string, "done" | "skipped">();
  for (const q of queue) if (q.kind === "chore.log" && q.routineId === routineId) out.set(q.date, q.status);
  return out;
}

/** Done or skipped for today's occurrence, and a way back if it was a
 * mis-tap. What is already answered for reads as a state, not a button. */
export function RoutineTick({
  routineId,
  title = "A chore",
  date,
  status,
  cost,
  currency,
}: {
  routineId: string;
  title?: string;
  date: string;
  status: "done" | "skipped" | null;
  cost: number | null;
  currency: string;
}) {
  const { pending, error, run } = useRoutineAction();
  // Only a tick made just now celebrates. The chip is also what a chore done
  // this morning looks like on every later visit, and a burst each time the
  // page opens would stop meaning anything.
  const [celebrate, setCelebrate] = useState(false);
  // The answer shows the moment it is tapped; the server's replaces it when
  // it comes back (or the old state returns, with the error, if it fails).
  const [optimistic, setShown] = useOptimistic(status);
  const queued = useQueuedChore(routineId).get(date);
  const shown = queued ?? optimistic;

  if (shown) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          className={celebrate && shown === "done" ? "kin-done-chip kin-celebrate" : "kin-done-chip"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3125rem",
            minHeight: "1.875rem",
            padding: "0 0.6875rem",
            borderRadius: 999,
            fontSize: "0.8125rem",
            fontWeight: 500,
            background: shown === "done" ? "color-mix(in srgb, var(--color-switch-on) 18%, transparent)" : "color-mix(in srgb, var(--color-text) 7%, transparent)",
            color: shown === "done" ? "var(--color-neutral-900)" : "var(--color-neutral-700)",
          }}
        >
          <Icon name={shown === "done" ? "check" : "x"} size={14} />
          {shown === "done" ? "Done today" : "Skipped today"}
          {queued && " · waiting to send"}
        </span>
        {!queued && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" }}
          disabled={pending}
          onClick={() => run(async () => { setShown(null); return clearRoutineLogAction(routineId, date); })}
        >
          Undo
        </button>
        )}
        {error && <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)" }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-primary"
        style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem", gap: "0.3125rem" }}
        disabled={pending}
        onClick={() => {
          setCelebrate(true);
          // A short tick of haptic feedback where the phone offers it (Android);
          // iOS Safari has no vibration API and simply skips this.
          navigator.vibrate?.(12);
          run(async () => { setShown("done"); return logChore(routineId, title, date, "done"); });
        }}
      >
        <Icon name="check" size={14} />
        Done
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}
        disabled={pending}
        onClick={() => run(async () => { setShown("skipped"); return logChore(routineId, title, date, "skipped"); })}
      >
        Skip
      </button>
      {cost ? (
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)" }}>
          posts {formatCurrency(cost, currency)}
        </span>
      ) : null}
      {error && <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)" }}>{error}</span>}
    </div>
  );
}

export function RoutinePauseButton({ id, paused }: { id: string; paused: boolean }) {
  const { pending, run } = useRoutineAction();
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem", gap: "0.25rem" }}
      disabled={pending}
      onClick={() => run(() => setRoutinePausedAction(id, !paused))}
      aria-label={paused ? "Resume this task" : "Pause this task"}
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
        style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem", color: "var(--color-neutral-700)" }}
        onClick={() => setConfirming(true)}
      >
        Remove
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", fontSize: "0.78125rem" }}>
      <span style={{ color: "var(--color-neutral-700)" }}>Remove “{title}”?</span>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem", color: "var(--cal-occasion-ink)" }}
        disabled={pending}
        onClick={() => run(() => deleteRoutineAction(id))}
      >
        Remove
      </button>
      <button type="button" className="btn btn-ghost" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" }} onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  );
}

function readableDate(iso: string): string {
  return readableDay(iso);
}

/** How far behind a routine is, counted in the household's days rather than
 * the browser's. Asking the browser gave a different answer from the server
 * whenever the two zones were on different dates, which is a rendered number
 * and so a hydration mismatch. */
function daysAgo(iso: string): number {
  return daysBetween(iso, familyDay()) ?? 0;
}

/** What a routine is behind on, and a way to answer for any other day —
 * ahead of time, or after the fact against the day it actually happened
 * rather than the day it was remembered. */
export function RoutineOccurrences({
  routineId,
  title = "A chore",
  overdue: overdueAll,
  upcoming,
  cost,
  currency,
}: {
  routineId: string;
  title?: string;
  overdue: string[];
  upcoming: string[];
  cost: number | null;
  currency: string;
}) {
  const { pending, error, run } = useRoutineAction();
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState(upcoming[0] ?? overdueAll[0] ?? "");

  const log = (date: string, status: "done" | "skipped") => run(() => logChore(routineId, title, date, status));
  // Days answered with no signal, waiting to send, drop out of "unanswered".
  const queued = useQueuedChore(routineId);
  const overdue = overdueAll.filter((d) => !queued.has(d));
  const choices = [...overdue, ...upcoming.filter((d) => !queued.has(d))];

  return (
    <div>
      {overdue.length > 0 && (
        <div
          style={{
            marginTop: "0.625rem",
            padding: "0.625rem 0.75rem",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--cal-money) 14%, transparent)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            <Icon name="info" size={14} style={{ color: "var(--cal-money-ink)" }} />
            {overdue.length === 1 ? "One day still unanswered" : `${overdue.length} days still unanswered`}
          </div>
          {overdue.slice(0, 3).map((date) => (
            <div key={date} style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.375rem" }}>
              <span style={{ flex: 1, minWidth: "6.875rem", fontSize: "0.8125rem" }}>
                {readableDate(date)}
                <span style={{ color: "var(--color-neutral-700)" }}> · {daysAgo(date)}d ago</span>
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.6875rem", gap: "0.25rem" }}
                disabled={pending}
                onClick={() => log(date, "done")}
              >
                <Icon name="check" size={13} />
                Done that day
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" }}
                disabled={pending}
                onClick={() => log(date, "skipped")}
              >
                Skipped
              </button>
            </div>
          ))}
          {overdue.length > 3 && (
            <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)" }}>
              and {overdue.length - 3} earlier — use “Another day” below.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: "0.5rem" }}>
        {!picking ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem", gap: "0.25rem" }}
            onClick={() => setPicking(true)}
            disabled={choices.length === 0}
          >
            <Icon name="calendarDays" size={13} />
            Another day
          </button>
        ) : (
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="input"
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              style={{ minHeight: "2.375rem", fontSize: "0.8125rem", flex: 1, minWidth: "9.375rem" }}
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
              style={{ minHeight: "2.375rem", fontSize: "0.8125rem", padding: "0 0.8125rem", gap: "0.25rem" }}
              disabled={pending || !chosen}
              onClick={() => log(chosen, "done")}
            >
              <Icon name="check" size={13} />
              Done
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: "2.375rem", fontSize: "0.8125rem", padding: "0 0.6875rem" }}
              disabled={pending || !chosen}
              onClick={() => log(chosen, "skipped")}
            >
              Skip
            </button>
            <button type="button" className="btn btn-ghost" style={{ minHeight: "2.375rem", fontSize: "0.78125rem", padding: "0 0.5rem" }} onClick={() => setPicking(false)}>
              Close
            </button>
          </div>
        )}
        {picking && upcoming.includes(chosen) && (
          <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)", marginTop: "0.375rem" }}>
            Marking a day ahead of time is fine — it counts on {readableDate(chosen)}
            {cost ? `, and posts ${formatCurrency(cost, currency)}` : ""}.
          </div>
        )}
        {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion-ink)", marginTop: "0.375rem" }}>{error}</div>}
      </div>
    </div>
  );
}
