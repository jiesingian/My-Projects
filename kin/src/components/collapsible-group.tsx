"use client";

import { useState } from "react";

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
        <span
          aria-hidden
          style={{ fontSize: "var(--text-sm)", color: "var(--color-neutral-600)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
        >
          ▾
        </span>
      </button>
      {open && children}
    </div>
  );
}
