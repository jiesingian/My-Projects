"use client";

import { useHouseholdZone } from "@/components/household-zone";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { RowButton, RowState, TodayRow } from "@/components/today-row";
import { splitToday, TODAY_SHOWN } from "@/lib/today-fold";
import { ErrorText } from "@/components/form";
import { OFFLINE_ONLY_DONE, TaskRow, WaitingToSend } from "@/components/today-task-list";
import { markTodayItemAction, unmarkTodayItemAction } from "@/lib/actions/today";
import { isNetworkFailure, isOffline, newOpId, queueOffline, useQueue } from "@/lib/offline/live";
import { familyDay } from "@/lib/time";
import type { BriefItem } from "@/lib/queries/today";
import type { RoutineView } from "@/lib/queries/routines";
import type { TodayDose } from "@/lib/today-doses";
import { DoseRow } from "@/components/today-dose-row";
import { RsvpButtons } from "@/components/rsvp-buttons";

/** One entry in Today's list: a chore, a medicine (23 October), or anything
 * else that is due today. */
export type TodayEntry = { kind: "task"; task: RoutineView } | { kind: "item"; item: BriefItem } | { kind: "dose"; dose: TodayDose };

const ACTION_LABEL: Record<NonNullable<BriefItem["action"]>, string> = { done: "Done", pay: "Pay", shop: "Shop", record: "Record", confirm: "Confirm", receive: "Receive" };

const TINT: Record<BriefItem["tint"], string> = {
  money: "var(--cal-money)",
  schedule: "var(--cal-schedule)",
  occasion: "var(--cal-occasion)",
  home: "var(--cal-home, var(--cal-schedule))",
};

/** Today as one list (approved 28 September): chores and everything else due
 * today, urgent first, then in the order the day happens, finished ones at the
 * bottom. The order is decided on the server (today/page.tsx), so the phone
 * and the server always agree on it.
 *
 * A long day stays short (Jonathan, 26 October: "if a lot of tasks are
 * recorded, it might flood today"): the first five still open show, the
 * rest wait behind "Show N more", and what is answered folds into one
 * "N done today" line that opens to the rows (Undo lives there). */
export function TodayList({ entries }: { entries: TodayEntry[] }) {
  const tz = useHouseholdZone();
  // "Done" tapped while offline waits in the queue (lib/offline/live); read
  // once here rather than once a row.
  const queue = useQueue();
  const waiting = new Set(queue.flatMap((q) => (q.kind === "today.mark" ? [q.key] : [])));
  const day = familyDay(new Date(), tz);
  const [all, setAll] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const { open, more, done } = splitToday(entries, all ? Infinity : TODAY_SHOWN);
  const row = (e: TodayEntry) =>
    e.kind === "task" ? (
      <TaskRow key={`t-${e.task.id}`} task={e.task} queued={waiting.has(`chore-${e.task.id}`)} />
    ) : e.kind === "dose" ? (
      <DoseRow key={e.dose.id} dose={e.dose} day={day} />
    ) : (
      <ItemRow key={e.item.id} item={e.item} queued={waiting.has(e.item.id)} />
    );
  return (
    <>
      <div className="kin-today-rows">{open.map(row)}</div>
      {more > 0 && (
        <button type="button" className="kin-today-more" onClick={() => setAll(true)}>
          Show {more} more
          <Icon name="chevronLeft" size={14} className="kin-today-more-chev" />
        </button>
      )}
      {done.length > 0 && (
        <>
          <button type="button" className="kin-today-more" aria-expanded={doneOpen} onClick={() => setDoneOpen((v) => !v)}>
            <Icon name="check" size={14} />
            {done.length} done today
            <Icon name="chevronLeft" size={14} className="kin-today-more-chev" data-open={doneOpen || undefined} />
          </button>
          {doneOpen && <div className="kin-today-rows">{done.map(row)}</div>}
        </>
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

  const metaStyle = item.urgent && !item.mark ? { color: "color-mix(in srgb, var(--cal-money) 55%, var(--color-text))" } : undefined;

  return (
    <TodayRow
      href={item.href}
      icon={item.icon}
      tintColor={TINT[item.tint]}
      title={item.title}
      struck={!!item.mark}
      accent={item.mark === "done" ? "done" : !item.mark && item.urgent ? "urgent" : null}
      faded={!!item.mark}
      meta={
        item.mark === "done" ? (
          <RowState icon="check" tone="strong">
            Done today
          </RowState>
        ) : item.mark ? (
          <RowState icon="x">Skipped today</RowState>
        ) : (
          item.meta
        )
      }
      metaStyle={metaStyle}
      actions={
        !item.action ? null : queued && !item.mark ? (
          <WaitingToSend />
        ) : item.mark ? (
          <RowButton kind="ghost" label="Undo" disabled={pending} onClick={undo} />
        ) : (
          <>
            {item.action === "done" ? (
              <RowButton kind="primary" icon="check" label="Done" disabled={pending} onClick={() => mark("done")} />
            ) : (
              // Paying records money leaving an account, and shopping is
              // ticking the list; both happen where they live -- as do
              // recording money coming back, confirming a payment made
              // elsewhere and receiving income (23 October).
              <RowButton kind="primary" icon={item.action === "shop" ? "basket" : item.action === "confirm" ? "check" : "wallet"} label={ACTION_LABEL[item.action]} href={item.href} />
            )}
            <RowButton kind="secondary" icon="x" label="Skip" disabled={pending} onClick={() => mark("skipped")} />
          </>
        )
      }
      line={
        <>
          {item.rsvp && <RsvpButtons eventId={item.rsvp.eventId} memberId={item.rsvp.memberId} />}
          <ErrorText message={error} />
        </>
      }
    />
  );
}
