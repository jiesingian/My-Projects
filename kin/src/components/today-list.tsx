"use client";

import { useHouseholdZone } from "@/components/household-zone";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ErrorText } from "@/components/form";
import { OFFLINE_ONLY_DONE, TaskRow, WaitingToSend } from "@/components/today-task-list";
import { markTodayItemAction, unmarkTodayItemAction } from "@/lib/actions/today";
import { isNetworkFailure, isOffline, newOpId, queueOffline, useQueue } from "@/lib/offline/live";
import { familyDay } from "@/lib/time";
import type { BriefItem } from "@/lib/queries/today";
import type { RoutineView } from "@/lib/queries/routines";

/** One entry in Today's list: a chore, or anything else that is due today. */
export type TodayEntry = { kind: "task"; task: RoutineView } | { kind: "item"; item: BriefItem };

const TINT: Record<BriefItem["tint"], string> = {
  money: "var(--cal-money)",
  schedule: "var(--cal-schedule)",
  occasion: "var(--cal-occasion)",
  home: "var(--cal-home, var(--cal-schedule))",
};

/** Today as one list (approved 28 September): chores and everything else due
 * today, urgent first, then in the order the day happens, finished ones at the
 * bottom. The order is decided on the server (today/page.tsx), so the phone
 * and the server always agree on it. */
export function TodayList({ entries }: { entries: TodayEntry[] }) {
  // "Done" tapped while offline waits in the queue (lib/offline/live); read
  // once here rather than once a row.
  const queue = useQueue();
  const waiting = new Set(queue.flatMap((q) => (q.kind === "today.mark" ? [q.key] : [])));
  return (
    <>
      {entries.map((e) =>
        e.kind === "task" ? (
          <TaskRow key={`t-${e.task.id}`} task={e.task} queued={waiting.has(`chore-${e.task.id}`)} />
        ) : (
          <ItemRow key={e.item.id} item={e.item} queued={waiting.has(e.item.id)} />
        ),
      )}
    </>
  );
}

/** A due thing that is not a chore, in the chore card's shape, so the list
 * reads as one. The title opens its place in Kin; the buttons answer it. */
function ItemRow({ item, queued }: { item: BriefItem; queued: boolean }) {
  const tz = useHouseholdZone();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // What the offline queue can carry: a plan or a health item marked done
  // (the same rule as the saved copy, lib/offline/snapshot).
  const queueable = item.action === "done" && /^(activity|health)-/.test(item.id);
  const later = async (state: "done" | "skipped") => {
    if (state !== "done" || !queueable) return setError(OFFLINE_ONLY_DONE);
    const why = await queueOffline({ id: newOpId(), at: new Date().toISOString(), kind: "today.mark", key: item.id, day: familyDay(new Date(), tz), label: item.title });
    if (why) setError(why);
  };
  const mark = (state: "done" | "skipped") =>
    startTransition(async () => {
      setError(null);
      if (isOffline()) return later(state);
      try {
        const r = await markTodayItemAction(item.id, state);
        if (r.error) setError(r.error);
        router.refresh();
      } catch (e) {
        if (isNetworkFailure(e)) await later(state);
        else setError("That didn't save. Try again.");
      }
    });
  const undo = () =>
    startTransition(async () => {
      setError(null);
      if (isOffline()) return setError(OFFLINE_ONLY_DONE);
      try {
        const r = await unmarkTodayItemAction(item.id);
        if (r.error) setError(r.error);
        router.refresh();
      } catch {
        setError(isOffline() ? OFFLINE_ONLY_DONE : "That didn't save. Try again.");
      }
    });

  const small = { minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem", gap: "0.3125rem" } as const;

  return (
    <Blueprint
      style={{
        padding: "0.8125rem",
        marginBottom: "0.5625rem",
        boxShadow: item.mark === "done" ? "inset 3px 0 0 var(--color-switch-on)" : !item.mark && item.urgent ? "inset 3px 0 0 var(--cal-money)" : undefined,
        opacity: item.mark ? 0.78 : 1,
      }}
    >
      <Link href={item.href} style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start", color: "inherit", textDecoration: "none" }}>
        <span className="kin-tile3d" style={{ width: 30, height: 30, flex: "none", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: TINT[item.tint], color: "#fff" }}>
          <Icon name={item.icon} size={16} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", font: "600 0.96875rem/1.2 var(--font-heading)", textDecoration: item.mark ? "line-through" : undefined }}>{item.title}</span>
          <span style={{ display: "block", fontSize: "0.78125rem", color: item.urgent && !item.mark ? "var(--cal-money)" : "var(--color-neutral-600)", marginTop: "0.125rem" }}>{item.meta}</span>
        </span>
      </Link>

      {item.action && (
        <div style={{ marginTop: "0.625rem", display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
          {queued && !item.mark ? (
            <WaitingToSend />
          ) : item.mark ? (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3125rem", fontSize: "0.78125rem", fontWeight: 500 }}>
                <Icon name={item.mark === "done" ? "check" : "x"} size={14} />
                {item.mark === "done" ? "Done today" : "Skipped today"}
              </span>
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={undo} style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem" }}>
                Undo
              </button>
            </>
          ) : (
            <>
              {item.action === "done" ? (
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => mark("done")} style={small}>
                  <Icon name="check" size={14} />
                  Done
                </button>
              ) : (
                // Paying records money leaving an account, and shopping is
                // ticking the list; both happen where they live.
                <Link href={item.href} className="btn btn-primary" style={small}>
                  <Icon name={item.action === "pay" ? "wallet" : "basket"} size={14} />
                  {item.action === "pay" ? "Pay" : "Shop"}
                </Link>
              )}
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => mark("skipped")} style={{ ...small, padding: "0 0.75rem" }}>
                Skip
              </button>
            </>
          )}
        </div>
      )}
      <ErrorText message={error} />
    </Blueprint>
  );
}
