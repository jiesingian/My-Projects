"use client";

import { useId, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { AssistantConsole } from "@/components/assistant-console";
import { AnimatedSheet } from "@/components/animated-sheet";

/** Ask Kin, from anywhere. It rides above the tab bar on every page, the way
 * a help button does elsewhere, instead of taking the top of Today. */
export function AssistantFab({ memberName }: { memberName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const titleId = useId();

  // The family thread has its own composer down there; two things reaching
  // for the same corner is one too many.
  if (pathname.startsWith("/chat")) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="kin-fab" aria-haspopup="dialog" aria-expanded={open} aria-label="Ask Kin">
        <Icon name="sparkle" size={22} />
      </button>

      <AnimatedSheet
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        panelClassName="sheet-panel--full"
        panelStyle={{ maxWidth: 520, maxHeight: "88vh", overflowY: "auto", padding: "0.625rem 1.125rem calc(env(safe-area-inset-bottom, 0px) + 1.125rem)" }}
      >
        <div style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 12px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <span id={titleId} style={{ flex: 1, font: "600 1.1875rem/1.2 var(--font-heading)" }}>
            Ask Kin
          </span>
          <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="Close">
            <Icon name="x" size={15} />
          </button>
        </div>
        <AssistantConsole memberName={memberName} />
      </AnimatedSheet>
    </>
  );
}
