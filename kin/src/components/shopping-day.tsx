"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { SHOPPING_KINDS, setShoppingDayAction, clearShoppingDayAction } from "@/lib/actions/household";

/** Book the day this list gets bought on. It goes on the family calendar as
 * an activity, so it syncs to Google Calendar with everything else — the
 * to-buy list is only counting down to it. */
export function ShoppingDayControl({
  run,
}: {
  run: { id: string; title: string; iso: string; time: string; budget: number | null; source: "trip" | "routine" } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // A routine's turn is owned by the routine; changing it here would only
  // move one week of it. Booking a day is what this control does.
  const editable = run?.source === "trip" ? run : null;
  const [date, setDate] = useState(editable?.iso ?? "");
  const [time, setTime] = useState(editable?.time ?? "09:00");
  const [title, setTitle] = useState(editable?.title ?? SHOPPING_KINDS[0]);
  const [budget, setBudget] = useState(editable?.budget == null ? "" : String(editable.budget));

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
        {editable ? "Change" : run ? "Book a day" : "Set a shopping day"}
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
            run_(() =>
              setShoppingDayAction({
                id: editable?.id ?? null,
                date,
                time,
                title,
                budget: budget.trim() === "" ? null : Number(budget),
              }),
            )
          }
        >
          {pending ? "Saving…" : editable ? "Save" : "Put it on the calendar"}
        </button>
        {editable && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 42, fontSize: 13, padding: "0 12px" }}
            disabled={pending}
            onClick={() => run_(() => clearShoppingDayAction(editable.id))}
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
        It goes on the family calendar, and to Google Calendar with everything else.
      </p>
    </div>
  );
}
