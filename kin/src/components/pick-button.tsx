"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

export type PickOption = { label: string; href: string; active: boolean };

const LONG_PRESS_MS = 450;

/** A one-button filter: tap it and it steps to the next value, press the
 * chevron — or hold it, which is what a thumb does — and every value is
 * there to choose from. One control instead of a row of chips that grows
 * with the family, and the same control whether the pointer is a mouse or a
 * finger. */
export function PickButton({
  label,
  options,
  title,
  icon,
  style,
}: {
  label: string;
  options: PickOption[];
  /** What the menu is for, read out and shown above the list. */
  title: string;
  icon?: "users" | "calendarDays";
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const index = Math.max(0, options.findIndex((o) => o.active));
  const next = options[(index + 1) % options.length];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const startHold = () => {
    held.current = false;
    timer.current = setTimeout(() => {
      held.current = true;
      setOpen(true);
    }, LONG_PRESS_MS);
  };
  const endHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <div ref={wrap} style={{ position: "relative", flex: "none", ...style }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`${title}: ${label}. Tap for ${next?.label ?? label}, hold for all.`}
          style={{
            minHeight: 34,
            fontSize: 13,
            padding: icon ? "0 7px 0 9px" : "0 10px",
            gap: 5,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            maxWidth: 150,
          }}
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          // A hold has already opened the list; the click that ends it must
          // not also step to the next value.
          onClick={() => {
            if (held.current) {
              held.current = false;
              return;
            }
            if (next) router.push(next.href);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
        >
          {icon && <Icon name={icon} size={14} style={{ color: "var(--color-neutral-600)" }} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        </button>

        {/* The dropdown half: a mouse presses this, a thumb can too. */}
        <button
          type="button"
          className="btn btn-secondary"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Choose ${title.toLowerCase()}`}
          style={{
            minHeight: 34,
            width: 26,
            padding: 0,
            marginLeft: 1,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
          }}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="chevronLeft" size={13} style={{ transform: "rotate(-90deg)", color: "var(--color-neutral-600)" }} />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          aria-label={title}
          className="kin-glass-bar"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            // Hung from the left edge: these buttons sit at the left of their
            // row, and a menu wider than its button would otherwise open off
            // the side of the screen.
            left: 0,
            zIndex: 50,
            minWidth: 176,
            maxHeight: 280,
            overflowY: "auto",
            padding: 6,
            borderRadius: 14,
            border: "1px solid var(--color-divider)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)", padding: "4px 8px 6px" }}>
            {title}
          </div>
          {options.map((o) => (
            <button
              key={o.href}
              type="button"
              role="menuitemradio"
              aria-checked={o.active}
              onClick={() => {
                setOpen(false);
                router.push(o.href);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                minHeight: 38,
                padding: "0 8px",
                border: 0,
                borderRadius: 10,
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontSize: 14.5,
                textAlign: "left",
                background: o.active ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                color: "var(--color-text)",
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
              {o.active && <Icon name="check" size={14} style={{ color: "var(--color-accent)", flex: "none" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
