"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ErrorText } from "@/components/form";
import { TaskRow } from "@/components/today-task-list";
import { markTodayItemAction, unmarkTodayItemAction } from "@/lib/actions/today";
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
  return (
    <>
      {entries.map((e) => (e.kind === "task" ? <TaskRow key={`t-${e.task.id}`} task={e.task} /> : <ItemRow key={e.item.id} item={e.item} />))}
    </>
  );
}

/** A due thing that is not a chore, in the chore card's shape, so the list
 * reads as one. The title opens its place in Kin; the buttons answer it. */
function ItemRow({ item }: { item: BriefItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const mark = (state: "done" | "skipped") =>
    startTransition(async () => {
      setError(null);
      const r = await markTodayItemAction(item.id, state);
      if (r.error) setError(r.error);
      router.refresh();
    });
  const undo = () =>
    startTransition(async () => {
      setError(null);
      const r = await unmarkTodayItemAction(item.id);
      if (r.error) setError(r.error);
      router.refresh();
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
          {item.mark ? (
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
