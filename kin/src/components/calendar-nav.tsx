"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function href(who: string, view: string, iso: string) {
  return `/planner?seg=calendar&who=${who}&view=${view}&date=${iso}`;
}

function clampDay(year: number, month: number, day: number) {
  const last = new Date(year, month + 1, 0).getDate();
  return Math.min(day, last);
}

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The period title doubles as the jump control: tap it and pick any month,
 * year, or exact day, instead of stepping there one arrow at a time. */
export function CalendarJump({
  label,
  who,
  view,
  anchor,
}: {
  label: string;
  who: string;
  view: string;
  anchor: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const anchorYear = Number(anchor.slice(0, 4));
  const anchorMonth = Number(anchor.slice(5, 7)) - 1;
  const anchorDay = Number(anchor.slice(8, 10));
  const [year, setYear] = useState(anchorYear);

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
    router.push(href(who, view, target));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Open where the calendar now is, not on the year last left behind.
          setYear(anchorYear);
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

            {/* Year */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                aria-label="Previous year"
                onClick={() => setYear((y) => y - 1)}
                style={{ width: 34, height: 34 }}
              >
                <Icon name="chevronLeft" size={16} />
              </button>
              <span style={{ flex: 1, textAlign: "center", font: "600 19px/1 var(--font-heading)" }}>{year}</span>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                aria-label="Next year"
                onClick={() => setYear((y) => y + 1)}
                style={{ width: 34, height: 34 }}
              >
                <Icon name="chevronLeft" size={16} style={{ transform: "rotate(180deg)" }} />
              </button>
            </div>

            {/* Month */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {MONTHS.map((m, i) => {
                const active = i === anchorMonth && year === anchorYear;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => go(iso(year, i, clampDay(year, i, anchorDay)))}
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

            {/* Exact day */}
            <label style={{ display: "block", marginTop: 16 }}>
              <span style={{ display: "block", fontSize: 12, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 6 }}>
                Or pick a day
              </span>
              <input
                type="date"
                className="input"
                defaultValue={anchor}
                onChange={(e) => {
                  if (e.target.value) go(e.target.value);
                }}
              />
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-secondary"
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

/** Horizontal date rail. The server renders the days; this only makes the
 * rail scroll and brings the selected day into view on load, so swiping
 * through weeks needs no round trip. */
export function DateRail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-selected='true']");
    if (!el || !ref.current) return;
    ref.current.scrollLeft = el.offsetLeft - ref.current.clientWidth / 2 + el.clientWidth / 2;
  }, []);

  return (
    <div ref={ref} className="cal-rail">
      {children}
    </div>
  );
}

/** Vertical month scroller — consecutive months in one continuous column,
 * opened at the month being looked at. */
export function MonthScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-anchor-month='true']");
    if (!el || !ref.current) return;
    ref.current.scrollTop = el.offsetTop - ref.current.offsetTop;
  }, []);

  return (
    <div ref={ref} className="cal-months">
      {children}
    </div>
  );
}
