"use client";

import { Icon } from "@/components/icons";
import { AssistantConsole } from "@/components/assistant-console";
import { AnimatedSheet } from "@/components/animated-sheet";

/** The Ask Kin sheet, split from its button (assistant-fab) so it loads the
 * first time someone opens it rather than with every page. */
export function AssistantSheet({ open, onClose, titleId, memberName, start }: { open: boolean; onClose: () => void; titleId: string; memberName: string; start: "chat" | "voice" | undefined }) {
  return (
    <AnimatedSheet
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="sheet-panel--full"
      panelStyle={{ maxHeight: "88vh", overflowY: "auto", padding: "0.625rem 1.125rem calc(env(safe-area-inset-bottom, 0px) + 1.125rem)" }}
    >
      <div className="sheet-grabber" style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 12px" }} />
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span id={titleId} style={{ flex: 1, font: "600 1.1875rem/1.2 var(--font-heading)" }}>
          Ask Kin
        </span>
        <button type="button" onClick={onClose} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="Close">
          <Icon name="x" size={15} />
        </button>
      </div>
      <AssistantConsole key={start ?? "plain"} memberName={memberName} start={start} />
    </AnimatedSheet>
  );
}
