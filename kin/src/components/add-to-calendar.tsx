"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { CALENDAR_STYLE } from "@/lib/calendar-style";
import { readableDay } from "@/lib/time";
import { QuickLine } from "@/components/quick-line";
import type { QuickMember } from "@/lib/quick-line";
import { AnimatedSheet } from "@/components/animated-sheet";

/** Everything the calendar shows can now be added from it. Each kind lives
 * in the hub that owns it — a bill belongs to Wealth, a meal to Household —
 * so this routes there rather than duplicating those forms. */
function destinations(date: string) {
  const d = `date=${date}`;
  return [
    // "Task", not "Activity": the Planner's tabs are Calendar, Tasks and
    // Events, so a thing filed as an activity was named after no tab in the
    // app and could be read back nowhere but the calendar grid it was added
    // from. The Tasks tab lists these now.
    { key: "activities", label: "Task", note: "Appointments, school, work", href: `/planner/new?type=task&${d}` },
    { key: "events", label: "Event", note: "Birthdays, anniversaries, travel", href: `/planner/new?type=event&${d}` },
    { key: "meal_plans", label: "Meal", note: "What's for dinner", href: `/household/meals/new?${d}` },
    { key: "bills", label: "Bill", note: "Due dates, in Wealth", href: `/wealth?seg=cashflow` },
    { key: "goals", label: "Goal", note: "Saving targets, in Wealth", href: `/wealth/add` },
  ] as const;
}

export function AddToCalendar({ date, members, meId, today }: { date: string; members: QuickMember[]; meId: string; today: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  const readable = readableDay(date, { long: true });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="btn btn-primary btn-block"
        style={{ minHeight: "3rem", fontSize: "1rem", marginTop: "1rem" }}
      >
        <Icon name="plus" size={17} /> Add to calendar
      </button>

      {/* The shared sheet (animated-sheet.tsx), not a hand-built one: it
          follows a swipe down and closes on it, as every other sheet does
          (Jonathan, 26 October: this one ignored the swipe). */}
      <AnimatedSheet
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        panelClassName="sheet-panel--plain"
        panelStyle={{ maxHeight: "88vh", overflowY: "auto", padding: "0.625rem 1rem calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
            <div className="sheet-grabber" style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 12px" }} />
            <div id={titleId} style={{ padding: "0 0.375rem 0.625rem", fontSize: "0.8125rem", color: "var(--color-neutral-700)" }}>Add to {readable}</div>
            {/* One-line add: a sentence with no day in it lands on this day. */}
            <div style={{ padding: "0.5rem 0 0.375rem" }}>
              <QuickLine members={members} meId={meId} today={today} defaultDate={date} />
            </div>

            {destinations(date).map((dest) => {
              const style = CALENDAR_STYLE[dest.key];
              return (
                <Link
                  key={dest.key}
                  href={dest.href}
                  scroll={dest.key === "bills"}
                  onClick={() => setOpen(false)}
                  style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6875rem 0.375rem", textDecoration: "none", color: "inherit", borderRadius: 12 }}
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
                    <span style={{ display: "block", fontSize: "1rem", fontWeight: 500 }}>{dest.label}</span>
                    <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-neutral-700)" }}>{dest.note}</span>
                  </span>
                  <Icon name="chevronLeft" size={15} style={{ transform: "rotate(180deg)", color: "var(--color-neutral-600)" }} />
                </Link>
              );
            })}

            <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.875rem", marginTop: "0.625rem" }} onClick={() => setOpen(false)}>
              Cancel
            </button>
      </AnimatedSheet>
    </>
  );
}
