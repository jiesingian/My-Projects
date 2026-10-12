"use client";

import { useId } from "react";
import { Icon } from "@/components/icons";
import { AnimatedSheet } from "@/components/animated-sheet";

/** A form that opens over the page instead of unfolding under whatever was
 * last on it (Janine, 12 October: Add account opening under the E-wallet
 * group read as part of it). The same sheet on a phone and a computer; the
 * component keeps its own open state and passes it in. */
export function FormSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) {
  const titleId = useId();
  return (
    <AnimatedSheet open={open} onClose={onClose} labelledBy={titleId} panelClassName="sheet-panel--full kin-form-sheet" panelStyle={{ maxWidth: 520, maxHeight: "92vh" }}>
      <div style={{ padding: "0.625rem 1.125rem 0.5rem", flex: "none" }}>
        <div style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 12px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span id={titleId} style={{ flex: 1, font: "600 1.1875rem/1.2 var(--font-heading)" }}>
            {title}
          </span>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="Close">
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0.25rem 1.125rem calc(env(safe-area-inset-bottom, 0) + 1.25rem)" }}>{children}</div>
    </AnimatedSheet>
  );
}
