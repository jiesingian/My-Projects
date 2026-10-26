"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RowButton, RowState, TodayRow } from "@/components/today-row";
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

  return (
    <TodayRow
      href={dose.href}
      icon="pill"
      tintColor="var(--cal-occasion)"
      title={doseTitle(dose)}
      struck={allTaken}
      accent={allTaken ? "done" : dose.late ? "urgent" : null}
      faded={allTaken}
      meta={
        allTaken ? (
          <RowState icon="check" tone="strong">
            All taken today
          </RowState>
        ) : (
          doseMeta(dose)
        )
      }
      metaStyle={dose.late && !allTaken ? { color: "var(--cal-money-ink)" } : undefined}
      actions={
        <>
          {waiting ? <WaitingToSend /> : !allTaken && <RowButton kind="primary" icon="check" label="Taken" disabled={pending} onClick={() => set(dose.next!, true)} />}
          {!waiting && dose.taken.length > 0 && <RowButton kind="ghost" label="Undo" disabled={pending} onClick={() => set(dose.taken[dose.taken.length - 1], false)} />}
        </>
      }
      line={<ErrorText message={error} />}
    />
  );
}
