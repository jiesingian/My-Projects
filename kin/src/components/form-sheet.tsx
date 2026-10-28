"use client";

import { useId } from "react";
import { Icon } from "@/components/icons";
import { AnimatedSheet } from "@/components/animated-sheet";
import { usePinnedActions } from "@/components/sheet-actions";

/** A form that opens over the page instead of unfolding under whatever was
 * last on it (Janine, 12 October: Add account opening under the E-wallet
 * group read as part of it). The same sheet on a phone and a computer; the
 * component keeps its own open state and passes it in.
 *
 * 92dvh, not 92vh: on an iPhone vh is the screen with Safari's bars hidden,
 * so a tall sheet's top -- where its first field is -- sat above the visible
 * page (Janine, 12 October: "Add breakfast", the search box out of sight).
 * And nothing inside one focuses itself on open: the keyboard rising while
 * the sheet is still sliding in pushes the sheet off the top of the screen.
 *
 * `guardUnsaved={false}` for a sheet with nothing to save, a calculator: a
 * "Discard what you've entered?" on closing one reads as if it saved. */
export function FormSheet({ open, onClose, title, children, guardUnsaved = true }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; guardUnsaved?: boolean }) {
  const titleId = useId();
  const body = usePinnedActions<HTMLDivElement>();
  return (
    <AnimatedSheet open={open} onClose={onClose} labelledBy={titleId} panelClassName="sheet-panel--full kin-form-sheet" panelStyle={{ maxHeight: "92dvh" }} guardUnsaved={guardUnsaved}>
      <div style={{ padding: "0.625rem 1.125rem 0.5rem", flex: "none" }}>
        <div className="sheet-grabber" style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 12px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span id={titleId} style={{ flex: 1, font: "600 1.1875rem/1.2 var(--font-heading)" }}>
            {title}
          </span>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="Close">
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>
      <div ref={body} className="kin-sheet-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0.25rem 1.125rem calc(env(safe-area-inset-bottom, 0) + 1.25rem)" }}>
        {children}
      </div>
    </AnimatedSheet>
  );
}
