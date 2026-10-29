"use client";

import { useState, useSyncExternalStore } from "react";
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
        className="kin-tap"
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

/** A small eyebrow heading (RECENT ACTIVITY) that folds its list away when
 * tapped and back when tapped again. Open by default; the choice is
 * remembered on this device under `storageKey`, so a list someone keeps
 * folded stays folded. */
export function FoldableSection({
  label,
  storageKey,
  swatch,
  right,
  level = 1,
  remember = true,
  defaultOpen = true,
  children,
}: {
  label: string;
  storageKey: string;
  /** false: start as `defaultOpen` on every visit instead of as the viewer
   * last left it -- a breakdown opens folded each time (Janine, 26 October). */
  remember?: boolean;
  defaultOpen?: boolean;
  swatch?: string;
  /** Figures for the group, right-aligned in the same columns as its rows
   * (a breakdown's amount and share). */
  right?: React.ReactNode;
  /** 2: a group inside a group -- indented, a step smaller. */
  level?: 1 | 2;
  children: React.ReactNode;
}) {
  const remembered = useSyncExternalStore(
    subscribeFold,
    () => readFold(storageKey),
    () => true,
  );
  const [local, setLocal] = useState(defaultOpen);
  const open = remember ? remembered : local;
  return (
    <div>
      <button
        type="button"
        className="kin-eyebrow"
        onClick={() => (remember ? writeFold(storageKey, !open) : setLocal(!open))}
        aria-expanded={open}
        style={{
          all: "unset",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          cursor: "pointer",
          margin: level === 2 ? "10px 0 4px" : "20px 0 8px",
          paddingLeft: level === 2 ? "0.75rem" : 0,
          ...(right ? { width: "100%" } : null),
        }}
      >
        {/* A chart's colour for this group, beside its name (never alone). */}
        {swatch && <i aria-hidden="true" style={{ width: level === 2 ? 8 : 10, height: level === 2 ? 8 : 10, borderRadius: 3, background: swatch, flex: "none" }} />}
        <span className="kin-eyebrow" style={level === 2 ? { fontSize: "0.6875rem", ...(right ? { flex: 1, minWidth: 0 } : null) } : right ? { flex: 1, minWidth: 0 } : undefined}>
          {label}
        </span>
        {right}
        <span aria-hidden className="kin-chevron" data-open={open}>
          <Icon name="chevronLeft" size={14} />
        </span>
      </button>
      {open && children}
    </div>
  );
}

const foldListeners = new Set<() => void>();
const foldFallback = new Map<string, boolean>();

function readFold(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "closed";
  } catch {
    // Storage unavailable (a private window): remembered while the page is open.
    return foldFallback.get(key) ?? true;
  }
}

function writeFold(key: string, open: boolean) {
  foldFallback.set(key, open);
  try {
    localStorage.setItem(key, open ? "open" : "closed");
  } catch {
    // Kept in memory only.
  }
  foldListeners.forEach((l) => l());
}

function subscribeFold(listener: () => void) {
  foldListeners.add(listener);
  return () => foldListeners.delete(listener);
}
