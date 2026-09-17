"use client";

import { useEffect, useRef, useState } from "react";

/** The mount-timing dance every bottom sheet in this app needs, in one
 * place instead of three slightly different copies of it.
 *
 * A CSS transition can't animate an element that unmounts the instant it
 * closes, and can't animate one that mounts already at its open value --
 * so this stays mounted through the close transition, and mounts closed,
 * then flips to open a frame later. `open` is the caller's source of
 * truth throughout; nothing here holds its own idea of whether the sheet
 * should be open. */
export function AnimatedSheet({
  open,
  onClose,
  labelledBy,
  describedBy,
  role = "dialog",
  panelClassName = "",
  panelStyle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  panelClassName?: string;
  panelStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [trackedOpen, setTrackedOpen] = useState(open);
  const [entered, setEntered] = useState(false);
  const restoreFocus = useRef<HTMLElement | null>(null);

  // React's documented pattern for deriving state from a changing prop
  // during render (not an effect): `open` can flip back to true before the
  // close transition's onTransitionEnd ever fires, so an effect keyed on
  // `open` would miss the re-open. This can't, because it runs every render.
  if (open !== trackedOpen) {
    setTrackedOpen(open);
    if (open) setMounted(true);
  }

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    // Mount closed, open on the next frame -- the transition needs a
    // painted "before" value to animate away from.
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) restoreFocus.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  const showing = open && entered;

  return (
    <div className="sheet-backdrop" data-open={showing} onClick={onClose}>
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !showing) {
            setMounted(false);
            setEntered(false);
          }
        }}
        className={`sheet-panel kin-glass-bar ${panelClassName}`}
        style={panelStyle}
        data-open={showing}
      >
        {children}
      </div>
    </div>
  );
}
