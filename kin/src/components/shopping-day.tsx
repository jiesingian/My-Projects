"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import Link from "next/link";
import { setShoppingDayAction, clearShoppingDayAction, moveShoppingRunAction } from "@/lib/actions/household";
import { SHOPPING_KINDS } from "@/lib/grocery";

/** Book the day this list gets bought on. It goes on the family calendar as
 * an activity, so it syncs to Google Calendar with everything else — the
 * to-buy list is only counting down to it. */
export function ShoppingDayControl({
  run,
}: {
  run: {
    id: string;
    title: string;
    iso: string;
    time: string;
    budget: number | null;
    source: "trip" | "routine";
    occurrenceDate?: string;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // A booked trip is edited in place; a routine's turn is moved for that
  // week only, leaving the routine as it is.
  const booked = run?.source === "trip" ? run : null;
  const routine = run?.source === "routine" ? run : null;
  const [date, setDate] = useState(run?.iso ?? "");
  const [time, setTime] = useState(run?.time ?? "09:00");
  const [title, setTitle] = useState(run?.title ?? SHOPPING_KINDS[0]);
  const [budget, setBudget] = useState(run?.budget == null ? "" : String(run.budget));

  const run_ = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!date) {
            // Default to today, which is the day most lists are written for.
            const n = new Date();
            setDate(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`);
          }
          setOpen(true);
        }}
        className="btn btn-ghost"
        style={{ minHeight: 30, fontSize: 12.5, padding: "0 6px", gap: 4, color: "var(--color-accent)" }}
      >
        <Icon name="calendarDays" size={13} />
        {run ? "Change the day" : "Set a shopping day"}
      </button>
    );
  }

  return (
    <div style={{ padding: 12, borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 4%, transparent)", marginTop: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
        {SHOPPING_KINDS.map((k) => (
          <button key={k} type="button" className="chip" data-active={title === k} onClick={() => setTitle(k)}>
            {k}
          </button>
        ))}
      </div>

      <input
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="What the trip is"
        placeholder="Grocery run"
        style={{ minHeight: 40, fontSize: 14, marginBottom: 8 }}
      />

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Which day"
          style={{ flex: 2, minWidth: 0, minHeight: 40, fontSize: 14 }}
        />
        <input
          className="input"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="What time"
          style={{ flex: 1, minWidth: 0, minHeight: 40, fontSize: 14 }}
        />
      </div>

      <input
        className="input"
        inputMode="decimal"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        aria-label="Budget for this trip"
        placeholder="Budget for this trip (optional)"
        style={{ minHeight: 40, fontSize: 14, marginBottom: 10 }}
      />

      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: 42, fontSize: 14 }}
          disabled={pending || !date}
          onClick={() =>
            run_(() => {
              const amount = budget.trim() === "" ? null : Number(budget);
              if (routine?.occurrenceDate) {
                return moveShoppingRunAction({
                  routineId: routine.id,
                  occurrenceDate: routine.occurrenceDate,
                  date,
                  time,
                  title,
                  budget: amount,
                });
              }
              return setShoppingDayAction({ id: booked?.id ?? null, date, time, title, budget: amount });
            })
          }
        >
          {pending ? "Saving…" : routine ? "Move it to this day" : booked ? "Save" : "Put it on the calendar"}
        </button>
        {booked && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 42, fontSize: 13, padding: "0 12px" }}
            disabled={pending}
            onClick={() => run_(() => clearShoppingDayAction(booked.id))}
          >
            Call it off
          </button>
        )}
        <button type="button" className="btn btn-ghost" style={{ minHeight: 42, fontSize: 12.5, padding: "0 8px" }} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      {error && <div style={{ fontSize: 12.5, color: "var(--cal-occasion)", marginTop: 8 }}>{error}</div>}
      <p style={{ fontSize: 12, color: "var(--color-neutral-600)", margin: "10px 0 0", lineHeight: 1.45 }}>
        {routine ? (
          <>
            This moves <strong>just this one</strong> — the {routine.title.toLowerCase()} routine keeps its schedule, and the
            turn it replaces comes off the calendar. To change the routine itself,{" "}
            <Link href="/planner?seg=routines" style={{ textDecoration: "none" }}>
              open it in the Planner
            </Link>
            .
          </>
        ) : (
          <>It goes on the family calendar, and to Google Calendar with everything else.</>
        )}
      </p>
    </div>
  );
}
