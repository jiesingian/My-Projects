"use client";

import { useHouseholdZone } from "@/components/household-zone";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { RowButton, RowState, TodayRow } from "@/components/today-row";
import { logRoutineAction, clearRoutineLogAction } from "@/lib/actions/routines";
import { isNetworkFailure, isOffline, newOpId, queueOffline } from "@/lib/offline/live";
import { ROUTINE_KIND_META, formatTimeOfDay, type RoutineKind } from "@/lib/routines";
import { familyDay } from "@/lib/time";
import type { RoutineView } from "@/lib/queries/routines";
import { streakLabel, STREAK_BONUS, type ChoreStreak } from "@/lib/streaks";

/** Today's tasks, with who is on each one, a tap to mark it done or skipped,
 * an optional note on how it went, and a way back if a tap was wrong — the
 * same jobs Planner's routine rows do, read out for the one day this page is
 * about rather than the whole week. */
export function TodayTaskList({ tasks }: { tasks: RoutineView[] }) {
  const dueToday = tasks.filter((t) => t.today);
  const overdueOnly = tasks.filter((t) => !t.today && t.overdue.length > 0);

  if (dueToday.length === 0 && overdueOnly.length === 0) return null;

  return (
    <section style={{ marginBottom: "1.625rem" }}>
      <h3 className="kin-eyebrow">Today&rsquo;s tasks</h3>
      {dueToday.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
      {overdueOnly.length > 0 && (
        <Blueprint style={{ padding: "0.75rem 0.875rem", display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.5625rem" }}>
          <Icon name="info" size={16} style={{ color: "var(--cal-money-ink)", flex: "none" }} />
          <span style={{ flex: 1, fontSize: "0.84375rem" }}>
            {overdueOnly.length} task{overdueOnly.length === 1 ? "" : "s"} behind on other days —{" "}
            <Link href="/planner?seg=routines" style={{ color: "var(--color-accent-700)", fontWeight: 500 }}>
              catch up on Planner
            </Link>
          </span>
        </Blueprint>
      )}
    </section>
  );
}

/** "Done", tapped offline and waiting to send. */
export function WaitingToSend() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3125rem", fontSize: "0.75rem", fontWeight: 500, color: "var(--color-neutral-700)", textAlign: "right" }}>
      <Icon name="clock" size={14} />
      Sends when online
    </span>
  );
}

export const OFFLINE_ONLY_DONE = "You're offline. Only Done can wait to send — try this again with a signal.";

/** `queued`: Done was tapped offline and is waiting to send (TodayList reads
 * the queue). */
export function TaskRow({ task, queued = false }: { task: RoutineView; queued?: boolean }) {
  const tz = useHouseholdZone();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = task.today!;
  const meta = ROUTINE_KIND_META[(task.kind as RoutineKind) ?? "other"] ?? ROUTINE_KIND_META.other;
  const whoFor = task.appliesToAll
    ? "Whole family"
    : task.rotates
      ? `Taking turns · ${task.members.map((m) => m.name.split(" ")[0]).join(", ")}`
      : task.members.map((m) => m.name.split(" ")[0]).join(", ") || "House";

  // Offline, Done waits in the queue (lib/offline/live); the replay logs it
  // as done.
  const later = async (status: "done" | "skipped") => {
    if (status !== "done") return setError(OFFLINE_ONLY_DONE);
    const why = await queueOffline({ id: newOpId(), at: new Date().toISOString(), kind: "today.mark", key: `chore-${task.id}`, day: familyDay(new Date(), tz), date: today.date, label: task.title });
    if (why) setError(why);
  };

  const log = (status: "done" | "skipped") => {
    setError(null);
    startTransition(async () => {
      if (isOffline()) return later(status);
      try {
        const result = await logRoutineAction({ routineId: task.id, date: today.date, status, note: null });
        if (result.error) setError(result.error);
      } catch (e) {
        if (isNetworkFailure(e)) return later(status);
        setError("That didn't save. Try again.");
        return;
      }
      router.refresh();
    });
  };

  const undo = () => {
    setError(null);
    startTransition(async () => {
      if (isOffline()) return setError(OFFLINE_ONLY_DONE);
      try {
        const result = await clearRoutineLogAction(task.id, today.date);
        if (result.error) setError(result.error);
        router.refresh();
      } catch {
        setError(isOffline() ? OFFLINE_ONLY_DONE : "That didn't save. Try again.");
      }
    });
  };

  const answered = !!today.status;
  const approved = today.status === "done" && today.approval !== "pending" && today.approval !== "rejected";
  const who = task.rotates && today.assignee ? `${today.assignee.name.split(" ")[0]}'s turn` : whoFor;
  const when = task.timeOfDay ? ` · ${formatTimeOfDay(task.timeOfDay)}` : "";

  return (
    <TodayRow
      icon={meta.icon}
      tintColor="var(--cal-schedule)"
      title={task.title}
      struck={approved}
      accent={approved ? "done" : !today.status && task.overdue.length > 0 ? "urgent" : null}
      faded={approved}
      meta={
        !answered ? (
          `${who}${when}`
        ) : today.approval === "pending" ? (
          // A child's "done" is a claim until a grown-up says otherwise,
          // and saying "Done today" to them would be a small lie the
          // first time one got turned down.
          <RowState icon="clock">Waiting for a grown-up</RowState>
        ) : today.approval === "rejected" ? (
          <RowState icon="x" tone="warn">
            Sent back — have another go
          </RowState>
        ) : today.status === "done" ? (
          <RowState icon="check" tone="strong">
            Done today
          </RowState>
        ) : (
          <RowState icon="x">Skipped today</RowState>
        )
      }
      actions={
        queued && !today.status ? (
          <WaitingToSend />
        ) : !today.status ? (
          <>
            <RowButton kind="primary" icon="check" label="Done" disabled={pending} onClick={() => log("done")} />
            <RowButton kind="secondary" icon="x" label="Skip" disabled={pending} onClick={() => log("skipped")} />
          </>
        ) : (
          <RowButton kind="ghost" label="Undo" disabled={pending} onClick={undo} />
        )
      }
      line={
        <>
          {task.kidStreak && <StreakLine streak={task.kidStreak} doneToday={today.status === "done" && today.approval !== "rejected"} />}
          {/* A note written before 21 October still shows; new ones are
              no longer added here (Janine: more room on Today). */}
          {answered && today.note && <p className="kin-today-line" style={{ color: "var(--color-neutral-700)" }}>&ldquo;{today.note}&rdquo;</p>}
          {error && <p className="kin-today-line" style={{ color: "var(--cal-occasion-ink)" }}>{error}</p>}
        </>
      }
    />
  );
}

/** "🔥 7 days in a row" on a child's daily chore (agreed 28 September), with
 * what the run is heading for: the next bonus star, or the one just earned.
 * A week's freeze is mentioned only once it has been spent, so the line
 * never reads as a warning before anything has gone wrong. */
function StreakLine({ streak, doneToday }: { streak: ChoreStreak; doneToday: boolean }) {
  if (streak.days < 2) return null;
  const justEarned = doneToday && (streak.days === 7 || streak.days === 30);
  const toGo = streak.nextStarAt ? streak.nextStarAt - streak.days : null;
  const bonus = streak.bonus ?? STREAK_BONUS;
  return (
    <div className="kin-streak" data-earned={justEarned ? "true" : undefined}>
      <span className="kin-streak-run">
        <span aria-hidden="true">🔥</span> {streakLabel(streak.days)}
      </span>
      {justEarned ? (
        <span className="kin-streak-note">
          <span aria-hidden="true">⭐</span> +{bonus[streak.days as 7 | 30]} bonus points!
        </span>
      ) : toGo !== null ? (
        <span className="kin-streak-note">
          {toGo} more for +{bonus[streak.nextStarAt as 7 | 30]} <span aria-hidden="true">⭐</span>
          <span className="sr-only">bonus points</span>
        </span>
      ) : null}
      {streak.freezeUsedThisWeek && (
        <span className="kin-streak-note">
          <span aria-hidden="true">🧊</span> Freeze used this week
        </span>
      )}
    </div>
  );
}
