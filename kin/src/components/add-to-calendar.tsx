"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { CALENDAR_STYLE } from "@/lib/calendar-style";

/** Everything the calendar shows can now be added from it. Each kind lives
 * in the hub that owns it — a bill belongs to Wealth, a meal to Household —
 * so this routes there rather than duplicating those forms. */
function destinations(date: string) {
  const d = `date=${date}`;
  return [
    { key: "activities", label: "Activity", note: "Appointments, school, work", href: `/planner/add?type=activity&${d}` },
    { key: "events", label: "Event", note: "Birthdays, anniversaries", href: `/planner/add?type=event&${d}` },
    { key: "trips", label: "Travel", note: "Trips and holidays", href: `/planner/add?type=trip&${d}` },
    { key: "meal_plans", label: "Meal", note: "What's for dinner", href: `/household/meals/new?${d}` },
    { key: "bills", label: "Bill", note: "Due dates, in Wealth", href: `/wealth?seg=bills` },
    { key: "goals", label: "Goal", note: "Saving targets, in Wealth", href: `/wealth/add` },
  ] as const;
}

export function AddToCalendar({ date }: { date: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const readable = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="btn btn-primary btn-block"
        style={{ minHeight: 48, fontSize: 16, marginTop: 16 }}
      >
        <Icon name="plus" size={17} /> Add to calendar
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="What would you like to add?"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="kin-glass-bar"
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "88vh",
              overflowY: "auto",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderTop: "1px solid var(--glass-border)",
              padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 12px" }} />
            <div style={{ padding: "0 6px 10px", fontSize: 13, color: "var(--color-neutral-700)" }}>Add to {readable}</div>

            {destinations(date).map((dest) => {
              const style = CALENDAR_STYLE[dest.key];
              return (
                <Link
                  key={dest.key}
                  href={dest.href}
                  onClick={() => setOpen(false)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 6px", textDecoration: "none", color: "inherit", borderRadius: 12 }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      flex: "none",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: style.color,
                      color: "#fff",
                    }}
                  >
                    <Icon name={style.icon as IconName} size={18} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>{dest.label}</span>
                    <span style={{ display: "block", fontSize: 13, color: "var(--color-neutral-700)" }}>{dest.note}</span>
                  </span>
                  <Icon name="chevronLeft" size={15} style={{ transform: "rotate(180deg)", color: "var(--color-neutral-600)" }} />
                </Link>
              );
            })}

            <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 46, marginTop: 10 }} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
