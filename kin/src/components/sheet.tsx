"use client";

import { useId, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { AnimatedSheet } from "@/components/animated-sheet";

/** A button that opens a bottom sheet over the page. The contents are passed
 * in as children, so a server component can render them and this only has to
 * handle the opening and closing. */
export function SheetButton({
  label,
  title,
  icon,
  className = "btn btn-secondary",
  style,
  children,
}: {
  label: string;
  title: string;
  icon?: IconName;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className={className} style={style}>
        {icon && <Icon name={icon} size={15} />}
        {label}
      </button>

      <AnimatedSheet open={open} onClose={() => setOpen(false)} labelledBy={titleId} panelClassName="sheet-panel--full" panelStyle={{ maxWidth: 520, height: "92vh" }}>
        <div style={{ padding: "0.625rem 1.125rem 0.5rem", flex: "none" }}>
          <div style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 12px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span id={titleId} style={{ flex: 1, font: "600 1.1875rem/1.2 var(--font-heading)" }}>
              {title}
            </span>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="Close">
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>

        {/* The long content scrolls; the header above it does not. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0.25rem 1.125rem calc(env(safe-area-inset-bottom, 0) + 1.25rem)" }}>{children}</div>
      </AnimatedSheet>
    </>
  );
}

/** A group that folds away. Uses the browser's own disclosure element, so it
 * works without JavaScript, is keyboard-operable and announces its state to
 * a screen reader for free. */
export function Collapsible({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="kin-fold">
      <summary>
        <Icon name="chevronLeft" size={14} className="kin-fold-mark" />
        <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
        {meta && <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", fontWeight: 400 }}>{meta}</span>}
      </summary>
      <div style={{ padding: "0.125rem 0 0.625rem" }}>{children}</div>
    </details>
  );
}
