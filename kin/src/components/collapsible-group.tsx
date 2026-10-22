"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/** GroupLabel's clickable sibling -- same weight, same border, but a group
 * this big (Assets, Liabilities, a whole Cash Flow section) benefits from
 * being tucked away by default, so a tab reads as its headline numbers
 * first and its detail only on request. */
export function CollapsibleGroup({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          all: "unset",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          cursor: "pointer",
          boxSizing: "border-box",
          font: "600 var(--text-xl)/1.1 var(--font-heading)",
          letterSpacing: "-.01em",
          margin: "var(--space-7) 0 var(--space-1)",
          paddingBottom: "0.5625rem",
          borderBottom: "2px solid var(--color-divider)",
          color: "var(--color-text)",
        }}
      >
        {title}
        {/* The same chevron as Today's fold, not a text glyph. */}
        <span aria-hidden className="kin-chevron" data-open={open}>
          <Icon name="chevronLeft" size={16} />
        </span>
      </button>
      {open && children}
    </div>
  );
}
