"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ErrorText } from "@/components/form";
import { WaitingToSend } from "@/components/today-task-list";
import { setDoseTakenAction } from "@/lib/actions/health-care";
import { newOpId, sendOrQueue, useQueue } from "@/lib/offline/live";
import { doseMeta, doseTitle, type TodayDose } from "@/lib/today-doses";

/** A medicine on Today's list (23 October), in the chore card's shape so the
 * list reads as one: the next dose to take, ticked here with "Taken" -- the
 * same tick as Health's and Simple Kin's (setDoseTakenAction), queued on the
 * phone when there is no signal (lib/offline, kind dose.set). Undo unticks
 * the last one. The title opens the person's medicines. */
export function DoseRow({ dose, day }: { dose: TodayDose; day: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // A tick waiting to send shows as sent, marked as waiting.
  const waiting = useQueue().some((q) => q.kind === "dose.set" && q.medicineId === dose.medicineId && q.day === day);
  const allTaken = dose.next === null;

  const set = (time: string, taken: boolean) =>
    startTransition(async () => {
      setError(null);
      const { error } = await sendOrQueue(
        () => setDoseTakenAction({ medicineId: dose.medicineId, memberId: dose.memberId, day, time, taken }),
        () => ({ id: newOpId(), at: new Date().toISOString(), kind: "dose.set", medicineId: dose.medicineId, memberId: dose.memberId, day, time, taken, label: `${doseTitle(dose)} at ${time}` }),
      );
      if (error) setError(error);
      else router.refresh();
    });

  const small = { minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem", gap: "0.3125rem" } as const;

  return (
    <Blueprint
      style={{
        padding: "0.8125rem",
        marginBottom: "0.5625rem",
        boxShadow: allTaken ? "inset 3px 0 0 var(--color-switch-on)" : dose.late ? "inset 3px 0 0 var(--cal-money)" : undefined,
        opacity: allTaken ? 0.78 : 1,
      }}
    >
      <Link href={dose.href} style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start", color: "inherit", textDecoration: "none" }}>
        <span className="kin-tile3d" style={{ width: 30, height: 30, flex: "none", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--cal-occasion)", color: "#fff" }}>
          <Icon name="pill" size={16} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", font: "600 0.96875rem/1.2 var(--font-heading)", textDecoration: allTaken ? "line-through" : undefined }}>{doseTitle(dose)}</span>
          <span style={{ display: "block", fontSize: "0.78125rem", color: dose.late && !allTaken ? "var(--cal-money-ink)" : "var(--color-neutral-600)", marginTop: "0.125rem" }}>{doseMeta(dose)}</span>
        </span>
      </Link>

      <div style={{ marginTop: "0.625rem", display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
        {waiting ? (
          <WaitingToSend />
        ) : allTaken ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3125rem", fontSize: "0.78125rem", fontWeight: 500 }}>
            <Icon name="check" size={14} />
            All taken today
          </span>
        ) : (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => set(dose.next!, true)} style={small}>
            <Icon name="check" size={14} />
            Taken
          </button>
        )}
        {!waiting && dose.taken.length > 0 && (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => set(dose.taken[dose.taken.length - 1], false)} style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem" }}>
            Undo
          </button>
        )}
      </div>
      <ErrorText message={error} />
    </Blueprint>
  );
}
