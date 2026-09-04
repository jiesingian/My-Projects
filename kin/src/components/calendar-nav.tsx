"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/* `hrefBase` is the page's own URL up to and including `date=`, so these
   controls can drive any calendar — the Planner's, the meal plan's — without
   knowing anything about it. A server component can pass a string; it could
   not pass a function. */

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Which period the header is naming. It starts as the anchored date the
 * server rendered, and the month scroller moves it as the user scrolls, so
 * the title always names the month actually on screen. */
type Period = { label: string; iso: string };

const PeriodCtx = createContext<{ period: Period; set: (label: string, iso: string) => void } | null>(null);

export function CalendarPeriod({ label, iso, children }: { label: string; iso: string; children: React.ReactNode }) {
  const [period, setPeriod] = useState<Period>({ label, iso });
  // Ignore a repeat of what is already showing, so a scroll that stays within
  // one month doesn't re-render the header on every frame.
  const set = useCallback((l: string, i: string) => {
    setPeriod((p) => (p.label === l && p.iso === i ? p : { label: l, iso: i }));
  }, []);
  const value = useMemo(() => ({ period, set }), [period, set]);
  return <PeriodCtx.Provider value={value}>{children}</PeriodCtx.Provider>;
}

/** The period title doubles as the jump control: tap it and pick any month,
 * year, or exact day, instead of stepping there one arrow at a time. */
export function CalendarJump({
  label: serverLabel,
  hrefBase,
  anchor: serverAnchor,
}: {
  label: string;
  hrefBase: string;
  anchor: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // What the header names follows the scroller when there is one; without a
  // provider it is simply what the server rendered.
  const ctx = useContext(PeriodCtx);
  const label = ctx?.period.label ?? serverLabel;
  const anchor = ctx?.period.iso ?? serverAnchor;
  const anchorYear = Number(anchor.slice(0, 4));
  const anchorMonth = Number(anchor.slice(5, 7)) - 1;
  // Which month the sheet is showing, and whether it is showing its days or
  // the twelve months. Days first: picking a date is what this is for, and a
  // grid of months made that two taps and a guess.
  const [year, setYear] = useState(anchorYear);
  const [month, setMonth] = useState(anchorMonth);
  const [picking, setPicking] = useState<"days" | "months">("days");

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

  const go = (target: string) => {
    setOpen(false);
    router.push(`${hrefBase}${target}`);
    // Same reason as Today: picking the date already shown navigates nowhere.
    requestAnimationFrame(recentreCalendar);
  };

  /** Step the shown month, rolling into the next or previous year. */
  const stepMonth = (by: number) => {
    const next = month + by;
    if (next < 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else if (next > 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth(next);
    }
  };

  const leadingBlanks = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now = new Date();
  const todayISO = iso(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Open where the calendar now is, not on the month last left behind.
          setYear(anchorYear);
          setMonth(anchorMonth);
          setPicking("days");
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "none",
          border: 0,
          padding: "2px 0",
          cursor: "pointer",
          font: "600 20px/1.2 var(--font-heading)",
          letterSpacing: "-0.02em",
          color: "var(--color-text)",
          textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <Icon name="chevronLeft" size={15} style={{ transform: "rotate(-90deg)", flex: "none", color: "var(--color-accent)" }} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Jump to a date"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.32)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="kin-glass-bar"
            style={{
              width: "100%",
              maxWidth: 480,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderTop: "1px solid var(--glass-border)",
              padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 14px" }} />

            {/* The month being shown, and the way through the years. The
                title itself opens the twelve months, for a jump too far to
                make with the arrows. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                aria-label={picking === "days" ? "Previous month" : "Previous year"}
                onClick={() => (picking === "days" ? stepMonth(-1) : setYear((y) => y - 1))}
                style={{ width: 34, height: 34 }}
              >
                <Icon name="chevronLeft" size={16} />
              </button>
              <button
                type="button"
                onClick={() => setPicking((p) => (p === "days" ? "months" : "days"))}
                aria-label={picking === "days" ? "Pick a month" : "Back to the days"}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                  font: "600 19px/1 var(--font-heading)",
                  color: "var(--color-text)",
                }}
              >
                {picking === "days" ? `${MONTHS_LONG[month]} ${year}` : year}
                <Icon
                  name="chevronLeft"
                  size={14}
                  style={{ transform: picking === "days" ? "rotate(-90deg)" : "rotate(90deg)", color: "var(--color-accent)" }}
                />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                aria-label={picking === "days" ? "Next month" : "Next year"}
                onClick={() => (picking === "days" ? stepMonth(1) : setYear((y) => y + 1))}
                style={{ width: 34, height: 34 }}
              >
                <Icon name="chevronLeft" size={16} style={{ transform: "rotate(180deg)" }} />
              </button>
            </div>

            {picking === "days" ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 2, marginBottom: 2 }}>
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <div key={i} style={{ textAlign: "center", fontSize: 11, color: "var(--color-neutral-600)" }}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Every day of the month, one tap each. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 2 }}>
                  {Array.from({ length: leadingBlanks }, (_, i) => (
                    <span key={`blank-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const target = iso(year, month, day);
                    const isSelected = target === anchor;
                    const isToday = target === todayISO;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => go(target)}
                        aria-label={new Date(year, month, day).toLocaleDateString("en-GB", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        aria-current={isSelected ? "date" : undefined}
                        style={{
                          height: 40,
                          borderRadius: 999,
                          border: 0,
                          cursor: "pointer",
                          fontFamily: "var(--font-body)",
                          fontSize: 15.5,
                          fontWeight: isSelected || isToday ? 600 : 400,
                          background: isSelected ? "var(--color-accent)" : "transparent",
                          color: isSelected ? "#fff" : isToday ? "var(--color-accent)" : "var(--color-text)",
                          boxShadow: isToday && !isSelected ? "inset 0 0 0 1.5px var(--color-accent)" : "none",
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {MONTHS.map((m, i) => {
                  const active = i === month && year === anchorYear;
                  return (
                    <button
                      key={m}
                      type="button"
                      // Choosing a month shows its days rather than jumping
                      // to one: the day is what is being picked.
                      onClick={() => {
                        setMonth(i);
                        setPicking("days");
                      }}
                      style={{
                        padding: "11px 0",
                        borderRadius: 12,
                        border: 0,
                        cursor: "pointer",
                        fontFamily: "var(--font-body)",
                        fontSize: 15,
                        fontWeight: active ? 600 : 500,
                        background: active ? "var(--color-accent)" : "color-mix(in srgb, var(--color-text) 7%, transparent)",
                        color: active ? "#fff" : "var(--color-text)",
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, minHeight: 44 }}
                onClick={() => {
                  const n = new Date();
                  go(iso(n.getFullYear(), n.getMonth(), n.getDate()));
                }}
              >
                Today
              </button>
              <button type="button" className="btn btn-ghost" style={{ flex: 1, minHeight: 44 }} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* Both scrollers are `position: relative`, so a child's offsetLeft/offsetTop
   is already measured against the scroller — no further adjustment. */
function centreRail(rail: HTMLElement) {
  const el = rail.querySelector<HTMLElement>("[data-selected='true']");
  if (el) rail.scrollLeft = el.offsetLeft - rail.clientWidth / 2 + el.clientWidth / 2;
}

function topMonth(box: HTMLElement) {
  const el = box.querySelector<HTMLElement>("[data-anchor-month='true']");
  if (el) box.scrollTop = el.offsetTop;
}

/** Bring every calendar scroller back to whatever it has marked as current.
 * Today needs this on its own: when the calendar is already anchored on
 * today, its link is the URL you are on, nothing navigates, and a rail the
 * user has scrolled by hand would otherwise just sit there. */
export function recentreCalendar() {
  document.querySelectorAll<HTMLElement>(".cal-rail").forEach(centreRail);
  document.querySelectorAll<HTMLElement>(".cal-months").forEach(topMonth);
}

/** Horizontal date rail. The server renders the days; this only makes the
 * rail scroll and centres the selected day, so swiping through weeks needs
 * no round trip. Re-centres whenever the anchor moves: the rendered window
 * of days shifts with it, so a stale scroll offset would point at the
 * wrong dates. */
export function DateRail({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) centreRail(ref.current);
  }, [anchor]);

  return (
    <div ref={ref} className="cal-rail">
      {children}
    </div>
  );
}

/** Vertical month scroller — consecutive months in one continuous column,
 * opened at the month being looked at, and re-opened there when it moves.
 * As it scrolls it reports whichever month has reached the top, so the
 * header keeps naming what is on screen rather than where you started. */
export function MonthScroller({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = useContext(PeriodCtx)?.set;

  useEffect(() => {
    if (ref.current) topMonth(ref.current);
  }, [anchor]);

  useEffect(() => {
    const box = ref.current;
    if (!box || !set) return;

    let frame = 0;
    const report = () => {
      frame = 0;
      const blocks = Array.from(box.querySelectorAll<HTMLElement>("[data-month-label]"));
      // Whichever month covers a point a third of the way down the viewport.
      // Measuring at the very top edge instead would misname the last month:
      // scrolling stops with it fully in view but its top still below the
      // edge, so the month above would win despite being nearly gone.
      const probe = box.scrollTop + box.clientHeight * 0.35;
      const current = blocks.filter((b) => b.offsetTop <= probe).pop() ?? blocks[0];
      if (current?.dataset.monthLabel && current.dataset.monthIso) {
        set(current.dataset.monthLabel, current.dataset.monthIso);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(report);
    };

    report();
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      box.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [set, anchor]);

  return (
    <div ref={ref} className="cal-months">
      {children}
    </div>
  );
}

/** Today. Navigates to the current date, and re-centres the scrollers by
 * hand for the case where that is the date already shown. */
export function TodayButton({ hrefBase }: { hrefBase: string }) {
  const now = new Date();
  const target = iso(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <Link
      href={`${hrefBase}${target}`}
      onClick={() => requestAnimationFrame(recentreCalendar)}
      className="btn btn-secondary"
      style={{ minHeight: 34, fontSize: 13, padding: "0 12px" }}
    >
      Today
    </Link>
  );
}
