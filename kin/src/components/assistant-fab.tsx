"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { AssistantConsole } from "@/components/assistant-console";

/** Ask Kin, from anywhere. It rides above the tab bar on every page, the way
 * a help button does elsewhere, instead of taking the top of Today. */
export function AssistantFab({ memberName }: { memberName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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

  // The family thread has its own composer down there; two things reaching
  // for the same corner is one too many.
  if (pathname.startsWith("/chat")) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="kin-fab" aria-haspopup="dialog" aria-expanded={open} aria-label="Ask Kin">
        <Icon name="sparkle" size={22} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ask Kin"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="kin-glass-bar"
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "88vh",
              overflowY: "auto",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderTop: "1px solid var(--glass-border)",
              padding: "10px 18px calc(env(safe-area-inset-bottom, 0px) + 18px)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 12px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ flex: 1, font: "600 19px/1.2 var(--font-heading)" }}>Ask Kin</span>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="Close">
                <Icon name="x" size={15} />
              </button>
            </div>
            <AssistantConsole memberName={memberName} />
          </div>
        </div>
      )}
    </>
  );
}
