"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";

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

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className={className} style={style}>
        {icon && <Icon name={icon} size={15} />}
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="kin-glass-bar"
            style={{
              width: "100%",
              maxWidth: 520,
              height: "92vh",
              display: "flex",
              flexDirection: "column",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderTop: "1px solid var(--glass-border)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ padding: "10px 18px 8px", flex: "none" }}>
              <div style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 12px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, font: "600 19px/1.2 var(--font-heading)" }}>{title}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn btn-secondary btn-icon"
                  style={{ width: 32, height: 32 }}
                  aria-label="Close"
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
            </div>

            {/* The long content scrolls; the header above it does not. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>{children}</div>
          </div>
        </div>
      )}
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
        {meta && <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)", fontWeight: 400 }}>{meta}</span>}
      </summary>
      <div style={{ padding: "2px 0 10px" }}>{children}</div>
    </details>
  );
}
